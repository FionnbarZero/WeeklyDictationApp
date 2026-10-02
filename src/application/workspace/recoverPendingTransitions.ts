import { filterDatasetsForChild, type AppState } from '../../domain.ts'
import { markAcquisitionCheckpointCommitted, recoverAcquisitionCheckpoints } from '../acquisitionPersistence.ts'
import { synchronizeAdaptiveWarmupCloud } from '../warmup/index.ts'
import { throwIfWorkspaceSynchronizationAborted } from './cancellation.ts'
import type { ChildWorkspaceRecords, ChildWorkspaceScope, PendingTransitionRecoveryPort } from './contracts.ts'

export async function recoverPendingTransitions(input: {
  state: AppState
  records: ChildWorkspaceRecords
  scope: ChildWorkspaceScope
  recovery: PendingTransitionRecoveryPort
  synchronizedAt: Date
  signal: AbortSignal
}) {
  let state = input.state
  const pendingAcquisition = input.recovery.readPendingAcquisition()
  if (pendingAcquisition.error) throw new Error(pendingAcquisition.error)
  const childPending = pendingAcquisition.entries
    .filter((entry) => entry.baseEnvelope.childId === input.scope.childId)
    .sort(
      (left, right) =>
        left.checkpoint.expectedRevision - right.checkpoint.expectedRevision ||
        left.checkpoint.transitionId.localeCompare(right.checkpoint.transitionId),
    )

  for (const entry of childPending) {
    throwIfWorkspaceSynchronizationAborted(input.signal)
    const checkpoint = entry.checkpoint
    if (await input.recovery.acquisitionAlreadyCommitted(input.scope, checkpoint)) {
      input.recovery.acknowledgeAcquisition(checkpoint.transitionId)
      state = markAcquisitionCheckpointCommitted(state, checkpoint.transitionId)
      continue
    }
    const recovered = recoverAcquisitionCheckpoints(state, [entry])
    if (recovered.status === 'blocked') {
      throw new Error(`Pending Acquisition transition could not be restored: ${recovered.reason}`)
    }
    const envelope = (recovered.state.acquisitionProgressEnvelopes || []).find(
      (candidate) => candidate.id === checkpoint.progressionId,
    )
    if (!envelope) {
      throw new Error(`Pending Acquisition transition ${checkpoint.transitionId} did not restore its progression.`)
    }
    await input.recovery.commitAcquisitionCheckpoint(input.scope, envelope, checkpoint)
    input.recovery.acknowledgeAcquisition(checkpoint.transitionId)
    state = markAcquisitionCheckpointCommitted(recovered.state, checkpoint.transitionId)
  }

  throwIfWorkspaceSynchronizationAborted(input.signal)
  const scopedDatasets = filterDatasetsForChild(input.records.datasets, input.scope.grade, input.scope.schoolYear)
  const lifecycleResolution = input.recovery.resolveLifecycle(input.scope, scopedDatasets, input.synchronizedAt)
  if (!lifecycleResolution) return state

  const pendingWarmup = input.recovery.readPendingWarmup()
  if (pendingWarmup.error) throw new Error(pendingWarmup.error)
  state = await synchronizeAdaptiveWarmupCloud({
    state,
    childId: input.scope.childId,
    grade: input.scope.grade,
    schoolYear: input.scope.schoolYear,
    datasets: scopedDatasets,
    lifecycleResolution,
    records: input.records.warmup,
    pending: pendingWarmup.entries,
    hydratedAt: input.synchronizedAt.toISOString(),
    transport: {
      transitionAlreadyCommitted: (transition) =>
        input.recovery.warmupTransitionAlreadyCommitted(input.scope, transition),
      ensureSeed: (visit, mastery, rotations) =>
        input.recovery.ensureWarmupSeed(input.scope, visit, mastery, rotations),
      commitTransition: (transition) => input.recovery.commitWarmupTransition(input.scope, transition),
      acknowledgeTransition: input.recovery.acknowledgeWarmup,
    },
  })
  throwIfWorkspaceSynchronizationAborted(input.signal)
  return state
}
