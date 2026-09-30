import type { AppState, Dataset, DatasetLifecycleResolution } from '../../domain.ts'
import type { MasteryRotationState } from '../../warmup/adaptive/contracts.ts'
import type { VersionedChildMasteryState, WarmupAttempt, WarmupGraphPoint, WarmupTransition, WarmupTransitionReceipt, WarmupVisit } from '../../warmup/visits/contracts.ts'
import { decodeCloudWarmupVisits } from '../../persistence/warmup/cloudCodec.ts'
import type { CloudWarmupQueueEntry, CloudWarmupRotation, CloudWarmupVisit } from '../../persistence/warmup/cloudContracts.ts'
import type { PendingWarmupCommit } from '../../persistence/warmup/pendingJournal.ts'
import { hydrateAdaptiveWarmupCloud } from './hydration.ts'
import { recoverWarmupTransitions } from './recovery.ts'
import { markWarmupTransitionCommitted } from './state.ts'

export type WarmupCloudRecords = {
  visits: readonly CloudWarmupVisit[]
  queueEntries: readonly CloudWarmupQueueEntry[]
  mastery: readonly VersionedChildMasteryState[]
  receipts: readonly WarmupTransitionReceipt[]
  attempts: readonly WarmupAttempt[]
  graphPoints: readonly WarmupGraphPoint[]
  rotations: readonly MasteryRotationState[]
}

export type WarmupCloudTransport = {
  transitionAlreadyCommitted: (transition: WarmupTransition) => Promise<boolean>
  ensureSeed: (visit: WarmupVisit, mastery: readonly VersionedChildMasteryState[], rotations: readonly CloudWarmupRotation[]) => Promise<void>
  commitTransition: (transition: WarmupTransition) => Promise<'applied' | 'idempotent'>
  acknowledgeTransition: (transitionId: string) => void
}

export async function synchronizeAdaptiveWarmupCloud(input: {
  state: AppState
  childId: string
  grade: string
  schoolYear: string
  datasets: readonly Dataset[]
  lifecycleResolution: DatasetLifecycleResolution
  records: WarmupCloudRecords
  pending: readonly PendingWarmupCommit[]
  hydratedAt: string
  transport: WarmupCloudTransport
}): Promise<AppState> {
  const decoded = decodeCloudWarmupVisits(input.records.visits, input.records.queueEntries)
  let state = hydrateAdaptiveWarmupCloud({
    state: input.state,
    childId: input.childId,
    grade: input.grade,
    schoolYear: input.schoolYear,
    datasets: input.datasets,
    lifecycleResolution: input.lifecycleResolution,
    mastery: input.records.mastery,
    visits: decoded.visits,
    sourceIssues: decoded.issues,
    receipts: input.records.receipts,
    attempts: input.records.attempts,
    graphPoints: input.records.graphPoints,
    rotations: input.records.rotations,
    hydratedAt: input.hydratedAt,
  })

  const childPending = input.pending
    .filter((entry) => entry.baseVisit.childId === input.childId)
    .sort((left, right) => left.transition.expectedVisitRevision - right.transition.expectedVisitRevision
      || left.transition.transitionId.localeCompare(right.transition.transitionId))
  for (const entry of childPending) {
    if (await input.transport.transitionAlreadyCommitted(entry.transition)) {
      input.transport.acknowledgeTransition(entry.transition.transitionId)
      state = markWarmupTransitionCommitted(state, entry.transition.transitionId)
      continue
    }
    const rotations = (state.adaptiveWarmup?.rotationStates || [])
      .filter((rotation) => rotation.childId === input.childId && rotation.activityModule === entry.baseVisit.activityModule)
    await input.transport.ensureSeed(entry.baseVisit, entry.baseMastery ? [entry.baseMastery] : [], rotations)
    const recovered = recoverWarmupTransitions(state, [entry])
    if (recovered.status === 'blocked') throw new Error(`Pending Warmup transition could not be restored: ${recovered.reason}`)
    await input.transport.commitTransition(entry.transition)
    input.transport.acknowledgeTransition(entry.transition.transitionId)
    state = markWarmupTransitionCommitted(recovered.state, entry.transition.transitionId)
  }
  return state
}
