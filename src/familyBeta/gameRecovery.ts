import { gameScopeKey, retireGameCheckpoint, type GameCheckpoint, type GameScope } from '../ninjaSkills/progress.ts'
import {
  browserGameWriteLock,
  createGameProgressStore,
  type GameStorage,
  type GameWriteLock,
} from '../ninjaSkills/progressStore.ts'

/** A live browser lock, not a timestamp lease. Closing/crashing the owning
 * document releases it automatically; another live window cannot steal it. */
export function acquireGameView(
  familyId: string,
  scope: GameScope,
  locks: Pick<LockManager, 'request'> | null | undefined = globalThis.navigator?.locks,
): Promise<() => void> {
  if (!locks)
    return Promise.reject(new Error('This browser cannot safely coordinate saved games. No work was changed.'))
  return new Promise((resolve, reject) => {
    void locks
      .request(`ninja-game-view-v1:${familyId}:${gameScopeKey(scope)}`, { ifAvailable: true }, async (lock) => {
        if (!lock) {
          reject(
            new Error(
              'This saved game is open in another window. Continue there, or close it and retry here. Your saved turns are unchanged.',
            ),
          )
          return
        }
        await new Promise<void>((release) => resolve(release))
      })
      .catch(reject)
  })
}

/** The parent can retire an unopened frame without trusting code in that frame.
 * The exact clicked snapshot, family scope and live-view ownership are rechecked
 * under the same storage lock used by normal game writes and synchronization. */
export async function discardUnopenedGame(options: {
  storage: GameStorage
  familyId: string
  scope: GameScope
  expected: GameCheckpoint | null
  stillOwner: () => boolean
  now: () => string
  acquire?: typeof acquireGameView
  write?: GameWriteLock
}) {
  const { storage, familyId, scope, expected, stillOwner, now } = options
  const release = await (options.acquire || acquireGameView)(familyId, scope)
  try {
    await (options.write || browserGameWriteLock)(`ninja-game-storage-v1:${familyId}`, () => {
      if (!stillOwner()) throw new Error('The game owner changed. No saved work was discarded.')
      const store = createGameProgressStore(storage, familyId)
      if (!expected) {
        if (store.checkpoint(scope)) throw new Error('Saved work changed while closing. Reopen it before discarding.')
        return
      }
      if (gameScopeKey(expected.scope) !== gameScopeKey(scope)) throw new Error('The saved game scope changed.')
      const retirement = store.retirement(scope, expected.runId) || retireGameCheckpoint(expected, now())
      store.discardCheckpoint(expected, retirement)
    })
  } finally {
    release()
  }
}
