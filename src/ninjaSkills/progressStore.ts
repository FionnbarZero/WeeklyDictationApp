import {
  completeGameCheckpoint,
  gameCheckpointComplete,
  gameScopeKey,
  serializeGameRecord,
  validateGameCheckpoint,
  validateGameCompletion,
  GAME_PROGRESS_BYTES,
  type GameCheckpoint,
  type GameCompletion,
  type GameScope,
} from './progress.ts'

export type GameStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>
export const GAME_CHECKPOINT_LIMIT = 64
export const GAME_COMPLETION_LIMIT = 500
const safeId = (id: string) => {
  if (!/^[\w-]{1,160}$/.test(id)) throw new Error('Invalid game storage owner.')
  return id
}

/** A separate namespace leaves old aggregate/practice readers untouched.
 * Writes are confirmed before callers advance. No pruning or implicit resets.
 * Browser integration must serialize mutations with one origin-wide write
 * lease: localStorage itself does not provide atomic cross-tab compare/swap. */
export function createGameProgressStore(storage: GameStorage, familyId: string) {
  const prefix = `family-beta-games-v1:${safeId(familyId)}:`
  const checkpointKey = (scope: GameScope) => `${prefix}checkpoint:${encodeURIComponent(gameScopeKey(scope))}`
  const completedPrefix = (childId: string) => `${prefix}completed:${safeId(childId)}:`
  const pendingPrefix = (childId: string) => `${prefix}pending:${safeId(childId)}:`
  function read<T>(key: string, validate: (value: T) => T): T | null {
    const raw = storage.getItem(key)
    if (raw === null) return null
    if (new TextEncoder().encode(raw).length > GAME_PROGRESS_BYTES)
      throw new Error('Saved game exceeds the safe loading limit.')
    return validate(JSON.parse(raw))
  }
  function confirm(key: string, value: unknown) {
    const raw = serializeGameRecord(value)
    storage.setItem(key, raw)
    if (storage.getItem(key) !== raw)
      throw new Error('Game saving could not be confirmed. Keep this activity open and retry.')
  }
  function storageKeys() {
    const keys: string[] = []
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index)
      if (key?.startsWith(prefix)) keys.push(key)
    }
    return keys
  }
  function checkpoint(scope: GameScope) {
    const value = read(checkpointKey(scope), validateGameCheckpoint)
    if (value && gameScopeKey(value.scope) !== gameScopeKey(scope))
      throw new Error('Saved game belongs to a different activity.')
    return value
  }
  function checkpoints(childId: string) {
    safeId(childId)
    const values: GameCheckpoint[] = []
    for (const key of storageKeys().filter((key) => key.startsWith(`${prefix}checkpoint:`))) {
      const scope = JSON.parse(decodeURIComponent(key.slice(`${prefix}checkpoint:`.length))) as GameScope
      gameScopeKey(scope)
      if (scope.childId !== childId) continue
      const value = checkpoint(scope)
      if (value) values.push(value)
      if (values.length > GAME_CHECKPOINT_LIMIT)
        throw new Error('Too many retained game activities. Saved work was preserved.')
    }
    return values
  }
  function completions(childId: string, pendingOnly = false) {
    const records = new Map<string, GameCompletion>()
    for (const key of storageKeys().filter(
      (key) => key.startsWith(completedPrefix(childId)) || key.startsWith(pendingPrefix(childId)),
    )) {
      const value = read(key, validateGameCompletion)
      if (!value) continue
      if (
        value.result.childId !== childId ||
        key !==
          `${key.startsWith(pendingPrefix(childId)) ? pendingPrefix(childId) : completedPrefix(childId)}${value.result.id}`
      )
        throw new Error('Saved game result has an invalid owner or identity.')
      const previous = records.get(value.result.id)
      if (previous && serializeGameRecord(previous) !== serializeGameRecord(value))
        throw new Error('Contradictory copies of a completed game were preserved. No score was replaced.')
      records.set(value.result.id, value)
      if (records.size > GAME_COMPLETION_LIMIT)
        throw new Error('Game result history exceeds its safe loading limit. All records were preserved.')
    }
    return [...records.values()].filter(
      (value) => !pendingOnly || storage.getItem(`${pendingPrefix(childId)}${value.result.id}`) !== null,
    )
  }
  function saveCompletion(value: GameCompletion, queue = true) {
    validateGameCompletion(value)
    const previous = completions(value.result.childId)
    const existing = previous.find((record) => record.result.id === value.result.id)
    if (existing && serializeGameRecord(existing) !== serializeGameRecord(value))
      throw new Error('Completed game identity conflict. Both attempts were preserved; no result was overwritten.')
    if (!existing && previous.length >= GAME_COMPLETION_LIMIT)
      throw new Error('Game result history is full. No records were removed.')
    // A failed second write still leaves a discoverable, immutable retry record.
    if (queue) confirm(`${pendingPrefix(value.result.childId)}${safeId(value.result.id)}`, value)
    confirm(`${completedPrefix(value.result.childId)}${safeId(value.result.id)}`, value)
  }
  function saveCheckpoint(value: GameCheckpoint, expected: GameCheckpoint | null, allowed: () => boolean = () => true) {
    if (!allowed()) throw new Error('Game checkpoint replacement is no longer allowed.')
    validateGameCheckpoint(value)
    const current = checkpoint(value.scope)
    if (serializeGameRecord(current) !== serializeGameRecord(expected))
      throw new Error('This game changed in another tab. The newer checkpoint was preserved.')
    if (!current && checkpoints(value.scope.childId).length >= GAME_CHECKPOINT_LIMIT)
      throw new Error('Too many retained game activities. No work was discarded.')
    if (
      gameCheckpointComplete(value) &&
      !completions(value.scope.childId).some(
        (completion) =>
          completion.result.id === value.attemptId &&
          serializeGameRecord(completion.checkpoint) === serializeGameRecord(value),
      )
    )
      throw new Error('Save the immutable completion before replacing the final game checkpoint.')
    confirm(checkpointKey(value.scope), value)
  }
  return {
    checkpoint,
    checkpoints,
    completions,
    saveCompletion,
    saveCheckpoint,
    finishCheckpoint(value: GameCheckpoint, expected: GameCheckpoint | null) {
      // Last reviewed-answer time gives retries the identical completion time.
      const completion = completeGameCheckpoint(value, value.reviewedAt!)
      saveCompletion(completion)
      saveCheckpoint(value, expected)
      return completion
    },
    acknowledgeCompletion(value: GameCompletion) {
      // Only call after an identical authorized server readback. Cache first so
      // a crash between the two writes cannot erase the only durable copy.
      saveCompletion(value, false)
      const key = `${pendingPrefix(value.result.childId)}${value.result.id}`
      const queued = read(key, validateGameCompletion)
      if (queued && serializeGameRecord(queued) === serializeGameRecord(value)) storage.removeItem(key)
    },
  }
}

