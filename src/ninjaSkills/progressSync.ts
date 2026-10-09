import {
  gameCheckpointComplete,
  gameScopeKey,
  reconcileGameCheckpoints,
  serializeGameRecord,
  validateGameCheckpoint,
  validateGameCompletion,
  type GameCheckpoint,
  type GameCompletion,
  type GameScope,
} from './progress.ts'
import type { GameProgressStore } from './progressStore.ts'

/** Backend boundary deliberately separate from betaResults/betaPractice.
 * The production adapter must enforce family ownership, immutable completions,
 * conditional checkpoint writes and bounded pagination before activation. */
export type GameProgressRemote = {
  saveCompletion(value: GameCompletion): Promise<GameCompletion>
  readCompletion(childId: string, attemptId: string): Promise<GameCompletion | null>
  readCheckpoint(scope: GameScope): Promise<{ value: GameCheckpoint; version: string; serverTime: string } | null>
  writeCheckpoint(
    value: GameCheckpoint,
    expectedVersion: string | null,
  ): Promise<{ value: GameCheckpoint; version: string }>
}

export async function syncGameProgress(options: {
  store: GameProgressStore
  remote: GameProgressRemote
  childId: string
  scopes: readonly GameScope[]
  stillOwner: () => boolean
  canReplaceCheckpoint: (scope: GameScope) => boolean
}) {
  const { store, remote, childId, stillOwner, canReplaceCheckpoint } = options
  // Upload every distinct completion first. An unfinished conflict must never
  // strand an already completed score. The adapter must reject mismatched IDs.
  for (const pending of store.completions(childId, true)) {
    if (!stillOwner()) return
    const saved = validateGameCompletion(await remote.saveCompletion(pending))
    if (!stillOwner()) return
    if (serializeGameRecord(saved) !== serializeGameRecord(pending))
      throw new Error('Cloud game confirmation differs. This completed attempt remains queued.')
    await store.acknowledgeCompletion(pending)
  }
  if (options.scopes.length > 64) throw new Error('Too many game activities requested for syncing.')
  const seen = new Set<string>()
  for (const scope of options.scopes) {
    const scopeKey = gameScopeKey(scope)
    if (scope.childId !== childId) throw new Error('Game sync child scope mismatch.')
    if (seen.has(scopeKey)) continue
    seen.add(scopeKey)
    if (!stillOwner()) return
    const local = store.checkpoint(scope)
    const online = await remote.readCheckpoint(scope)
    if (!stillOwner()) return
    if (online) {
      validateGameCheckpoint(online.value)
      if (
        gameScopeKey(online.value.scope) !== scopeKey ||
        !online.version ||
        !Number.isFinite(Date.parse(online.serverTime))
      )
        throw new Error('Online game checkpoint scope/version failed validation.')
    }
    // The network wait may overlap another answer, timer update or tab write.
    // Never acknowledge or apply the stale snapshot from before that wait.
    if (serializeGameRecord(store.checkpoint(scope)) !== serializeGameRecord(local)) continue
    const winner =
      local && online ? reconcileGameCheckpoints(local, online.value, online.serverTime) : local || online?.value
    if (!winner) continue
    if (online && serializeGameRecord(winner) === serializeGameRecord(online.value)) {
      if (serializeGameRecord(local) !== serializeGameRecord(winner)) {
        if (!canReplaceCheckpoint(scope)) continue
        if (gameCheckpointComplete(winner)) {
          const completion = await remote.readCompletion(childId, winner.attemptId)
          if (!stillOwner()) return
          if (
            !completion ||
            serializeGameRecord(validateGameCompletion(completion).checkpoint) !== serializeGameRecord(winner)
          )
            throw new Error('The completed checkpoint has no matching immutable result. Local work was preserved.')
          await store.saveCompletion(completion, false)
          if (!stillOwner()) return
          if (
            !canReplaceCheckpoint(scope) ||
            serializeGameRecord(store.checkpoint(scope)) !== serializeGameRecord(local)
          )
            continue
        }
        await store.saveCheckpoint(winner, local, () => stillOwner() && canReplaceCheckpoint(scope))
      }
      continue
    }
    if (!stillOwner()) return
    const uploaded = await remote.writeCheckpoint(winner, online?.version || null)
    if (!stillOwner()) return
    validateGameCheckpoint(uploaded.value)
    if (!uploaded.version || serializeGameRecord(uploaded.value) !== serializeGameRecord(winner))
      throw new Error('Cloud game checkpoint confirmation differs. Local progress was preserved.')
    // No local mutation on upload: a newer answer written during the request
    // remains authoritative locally and is sent on the next pass.
  }
}
