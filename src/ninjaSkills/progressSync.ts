import {
  gameCheckpointComplete,
  gameScopeKey,
  reconcileGameCheckpoints,
  serializeGameRecord,
  validateGameCheckpoint,
  validateGameCompletion,
  validateGameRetirement,
  type GameCheckpoint,
  type GameCompletion,
  type GameScope,
  type GameRetirement,
} from './progress.ts'
import type { GameProgressStore } from './progressStore.ts'

/** Backend boundary deliberately separate from betaResults/betaPractice.
 * The production adapter must enforce family ownership, immutable completions,
 * conditional checkpoint writes and bounded pagination before activation. */
export type GameProgressRemote = {
  saveCompletion(value: GameCompletion): Promise<GameCompletion>
  readCompletion(childId: string, attemptId: string): Promise<GameCompletion | null>
  readCheckpoint(scope: GameScope): Promise<{
    value: GameCheckpoint
    version: string
    serverTime: string
  } | null>
  writeCheckpoint(
    value: GameCheckpoint,
    expectedVersion: string | null,
  ): Promise<{ value: GameCheckpoint; version: string }>
  saveRetirement(value: GameRetirement): Promise<GameRetirement>
  readRetirement(scope: GameScope, runId: string): Promise<GameRetirement | null>
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
    const localRetirement = store.retirement(scope)
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
    if (
      serializeGameRecord(store.checkpoint(scope)) !== serializeGameRecord(local) ||
      serializeGameRecord(store.retirement(scope)) !== serializeGameRecord(localRetirement)
    ) continue
    // Retirement records are immutable and per run. They remain enforceable
    // after a newer run replaces the scope's current checkpoint.
    if (localRetirement) {
      if (online?.value.runId === localRetirement.runId && gameCheckpointComplete(online.value)) {
        const completion = await remote.readCompletion(childId, online.value.attemptId)
        if (!stillOwner()) return
        if (
          !completion ||
          serializeGameRecord(validateGameCompletion(completion).checkpoint) !== serializeGameRecord(online.value)
        )
          throw new Error('The completed checkpoint has no matching immutable result. The discard remains queued.')
        await store.saveCompletion(completion, false)
      }
      if (
        !stillOwner() ||
        serializeGameRecord(store.retirement(scope)) !== serializeGameRecord(localRetirement)
      )
        continue
      const saved = validateGameRetirement(await remote.saveRetirement(localRetirement))
      if (!stillOwner()) return
      if (serializeGameRecord(saved) !== serializeGameRecord(localRetirement))
        throw new Error('Cloud game retirement differs. The discarded run remains queued.')
      await store.acknowledgeRetirement(localRetirement)
      continue
    }

    let localCheckpoint = local
    if (localCheckpoint) {
      const retirement = await remote.readRetirement(scope, localCheckpoint.runId)
      if (!stillOwner()) return
      if (retirement) {
        validateGameRetirement(retirement)
        if (
          gameScopeKey(retirement.scope) !== scopeKey ||
          retirement.runId !== localCheckpoint.runId
        )
          throw new Error('Online game retirement identity failed validation.')
        if (
          serializeGameRecord(store.checkpoint(scope)) !== serializeGameRecord(local) ||
          !canReplaceCheckpoint(scope)
        )
          continue
        await store.applyRemoteRetirement(retirement)
        continue
      }
    }

    let onlineCheckpoint = online?.value
    if (onlineCheckpoint && onlineCheckpoint.runId !== localCheckpoint?.runId) {
      const retirement = await remote.readRetirement(scope, onlineCheckpoint.runId)
      if (!stillOwner()) return
      if (retirement) {
        validateGameRetirement(retirement)
        if (
          gameScopeKey(retirement.scope) !== scopeKey ||
          retirement.runId !== onlineCheckpoint.runId
        )
          throw new Error('Online game retirement identity failed validation.')
        onlineCheckpoint = undefined
      }
    }
    if (serializeGameRecord(store.checkpoint(scope)) !== serializeGameRecord(local)) continue
    const winner =
      localCheckpoint && onlineCheckpoint
        ? reconcileGameCheckpoints(localCheckpoint, onlineCheckpoint, online!.serverTime)
        : localCheckpoint || onlineCheckpoint
    if (!winner) continue
    if (online && serializeGameRecord(winner) === serializeGameRecord(onlineCheckpoint)) {
      if (serializeGameRecord(localCheckpoint) !== serializeGameRecord(winner)) {
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
            serializeGameRecord(store.checkpoint(scope)) !== serializeGameRecord(localCheckpoint)
          )
            continue
        }
        await store.saveCheckpoint(winner, localCheckpoint, () => stillOwner() && canReplaceCheckpoint(scope))
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