type LocalGameStore = ReturnType<typeof createGameProgressStore>
export type GameProgressStore = Omit<
  LocalGameStore,
  'saveCheckpoint' | 'saveCompletion' | 'acknowledgeCompletion' | 'finishCheckpoint'
> & {
  saveCheckpoint: (...args: Parameters<LocalGameStore['saveCheckpoint']>) => void | Promise<void>
  saveCompletion: (...args: Parameters<LocalGameStore['saveCompletion']>) => void | Promise<void>
  acknowledgeCompletion: (value: GameCompletion) => void | Promise<void>
  finishCheckpoint: (
    ...args: Parameters<LocalGameStore['finishCheckpoint']>
  ) => GameCompletion | Promise<GameCompletion>
}

export type GameWriteLock = <T>(name: string, operation: () => T | Promise<T>) => Promise<T>
export const browserGameWriteLock: GameWriteLock = (name, operation) => {
  if (typeof navigator === 'undefined' || !navigator.locks)
    return Promise.reject(
      new Error('This browser cannot safely coordinate saved games across tabs. No records were changed.'),
    )
  return navigator.locks.request(name, { mode: 'exclusive' }, operation)
}

/** Only this serialized adapter should be connected to browser game screens.
 * Check the current owner inside the lock, not merely before waiting for it. */
export function createLockedGameProgressStore(
  storage: GameStorage,
  familyId: string,
  stillOwner: () => boolean,
  lock: GameWriteLock = browserGameWriteLock,
): GameProgressStore {
  const store = createGameProgressStore(storage, familyId)
  const write = <T>(operation: () => T) =>
    lock(`ninja-game-storage-v1:${safeId(familyId)}`, () => {
      if (!stillOwner()) throw new Error('The game storage owner changed. Saved work was preserved.')
      return operation()
    })
  return {
    checkpoint: store.checkpoint,
    checkpoints: store.checkpoints,
    completions: store.completions,
    saveCheckpoint: (...args) => write(() => store.saveCheckpoint(...args)),
    saveCompletion: (...args) => write(() => store.saveCompletion(...args)),
    finishCheckpoint: (...args) => write(() => store.finishCheckpoint(...args)),
    acknowledgeCompletion: (...args) => write(() => store.acknowledgeCompletion(...args)),
  }
}
