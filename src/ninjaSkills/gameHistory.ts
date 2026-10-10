import {
  gameScopeKey,
  validateGameCheckpoint,
  validateGameCompletion,
  type GameCheckpoint,
  type GameCompletion,
  type GameScope,
} from './progress.ts'
import {
  GAME_CHECKPOINT_LIMIT,
  GAME_COMPLETION_LIMIT,
  type GameProgressStore,
} from './progressStore.ts'
import { syncGameProgress, type GameProgressRemote } from './progressSync.ts'

export type GameHistoryRemote = GameProgressRemote & {
  listCheckpointPage(
    childId: string,
    cursor?: string,
  ): Promise<{ checkpoints: GameCheckpoint[]; nextPageToken: string }>
  listCompletionPage(
    childId: string,
    cursor?: string,
  ): Promise<{ completions: GameCompletion[]; nextPageToken: string }>
}

async function collectPages<T>(options: {
  load: (cursor: string) => Promise<{ values: T[]; nextPageToken: string }>
  maximum: number
  identity: (value: T) => string
  stillOwner: () => boolean
}) {
  const values: T[] = []
  const identities = new Set<string>()
  const cursors = new Set<string>()
  let cursor = ''
  while (true) {
    if (!options.stillOwner()) throw new Error('The game account changed. Device records were preserved.')
    if (cursors.has(cursor)) throw new Error('Game history pagination repeated. Device records were preserved.')
    cursors.add(cursor)
    const page = await options.load(cursor)
    if (!options.stillOwner()) throw new Error('The game account changed. Device records were preserved.')
    if (!Array.isArray(page.values) || typeof page.nextPageToken !== 'string')
      throw new Error('Game history page failed validation.')
    for (const value of page.values) {
      const identity = options.identity(value)
      if (identities.has(identity)) throw new Error('Game history contains a duplicate record.')
      identities.add(identity)
      values.push(value)
      if (values.length > options.maximum)
        throw new Error('Game history exceeds the safe loading limit. Existing records were preserved.')
    }
    if (!page.nextPageToken) return values
    cursor = page.nextPageToken
  }
}

/** Stage and validate every bounded page before touching device storage. The
 * caller may catch connection failures and continue from the already saved
 * device copy; a partial cloud page never becomes a coverage cursor. */
export async function reconcileGameHistory(options: {
  store: GameProgressStore
  remote: GameHistoryRemote
  childId: string
  stillOwner: () => boolean
  canReplaceCheckpoint: (scope: GameScope) => boolean
}) {
  const { store, remote, childId, stillOwner } = options
  const localScopes = [...store.checkpoints(childId), ...store.retirements(childId)].map((value) => value.scope)
  const hadDevice = localScopes.length > 0 || store.completions(childId).length > 0
  const [remoteCheckpoints, remoteCompletions] = await Promise.all([
    collectPages({
      load: async (cursor) => {
        const page = await remote.listCheckpointPage(childId, cursor)
        return { values: page.checkpoints, nextPageToken: page.nextPageToken }
      },
      maximum: GAME_CHECKPOINT_LIMIT,
      identity: (value) => {
        validateGameCheckpoint(value)
        if (value.scope.childId !== childId) throw new Error('Game history child scope differs.')
        return gameScopeKey(value.scope)
      },
      stillOwner,
    }),
    collectPages({
      load: async (cursor) => {
        const page = await remote.listCompletionPage(childId, cursor)
        return { values: page.completions, nextPageToken: page.nextPageToken }
      },
      maximum: GAME_COMPLETION_LIMIT,
      identity: (value) => {
        validateGameCompletion(value)
        if (value.result.childId !== childId) throw new Error('Game history child scope differs.')
        return value.result.id
      },
      stillOwner,
    }),
  ])
  if (!stillOwner()) throw new Error('The game account changed. Device records were preserved.')
  for (const completion of remoteCompletions) {
    if (!stillOwner()) throw new Error('The game account changed. Device records were preserved.')
    await store.saveCompletion(completion, false)
  }
  const scopes = new Map<string, GameScope>()
  for (const scope of [...localScopes, ...remoteCheckpoints.map((value) => value.scope)])
    scopes.set(gameScopeKey(scope), scope)
  await syncGameProgress({ ...options, scopes: [...scopes.values()] })
  const hasCloud = remoteCheckpoints.length > 0 || remoteCompletions.length > 0
  return {
    source: hasCloud ? (hadDevice ? ('device-and-cloud' as const) : ('cloud' as const)) : ('device' as const),
    scopes: [...scopes.values()],
    completionCount: store.completions(childId).length,
  }
}

