import type {
  AdaptiveWarmupProfile,
  AdaptiveWarmupSelection,
  ChildMasteryState,
  MasteryLifecycleAssignment,
  MasteryTermDefinition,
} from '../adaptive/contracts.ts'
import { isMasteryTermSuppressed } from '../adaptive/eligibility.ts'
import { applyAdaptiveWarmupAssessment } from '../adaptive/transitions.ts'
import {
  WARMUP_VISIT_CONTRACT_ID,
  WARMUP_VISIT_SCHEMA_VERSION,
  type VersionedChildMasteryState,
  type WarmupGraphPoint,
  type WarmupPromptSnapshot,
  type WarmupTransition,
  type WarmupTransitionApplyResult,
  type WarmupTransitionReceipt,
  type WarmupVisit,
  type WarmupVisitQueueEntry,
} from './contracts.ts'
import {
  stableWarmupSerialization,
  warmupAttemptId,
  warmupGraphPointId,
  warmupQueueEntryId,
  warmupTransitionFingerprint,
  warmupTransitionId,
} from './identity.ts'

function canonicalTimestamp(value: string) {
  return Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}

function localDateAt(value: string, timeZone = 'America/Los_Angeles') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(value))
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${fields.year}-${fields.month}-${fields.day}`
}

function nextPendingPosition(queue: readonly WarmupVisitQueueEntry[], start = 0) {
  const index = queue.findIndex((entry, position) => position >= start && entry.status === 'pending')
  return index < 0 ? queue.length : index
}

function graphPoint(visit: WarmupVisit): WarmupGraphPoint | undefined {
  if (visit.attemptedCount === 0) return undefined
  return {
    id: warmupGraphPointId(visit.id),
    visitId: visit.id,
    childId: visit.childId,
    localDate: localDateAt(visit.createdAt),
    grade: visit.grade,
    activityModule: visit.activityModule,
    visitType: visit.visitType,
    configuredMaximum: visit.configuredMaximum,
    assignedQueueSize: visit.assignedQueueSize,
    attemptedCount: visit.attemptedCount,
    correctCount: visit.correctCount,
    percent: visit.percent,
    status: visit.status === 'completed' ? 'completed' : 'partial',
    updatedAt: visit.updatedAt,
  }
}

export function createWarmupVisit(input: {
  id: string
  childId: string
  grade: string
  schoolYear: string
  profile: AdaptiveWarmupProfile
  selection: AdaptiveWarmupSelection
  tier: WarmupVisit['tier']
  language: WarmupVisit['language']
  promptForEntry: (masteryTermId: string, occurrenceIds: readonly string[]) => WarmupPromptSnapshot
  createdAt: string
  associatedPrimaryActivity?: WarmupVisit['associatedPrimaryActivity']
}): WarmupVisit {
  if (!input.id || !input.childId || !canonicalTimestamp(input.createdAt)) throw new Error('Warmup visit identity or timestamp is invalid.')
  if (input.selection.profile.id !== input.profile.id || input.selection.profile.version !== input.profile.version) throw new Error('Warmup selection profile does not match the visit profile.')
  const queue = input.selection.entries.map((entry, position) => ({
    id: warmupQueueEntryId(input.id, position, entry.masteryTermId),
    position,
    masteryTermId: entry.masteryTermId,
    sourceBucket: entry.sourceBucket,
    occurrenceIds: [...entry.occurrenceIds],
    prompt: input.promptForEntry(entry.masteryTermId, entry.occurrenceIds),
    status: 'pending' as const,
  }))
  return {
    schemaVersion: WARMUP_VISIT_SCHEMA_VERSION,
    contractId: WARMUP_VISIT_CONTRACT_ID,
    id: input.id,
    childId: input.childId,
    grade: input.grade,
    schoolYear: input.schoolYear,
    activityModule: input.profile.activityModule,
    tier: input.tier,
    language: input.language,
    visitType: input.selection.visitType,
    profile: input.selection.profile,
    ...(input.associatedPrimaryActivity ? { associatedPrimaryActivity: input.associatedPrimaryActivity } : {}),
    configuredMaximum: input.selection.configuredMaximum,
    assignedQueueSize: queue.length,
    queue,
    nextPosition: nextPendingPosition(queue),
    rotationCycle: input.selection.rotationCycle,
    revision: 0,
    status: queue.length === 0 ? 'completed' : 'in-progress',
    attemptedCount: 0,
    correctCount: 0,
    percent: 0,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    ...(queue.length === 0 ? { finalizedAt: input.createdAt } : {}),
  }
}

function buildTransition(
  transition: Omit<WarmupTransition, 'payloadFingerprint'>,
): WarmupTransition {
  return { ...transition, payloadFingerprint: warmupTransitionFingerprint(transition) }
}

export function buildWarmupAnswerTransition(input: {
  visit: WarmupVisit
  mastery: VersionedChildMasteryState
  profile: AdaptiveWarmupProfile
  correct: boolean
  revealMethod: 'timer' | 'skip_timer' | 'show_answer'
  occurredAt: string
}): WarmupTransition {
  if (input.visit.status !== 'in-progress') throw new Error('Only an in-progress Warmup visit can accept an answer.')
  if (!canonicalTimestamp(input.occurredAt)) throw new Error('Warmup answer timestamp is invalid.')
  const entry = input.visit.queue[input.visit.nextPosition]
  if (!entry || entry.status !== 'pending') throw new Error('The Warmup visit has no pending entry to answer.')
  if (input.mastery.state.masteryTermId !== entry.masteryTermId || input.mastery.state.childId !== input.visit.childId) throw new Error('The Warmup mastery state does not own the pending queue entry.')
  const expectedVisitRevision = input.visit.revision
  const expectedMasteryRevision = input.mastery.revision
  const transitionId = warmupTransitionId(input.visit.id, expectedVisitRevision, 'answer', entry.id)
  const attemptId = warmupAttemptId(transitionId)
  const nextMasteryState = applyAdaptiveWarmupAssessment(
    input.mastery.state,
    { outcome: input.correct ? 'correct' : 'incorrect', reviewedAt: input.occurredAt },
    input.visit.rotationCycle,
    input.profile,
  )
  const queue = input.visit.queue.map((candidate) => candidate.id === entry.id
    ? { ...candidate, status: 'answered' as const, attemptId }
    : candidate)
  const nextPosition = nextPendingPosition(queue, input.visit.nextPosition + 1)
  const attemptedCount = input.visit.attemptedCount + 1
  const correctCount = input.visit.correctCount + (input.correct ? 1 : 0)
  const completed = nextPosition >= queue.length
  const nextVisitBase: WarmupVisit = {
    ...input.visit,
    queue,
    nextPosition,
    revision: expectedVisitRevision + 1,
    status: completed ? 'completed' : 'in-progress',
    attemptedCount,
    correctCount,
    percent: Math.round((correctCount / attemptedCount) * 100),
    updatedAt: input.occurredAt,
    ...(completed ? { finalizedAt: input.occurredAt } : {}),
  }
  const receipt: WarmupTransitionReceipt = {
    visitId: input.visit.id,
    transitionId,
    payloadFingerprint: '',
    operation: 'answer',
    queueEntryId: entry.id,
    expectedVisitRevision,
    appliedVisitRevision: expectedVisitRevision + 1,
    expectedMasteryRevision,
    appliedMasteryRevision: expectedMasteryRevision + 1,
    masteryStateId: input.mastery.state.id,
    attemptId,
    graphPointId: warmupGraphPointId(input.visit.id),
    appliedAt: input.occurredAt,
  }
  const attempt = {
    id: attemptId,
    visitId: input.visit.id,
    transitionId,
    childId: input.visit.childId,
    queueEntryId: entry.id,
    queuePosition: entry.position,
    masteryTermId: entry.masteryTermId,
    sourceBucket: entry.sourceBucket,
    sourceOccurrenceIds: entry.occurrenceIds,
    wordId: entry.prompt.wordId,
    datasetId: entry.prompt.datasetId,
    correct: input.correct,
    revealMethod: input.revealMethod,
    reviewedAt: input.occurredAt,
  } as const
  const nextGraphPoint = graphPoint(nextVisitBase)
  const withoutFingerprint: Omit<WarmupTransition, 'payloadFingerprint'> = {
    contractId: WARMUP_VISIT_CONTRACT_ID,
    visitId: input.visit.id,
    transitionId,
    operation: 'answer',
    queueEntryId: entry.id,
    expectedVisitRevision,
    nextVisitRevision: expectedVisitRevision + 1,
    expectedMasteryRevision,
    nextMasteryRevision: expectedMasteryRevision + 1,
    occurredAt: input.occurredAt,
    correct: input.correct,
    revealMethod: input.revealMethod,
    nextVisit: nextVisitBase,
    nextMastery: { revision: expectedMasteryRevision + 1, state: nextMasteryState },
    attempt,
    graphPoint: nextGraphPoint,
  }
  const transition = buildTransition(withoutFingerprint)
  const appliedReceipt = { ...receipt, payloadFingerprint: transition.payloadFingerprint }
  return {
    ...transition,
    nextVisit: { ...nextVisitBase, lastAppliedTransition: appliedReceipt },
    nextMastery: { revision: expectedMasteryRevision + 1, state: nextMasteryState, lastAppliedTransition: appliedReceipt },
  }
}

export function buildWarmupUnavailableTransition(input: {
  visit: WarmupVisit
  terms: readonly MasteryTermDefinition[]
  lifecycleAssignments: readonly MasteryLifecycleAssignment[]
  occurredAt: string
}): WarmupTransition | null {
  if (input.visit.status !== 'in-progress') return null
  const entry = input.visit.queue[input.visit.nextPosition]
  if (!entry || entry.status !== 'pending') return null
  const term = input.terms.find((candidate) => candidate.id === entry.masteryTermId)
  if (!term) throw new Error('The pending Warmup term is unavailable from the canonical mastery model.')
  const suppressed = isMasteryTermSuppressed(
    term,
    input.lifecycleAssignments,
    { grade: input.visit.grade, schoolYear: input.visit.schoolYear },
  )
  if (!suppressed) return null
  if (!canonicalTimestamp(input.occurredAt)) throw new Error('Warmup unavailable transition timestamp is invalid.')
  const expectedVisitRevision = input.visit.revision
  const transitionId = warmupTransitionId(input.visit.id, expectedVisitRevision, 'mark-unavailable', entry.id)
  const queue = input.visit.queue.map((candidate) => candidate.id === entry.id
    ? { ...candidate, status: 'unavailable' as const, unavailableReason: 'active-curriculum-occurrence' as const }
    : candidate)
  const nextPosition = nextPendingPosition(queue, input.visit.nextPosition + 1)
  const completed = nextPosition >= queue.length
  const nextVisitBase: WarmupVisit = {
    ...input.visit,
    queue,
    nextPosition,
    revision: expectedVisitRevision + 1,
    status: completed ? 'completed' : 'in-progress',
    updatedAt: input.occurredAt,
    ...(completed ? { finalizedAt: input.occurredAt } : {}),
  }
  const nextGraphPoint = graphPoint(nextVisitBase)
  const withoutFingerprint: Omit<WarmupTransition, 'payloadFingerprint'> = {
    contractId: WARMUP_VISIT_CONTRACT_ID,
    visitId: input.visit.id,
    transitionId,
    operation: 'mark-unavailable',
    queueEntryId: entry.id,
    expectedVisitRevision,
    nextVisitRevision: expectedVisitRevision + 1,
    occurredAt: input.occurredAt,
    nextVisit: nextVisitBase,
    graphPoint: nextGraphPoint,
  }
  const transition = buildTransition(withoutFingerprint)
  const receipt: WarmupTransitionReceipt = {
    visitId: input.visit.id,
    transitionId,
    payloadFingerprint: transition.payloadFingerprint,
    operation: 'mark-unavailable',
    queueEntryId: entry.id,
    expectedVisitRevision,
    appliedVisitRevision: expectedVisitRevision + 1,
    ...(nextGraphPoint ? { graphPointId: nextGraphPoint.id } : {}),
    appliedAt: input.occurredAt,
  }
  return { ...transition, nextVisit: { ...nextVisitBase, lastAppliedTransition: receipt } }
}

export function buildWarmupFinalizationTransition(input: {
  visit: WarmupVisit
  operation: 'finalize-partial' | 'skip'
  occurredAt: string
}): WarmupTransition {
  if (input.visit.status !== 'in-progress') throw new Error('Only an in-progress Warmup visit can be finalized.')
  if (!canonicalTimestamp(input.occurredAt)) throw new Error('Warmup finalization timestamp is invalid.')
  if (input.operation === 'skip' && input.visit.attemptedCount !== 0) throw new Error('A started Warmup must be finalized as partial, not skipped.')
  if (input.operation === 'finalize-partial' && input.visit.attemptedCount === 0) throw new Error('A partial Warmup requires at least one completed assessment.')
  const expectedVisitRevision = input.visit.revision
  const transitionId = warmupTransitionId(input.visit.id, expectedVisitRevision, input.operation)
  const nextVisitBase: WarmupVisit = {
    ...input.visit,
    revision: expectedVisitRevision + 1,
    status: input.operation === 'skip' ? 'skipped' : 'partial',
    updatedAt: input.occurredAt,
    finalizedAt: input.occurredAt,
  }
  const nextGraphPoint = graphPoint(nextVisitBase)
  const withoutFingerprint: Omit<WarmupTransition, 'payloadFingerprint'> = {
    contractId: WARMUP_VISIT_CONTRACT_ID,
    visitId: input.visit.id,
    transitionId,
    operation: input.operation,
    expectedVisitRevision,
    nextVisitRevision: expectedVisitRevision + 1,
    occurredAt: input.occurredAt,
    nextVisit: nextVisitBase,
    graphPoint: nextGraphPoint,
  }
  const transition = buildTransition(withoutFingerprint)
  const receipt: WarmupTransitionReceipt = {
    visitId: input.visit.id,
    transitionId,
    payloadFingerprint: transition.payloadFingerprint,
    operation: input.operation,
    expectedVisitRevision,
    appliedVisitRevision: expectedVisitRevision + 1,
    ...(nextGraphPoint ? { graphPointId: nextGraphPoint.id } : {}),
    appliedAt: input.occurredAt,
  }
  return { ...transition, nextVisit: { ...nextVisitBase, lastAppliedTransition: receipt } }
}

function transitionWithoutFingerprint(transition: WarmupTransition): Omit<WarmupTransition, 'payloadFingerprint'> {
  const { payloadFingerprint: _fingerprint, ...rest } = transition
  return rest
}

export function applyWarmupTransition(
  visit: WarmupVisit,
  transition: WarmupTransition,
  currentMastery?: VersionedChildMasteryState,
  existingReceipt?: WarmupTransitionReceipt,
): WarmupTransitionApplyResult {
  if (transition.contractId !== WARMUP_VISIT_CONTRACT_ID
    || transition.visitId !== visit.id
    || transition.nextVisit.id !== visit.id
    || transition.nextVisitRevision !== transition.expectedVisitRevision + 1
    || transition.payloadFingerprint !== warmupTransitionFingerprint(transitionWithoutFingerprint(transition))) {
    return { status: 'conflict', reason: 'Warmup transition contract or payload is invalid.', visit }
  }
  if (existingReceipt) {
    return existingReceipt.payloadFingerprint === transition.payloadFingerprint
      ? { status: 'idempotent', visit }
      : { status: 'conflict', reason: 'The Warmup transition ID was reused with a different payload.', visit }
  }
  if (visit.revision !== transition.expectedVisitRevision) return { status: 'conflict', reason: 'The Warmup visit revision is stale.', visit }
  if (transition.nextMastery) {
    if (!currentMastery || currentMastery.revision !== transition.expectedMasteryRevision) return { status: 'conflict', reason: 'The child mastery revision is stale.', visit }
    if (transition.nextMastery.revision !== transition.nextMasteryRevision || transition.nextMasteryRevision !== (transition.expectedMasteryRevision || 0) + 1) return { status: 'conflict', reason: 'The child mastery revision step is invalid.', visit }
  }
  const receipt = transition.nextVisit.lastAppliedTransition
  if (!receipt || receipt.transitionId !== transition.transitionId || receipt.payloadFingerprint !== transition.payloadFingerprint) return { status: 'conflict', reason: 'The Warmup visit receipt is missing or inconsistent.', visit }
  if (transition.attempt && (!transition.queueEntryId || transition.attempt.transitionId !== transition.transitionId || transition.attempt.queueEntryId !== transition.queueEntryId)) return { status: 'conflict', reason: 'The Warmup attempt is inconsistent with the transition.', visit }
  if (transition.graphPoint && transition.graphPoint.visitId !== visit.id) return { status: 'conflict', reason: 'The Warmup graph point is inconsistent with the visit.', visit }
  return { status: 'applied', visit: transition.nextVisit, mastery: transition.nextMastery, receipt, attempt: transition.attempt, graphPoint: transition.graphPoint }
}

export function sameWarmupTransition(left: WarmupTransition, right: WarmupTransition) {
  return stableWarmupSerialization(left) === stableWarmupSerialization(right)
}
