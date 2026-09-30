import type { VersionedChildMasteryState, WarmupTransition, WarmupTransitionReceipt, WarmupVisit } from '../../warmup/visits/contracts.ts'
import { encodeChangedCloudWarmupQueueEntry, encodeCloudWarmupVisit } from './cloudCodec.ts'
import type { CloudWarmupRotation, WarmupCloudRecordWrite } from './cloudContracts.ts'

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  return JSON.stringify(value)
}

export function sameWarmupCloudRecord(left: unknown, right: unknown) {
  return canonicalJson(left) === canonicalJson(right)
}

export function warmupReceiptMatchesTransition(receipt: WarmupTransitionReceipt, transition: WarmupTransition) {
  return receipt.visitId === transition.visitId
    && receipt.transitionId === transition.transitionId
    && receipt.payloadFingerprint === transition.payloadFingerprint
    && receipt.operation === transition.operation
    && receipt.queueEntryId === transition.queueEntryId
    && receipt.expectedVisitRevision === transition.expectedVisitRevision
    && receipt.appliedVisitRevision === transition.nextVisitRevision
    && receipt.expectedMasteryRevision === transition.expectedMasteryRevision
    && receipt.appliedMasteryRevision === transition.nextMasteryRevision
    && receipt.masteryStateId === transition.nextMastery?.state.id
    && receipt.attemptId === transition.attempt?.id
    && receipt.graphPointId === transition.graphPoint?.id
    && receipt.appliedAt === transition.occurredAt
}

function record(
  collection: WarmupCloudRecordWrite['collection'],
  id: string,
  value: unknown,
  precondition: WarmupCloudRecordWrite['precondition'],
): WarmupCloudRecordWrite {
  return { collection, id, value: value as Record<string, unknown>, precondition }
}

export function buildWarmupSeedRecordWrites(
  childId: string,
  visit: WarmupVisit,
  mastery: readonly VersionedChildMasteryState[],
  rotations: readonly CloudWarmupRotation[],
) {
  if (visit.childId !== childId || mastery.some((item) => item.state.childId !== childId) || rotations.some((item) => item.childId !== childId)) throw new Error('The Warmup seed contains another child’s state.')
  const encoded = encodeCloudWarmupVisit(visit)
  return [
    record('warmupVisits', visit.id, encoded.visit, 'create'),
    ...encoded.queueEntries.map((entry) => record('warmupQueueEntries', entry.id, entry, 'create')),
    ...mastery.map((item) => record('warmupMastery', item.state.id, item, 'create')),
    ...rotations.map((item) => record('warmupRotations', item.id, item, 'create')),
  ]
}

export function reconcileWarmupSeedRecord(write: WarmupCloudRecordWrite, existing: unknown): WarmupCloudRecordWrite | null {
  if (existing === null || existing === undefined) return write
  if (sameWarmupCloudRecord(existing, write.value)) return null
  if (write.collection === 'warmupRotations') {
    const previous = existing as Partial<CloudWarmupRotation>
    const next = write.value as Partial<CloudWarmupRotation>
    if (previous.id === next.id
      && previous.childId === next.childId
      && previous.activityModule === next.activityModule
      && next.cycle === Number(previous.cycle) + 1) return { ...write, precondition: 'update' }
  }
  const label = write.collection === 'warmupMastery' ? 'mastery' : 'seed'
  throw new Error(`Cloud Warmup ${label} ${write.id} conflicts with saved progress.`)
}

export function buildWarmupTransitionRecordWrites(childId: string, transition: WarmupTransition) {
  const receipt = transition.nextVisit.lastAppliedTransition
  if (!receipt || !warmupReceiptMatchesTransition(receipt, transition)) throw new Error('The cloud commit does not contain the exact applied Warmup receipt.')
  if (transition.nextVisit.childId !== childId || transition.nextVisit.id !== transition.visitId || transition.nextVisit.revision !== transition.nextVisitRevision) throw new Error('The cloud Warmup transition identity or revision is inconsistent.')
  if (transition.nextMastery?.state.childId !== undefined && transition.nextMastery.state.childId !== childId) throw new Error('The cloud Warmup mastery state belongs to another child.')
  const encoded = encodeCloudWarmupVisit(transition.nextVisit)
  const writes: WarmupCloudRecordWrite[] = [
    record('warmupVisits', transition.visitId, encoded.visit, 'update'),
    record('warmupTransitions', transition.transitionId, receipt, 'create'),
  ]
  if (transition.queueEntryId) writes.push(record(
    'warmupQueueEntries',
    transition.queueEntryId,
    encodeChangedCloudWarmupQueueEntry(transition.nextVisit, transition.queueEntryId),
    'update',
  ))
  if (transition.nextMastery) writes.push(record('warmupMastery', transition.nextMastery.state.id, transition.nextMastery, 'update'))
  if (transition.attempt) writes.push(record('warmupAttempts', transition.attempt.id, transition.attempt, 'create'))
  if (transition.graphPoint) writes.push(record('warmupGraphPoints', transition.graphPoint.id, transition.graphPoint, 'update'))
  return writes
}
