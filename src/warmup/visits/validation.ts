import type { AdaptiveWarmupProfileRegistry, ChildMasteryState } from '../adaptive/contracts.ts'
import { profileDefinition, validateAdaptiveWarmupProfileRegistry } from '../adaptive/profileValidation.ts'
import {
  WARMUP_VISIT_CONTRACT_ID,
  WARMUP_VISIT_SCHEMA_VERSION,
  type VersionedChildMasteryState,
  type WarmupAttempt,
  type WarmupGraphPoint,
  type WarmupTransition,
  type WarmupTransitionReceipt,
  type WarmupVisit,
} from './contracts.ts'
import {
  stableWarmupSerialization,
  warmupAttemptId,
  warmupGraphPointId,
  warmupQueueEntryId,
  warmupTransitionFingerprint,
  warmupTransitionId,
} from './identity.ts'
import { buildWarmupAnswerTransition, buildWarmupFinalizationTransition } from './reducer.ts'

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}

function nonNegativeInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0
}

function positiveInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) > 0
}

function percent(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100
}

function validChildMasteryShape(state: unknown): state is ChildMasteryState {
  return record(state)
    && state.version === 1
    && nonEmpty(state.id)
    && nonEmpty(state.childId)
    && nonEmpty(state.masteryTermId)
    && ['unassessed', 'demonstrated', 'support-needed'].includes(String(state.evidence))
    && ['recent-entry', 'needs-attention', 'mastery-rotation'].includes(String(state.bucket))
    && nonNegativeInteger(state.consecutiveCorrect)
    && record(state.schedulingProfile)
    && nonEmpty(state.schedulingProfile.id)
    && positiveInteger(state.schedulingProfile.version)
    && nonEmpty(state.schedulingProfile.sourceOccurrenceId)
    && Array.isArray(state.integratedOccurrences)
}

export function validateVersionedChildMasteryState(
  value: unknown,
  registry: AdaptiveWarmupProfileRegistry,
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (!record(value) || !nonNegativeInteger(value.revision) || !validChildMasteryShape(value.state)) {
    return { valid: false, errors: ['The versioned child mastery state is malformed.'] }
  }
  const versioned = value as VersionedChildMasteryState
  const state = versioned.state
  if (versioned.revision === 0 && versioned.lastAppliedTransition !== undefined) errors.push('Unmodified mastery cannot contain a transition receipt.')
  if (versioned.revision > 0 && (!record(versioned.lastAppliedTransition)
    || versioned.lastAppliedTransition.operation !== 'answer'
    || versioned.lastAppliedTransition.masteryStateId !== state.id
    || versioned.lastAppliedTransition.appliedMasteryRevision !== versioned.revision
    || !nonEmpty(versioned.lastAppliedTransition.transitionId)
    || !nonEmpty(versioned.lastAppliedTransition.payloadFingerprint))) errors.push('Modified mastery lacks its exact applied-revision receipt.')
  const profile = profileDefinition(registry, state.schedulingProfile)
  if (!profile) errors.push('The versioned child mastery state references an unavailable profile.')
  if (state.evidence === 'unassessed' && state.consecutiveCorrect !== 0) errors.push('Unassessed mastery cannot have a correct streak.')
  if (state.bucket === 'needs-attention' && (state.evidence !== 'support-needed' || state.consecutiveCorrect >= 3)) errors.push('Needs Attention mastery has an impossible evidence or streak state.')
  if (state.bucket === 'mastery-rotation' && (state.evidence !== 'demonstrated' || state.consecutiveCorrect !== 0)) errors.push('Mastery Rotation state is inconsistent.')
  if (profile && state.bucket === 'recent-entry' && state.evidence === 'demonstrated' && state.consecutiveCorrect >= profile.recentEntryPromotionCorrect) errors.push('Recent Entry mastery has already reached its promotion threshold.')
  return { valid: errors.length === 0, errors }
}

export function validateWarmupVisit(
  value: unknown,
  registry: AdaptiveWarmupProfileRegistry,
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const registryValidation = validateAdaptiveWarmupProfileRegistry(registry)
  errors.push(...registryValidation.errors)
  if (!record(value)) return { valid: false, errors: ['The Warmup visit is not an object.'] }
  if (value.schemaVersion !== WARMUP_VISIT_SCHEMA_VERSION || value.contractId !== WARMUP_VISIT_CONTRACT_ID) errors.push('The Warmup visit contract is unsupported.')
  if (!nonEmpty(value.id) || !nonEmpty(value.childId) || !nonEmpty(value.grade) || !nonEmpty(value.schoolYear) || !nonEmpty(value.activityModule)) errors.push('The Warmup visit identity is incomplete.')
  if (!['tier-1', 'tier-2', 'tier-3'].includes(String(value.tier)) || !['mandarin', 'english'].includes(String(value.language))) errors.push('The Warmup visit module metadata is invalid.')
  if (value.associatedPrimaryActivity !== undefined) {
    const activity = value.associatedPrimaryActivity
    if (!record(activity)
      || !['acquisition', 'test-review'].includes(String(activity.phase))
      || !nonEmpty(activity.datasetId)
      || ('reviewGroupId' in activity && !nonEmpty(activity.reviewGroupId))
      || ('reviewCycle' in activity && (activity.phase !== 'test-review' || !positiveInteger(activity.reviewCycle)))) {
      errors.push('The Warmup visit primary-activity identity is invalid.')
    }
  }
  if (!['standalone', 'pre-activity'].includes(String(value.visitType)) || !record(value.profile) || !nonEmpty(value.profile.id) || !positiveInteger(value.profile.version)) errors.push('The Warmup visit profile is invalid.')
  const profile = record(value.profile) && nonEmpty(value.profile.id) && positiveInteger(value.profile.version)
    ? profileDefinition(registry, { id: value.profile.id, version: Number(value.profile.version) })
    : undefined
  if (!profile || profile.grade !== value.grade || profile.activityModule !== value.activityModule) errors.push('The Warmup visit profile does not own its scope.')
  if (!positiveInteger(value.configuredMaximum) || !nonNegativeInteger(value.assignedQueueSize) || Number(value.assignedQueueSize) > Number(value.configuredMaximum)) errors.push('The Warmup visit queue size is invalid.')
  if (!Array.isArray(value.queue) || value.queue.length !== value.assignedQueueSize) errors.push('The Warmup visit queue is malformed.')
  const entryIds = new Set<string>()
  const termIds = new Set<string>()
  let answered = 0
  let correctAttempts = 0
  if (Array.isArray(value.queue)) value.queue.forEach((entry, position) => {
    if (!record(entry)
      || entry.position !== position
      || !nonEmpty(entry.id)
      || !nonEmpty(entry.masteryTermId)
      || entry.id !== warmupQueueEntryId(String(value.id), position, String(entry.masteryTermId))
      || !['recent-entry', 'needs-attention', 'mastery-rotation'].includes(String(entry.sourceBucket))
      || !Array.isArray(entry.occurrenceIds)
      || !entry.occurrenceIds.every(nonEmpty)
      || !record(entry.prompt)
      || !nonEmpty(entry.prompt.wordId)
      || !nonEmpty(entry.prompt.datasetId)
      || !nonEmpty(entry.prompt.text)
      || typeof entry.prompt.sentence !== 'string'
      || !['pending', 'answered', 'unavailable'].includes(String(entry.status))) {
      errors.push(`Warmup queue entry ${position} is malformed.`)
      return
    }
    if (entryIds.has(entry.id)) errors.push(`Warmup queue entry ${entry.id} is duplicated.`)
    if (termIds.has(entry.masteryTermId)) errors.push(`Warmup mastery term ${entry.masteryTermId} is duplicated in one ordinary visit.`)
    entryIds.add(entry.id)
    termIds.add(entry.masteryTermId)
    if (entry.status === 'answered') {
      answered += 1
      if (!nonEmpty(entry.attemptId)) errors.push(`Answered Warmup entry ${entry.id} has no attempt identity.`)
    } else if (entry.attemptId !== undefined) errors.push(`Unanswered Warmup entry ${entry.id} cannot reference an attempt.`)
    if (entry.status === 'unavailable' && entry.unavailableReason !== 'active-curriculum-occurrence') errors.push(`Unavailable Warmup entry ${entry.id} has no valid reason.`)
    if (entry.status !== 'unavailable' && entry.unavailableReason !== undefined) errors.push(`Available Warmup entry ${entry.id} cannot have an unavailable reason.`)
  })
  if (!nonNegativeInteger(value.nextPosition) || Number(value.nextPosition) > Number(value.assignedQueueSize)) errors.push('The Warmup next position is invalid.')
  if (Array.isArray(value.queue) && nonNegativeInteger(value.nextPosition)) {
    const firstPending = value.queue.findIndex((entry) => record(entry) && entry.status === 'pending')
    const expected = firstPending < 0 ? value.queue.length : firstPending
    if (value.nextPosition !== expected) errors.push('The Warmup next position does not identify the first pending entry.')
  }
  if (!positiveInteger(value.rotationCycle) || !nonNegativeInteger(value.revision)) errors.push('The Warmup visit revision or rotation cycle is invalid.')
  if (!['in-progress', 'partial', 'completed', 'skipped'].includes(String(value.status))) errors.push('The Warmup visit status is invalid.')
  if (!nonNegativeInteger(value.attemptedCount) || value.attemptedCount !== answered || !nonNegativeInteger(value.correctCount) || Number(value.correctCount) > Number(value.attemptedCount) || !percent(value.percent)) errors.push('The Warmup visit score summary is invalid.')
  correctAttempts = Number(value.correctCount)
  const expectedPercent = Number(value.attemptedCount) === 0 ? 0 : Math.round((correctAttempts / Number(value.attemptedCount)) * 100)
  if (value.percent !== expectedPercent) errors.push('The Warmup visit percentage is inconsistent.')
  const pendingCount = Array.isArray(value.queue) ? value.queue.filter((entry) => record(entry) && entry.status === 'pending').length : 0
  if (value.status === 'completed' && pendingCount > 0) errors.push('A completed Warmup visit cannot retain pending entries.')
  if (value.status === 'in-progress' && pendingCount === 0) errors.push('An in-progress Warmup visit requires a pending entry.')
  if (value.status === 'skipped' && Number(value.attemptedCount) !== 0) errors.push('A skipped Warmup visit cannot contain attempts.')
  if (value.status === 'partial' && Number(value.attemptedCount) === 0) errors.push('A partial Warmup visit requires at least one attempt.')
  if (!timestamp(value.createdAt) || !timestamp(value.updatedAt) || Date.parse(String(value.updatedAt)) < Date.parse(String(value.createdAt))) errors.push('The Warmup visit timestamps are invalid.')
  if (value.status === 'in-progress' ? value.finalizedAt !== undefined : !timestamp(value.finalizedAt)) errors.push('The Warmup finalization timestamp is inconsistent with its status.')
  return { valid: errors.length === 0, errors }
}

export function validateWarmupGraphPoint(value: unknown, visit: WarmupVisit) {
  const valid = record(value)
    && value.id === warmupGraphPointId(visit.id)
    && value.visitId === visit.id
    && value.childId === visit.childId
    && value.grade === visit.grade
    && value.activityModule === visit.activityModule
    && value.visitType === visit.visitType
    && value.configuredMaximum === visit.configuredMaximum
    && value.assignedQueueSize === visit.assignedQueueSize
    && value.attemptedCount === visit.attemptedCount
    && value.correctCount === visit.correctCount
    && value.percent === visit.percent
    && value.status === (visit.status === 'completed' ? 'completed' : 'partial')
    && timestamp(value.updatedAt)
  return { valid, errors: valid ? [] : ['The Warmup graph point does not match its visit.'] }
}

export function validateWarmupTransition(
  value: unknown,
  visit: WarmupVisit,
  mastery: VersionedChildMasteryState | undefined,
  registry: AdaptiveWarmupProfileRegistry,
) {
  const errors: string[] = []
  if (!record(value)) return { valid: false, errors: ['The Warmup transition is not an object.'] }
  const transition = value as unknown as WarmupTransition
  if (transition.contractId !== WARMUP_VISIT_CONTRACT_ID || transition.visitId !== visit.id) errors.push('The Warmup transition contract or visit identity is invalid.')
  if (!['answer', 'mark-unavailable', 'finalize-partial', 'skip'].includes(transition.operation)) errors.push('The Warmup transition operation is invalid.')
  if (!nonNegativeInteger(transition.expectedVisitRevision) || transition.nextVisitRevision !== transition.expectedVisitRevision + 1) errors.push('The Warmup transition visit revision is invalid.')
  if (transition.transitionId !== warmupTransitionId(visit.id, transition.expectedVisitRevision, transition.operation, transition.queueEntryId || transition.operation)) errors.push('The Warmup transition identity is invalid.')
  if (!timestamp(transition.occurredAt) || transition.payloadFingerprint !== warmupTransitionFingerprint((() => { const { payloadFingerprint: _fingerprint, ...rest } = transition; return rest })())) errors.push('The Warmup transition timestamp or fingerprint is invalid.')
  const visitValidation = validateWarmupVisit(transition.nextVisit, registry)
  errors.push(...visitValidation.errors)
  if (!transition.nextVisit.lastAppliedTransition || !validWarmupReceipt(transition.nextVisit.lastAppliedTransition, transition)) errors.push('The Warmup visit does not contain its exact transition receipt.')
  if (transition.operation === 'answer') {
    if (!transition.queueEntryId || typeof transition.correct !== 'boolean' || !['timer', 'skip_timer', 'show_answer'].includes(String(transition.revealMethod)) || !transition.attempt || !transition.nextMastery || transition.graphPoint === undefined) errors.push('A Warmup answer transition is incomplete.')
    if (!nonNegativeInteger(transition.expectedMasteryRevision) || transition.nextMasteryRevision !== Number(transition.expectedMasteryRevision) + 1 || mastery?.revision !== transition.expectedMasteryRevision) errors.push('The Warmup answer mastery revision is stale or invalid.')
    if (transition.nextMastery) errors.push(...validateVersionedChildMasteryState(transition.nextMastery, registry).errors)
    if (transition.nextMastery && (!transition.nextMastery.lastAppliedTransition || !validWarmupReceipt(transition.nextMastery.lastAppliedTransition, transition) || transition.nextMastery.lastAppliedTransition.masteryStateId !== transition.nextMastery.state.id)) errors.push('The Warmup mastery state does not contain its exact transition receipt.')
    if (transition.attempt && (transition.attempt.id !== warmupAttemptId(transition.transitionId) || transition.attempt.transitionId !== transition.transitionId || transition.attempt.visitId !== visit.id)) errors.push('The Warmup attempt identity is invalid.')
    const profile = profileDefinition(registry, visit.profile)
    if (profile && mastery && typeof transition.correct === 'boolean' && ['timer', 'skip_timer', 'show_answer'].includes(String(transition.revealMethod)) && timestamp(transition.occurredAt)) {
      try {
        const expected = buildWarmupAnswerTransition({
          visit,
          mastery,
          profile,
          correct: transition.correct,
          revealMethod: transition.revealMethod!,
          occurredAt: transition.occurredAt,
        })
        if (stableWarmupSerialization(expected) !== stableWarmupSerialization(transition)) errors.push('The Warmup answer transition is not the deterministic successor of its base state.')
      } catch {
        errors.push('The Warmup answer transition cannot be reconstructed from its base state.')
      }
    }
  } else if (transition.attempt || transition.nextMastery || transition.expectedMasteryRevision !== undefined || transition.nextMasteryRevision !== undefined) errors.push('A non-answer Warmup transition cannot mutate mastery or create an attempt.')
  if (transition.operation === 'finalize-partial' || transition.operation === 'skip') {
    try {
      const expected = buildWarmupFinalizationTransition({ visit, operation: transition.operation, occurredAt: transition.occurredAt })
      if (stableWarmupSerialization(expected) !== stableWarmupSerialization(transition)) errors.push('The Warmup finalization transition is not the deterministic successor of its base visit.')
    } catch {
      errors.push('The Warmup finalization transition cannot be reconstructed from its base visit.')
    }
  }
  if (transition.operation === 'mark-unavailable') {
    const pending = visit.queue[visit.nextPosition]
    const expectedQueue = visit.queue.map((entry) => entry.id === pending?.id
      ? { ...entry, status: 'unavailable' as const, unavailableReason: 'active-curriculum-occurrence' as const }
      : entry)
    const nextPosition = expectedQueue.findIndex((entry, position) => position >= visit.nextPosition + 1 && entry.status === 'pending')
    const expectedNextPosition = nextPosition < 0 ? expectedQueue.length : nextPosition
    const completed = expectedNextPosition >= expectedQueue.length
    const expectedVisit = {
      ...visit,
      queue: expectedQueue,
      nextPosition: expectedNextPosition,
      revision: visit.revision + 1,
      status: completed ? 'completed' as const : 'in-progress' as const,
      updatedAt: transition.occurredAt,
      ...(completed ? { finalizedAt: transition.occurredAt } : {}),
    }
    const { lastAppliedTransition: _expectedReceipt, ...expectedVisitWithoutReceipt } = expectedVisit
    const { lastAppliedTransition: _actualReceipt, ...actualVisitWithoutReceipt } = transition.nextVisit
    if (!pending || pending.status !== 'pending' || transition.queueEntryId !== pending.id
      || stableWarmupSerialization(expectedVisitWithoutReceipt) !== stableWarmupSerialization(actualVisitWithoutReceipt)) {
      errors.push('The unavailable-entry transition is not the deterministic successor of its base visit.')
    }
  }
  if (transition.graphPoint) errors.push(...validateWarmupGraphPoint(transition.graphPoint, transition.nextVisit).errors)
  if (transition.operation === 'skip' && transition.graphPoint) errors.push('A skipped Warmup cannot create a graph point.')
  return { valid: errors.length === 0, errors }
}

export function validWarmupReceipt(value: unknown, transition: WarmupTransition): value is WarmupTransitionReceipt {
  return record(value)
    && value.visitId === transition.visitId
    && value.transitionId === transition.transitionId
    && value.payloadFingerprint === transition.payloadFingerprint
    && value.operation === transition.operation
    && value.expectedVisitRevision === transition.expectedVisitRevision
    && value.appliedVisitRevision === transition.nextVisitRevision
    && value.expectedMasteryRevision === transition.expectedMasteryRevision
    && value.appliedMasteryRevision === transition.nextMasteryRevision
    && value.masteryStateId === transition.nextMastery?.state.id
    && value.attemptId === transition.attempt?.id
    && value.graphPointId === transition.graphPoint?.id
    && value.appliedAt === transition.occurredAt
}

export function graphPointForVisit(value: unknown, visit: WarmupVisit): value is WarmupGraphPoint {
  return validateWarmupGraphPoint(value, visit).valid
}

export function warmupAttemptForVisit(value: unknown, visit: WarmupVisit): value is WarmupAttempt {
  if (!record(value)
    || !nonEmpty(value.id)
    || !nonEmpty(value.visitId)
    || value.visitId !== visit.id
    || !nonEmpty(value.transitionId)
    || value.id !== warmupAttemptId(value.transitionId)
    || value.childId !== visit.childId
    || !nonEmpty(value.queueEntryId)
    || !nonNegativeInteger(value.queuePosition)
    || !nonEmpty(value.masteryTermId)
    || !['recent-entry', 'needs-attention', 'mastery-rotation'].includes(String(value.sourceBucket))
    || !Array.isArray(value.sourceOccurrenceIds)
    || !value.sourceOccurrenceIds.every(nonEmpty)
    || !nonEmpty(value.wordId)
    || !nonEmpty(value.datasetId)
    || typeof value.correct !== 'boolean'
    || !['timer', 'skip_timer', 'show_answer'].includes(String(value.revealMethod))
    || !timestamp(value.reviewedAt)) return false
  const entry = visit.queue[Number(value.queuePosition)]
  return Boolean(entry
    && entry.id === value.queueEntryId
    && entry.masteryTermId === value.masteryTermId
    && entry.sourceBucket === value.sourceBucket
    && entry.prompt.wordId === value.wordId
    && entry.prompt.datasetId === value.datasetId
    && entry.attemptId === value.id)
}

export function warmupReceiptForVisit(value: unknown, visit: WarmupVisit): value is WarmupTransitionReceipt {
  const valid = record(value)
    && value.visitId === visit.id
    && nonEmpty(value.transitionId)
    && nonEmpty(value.payloadFingerprint)
    && ['answer', 'mark-unavailable', 'finalize-partial', 'skip'].includes(String(value.operation))
    && nonNegativeInteger(value.expectedVisitRevision)
    && value.appliedVisitRevision === Number(value.expectedVisitRevision) + 1
    && (value.queueEntryId === undefined || nonEmpty(value.queueEntryId))
    && (value.expectedMasteryRevision === undefined || nonNegativeInteger(value.expectedMasteryRevision))
    && (value.appliedMasteryRevision === undefined || value.appliedMasteryRevision === Number(value.expectedMasteryRevision) + 1)
    && (value.masteryStateId === undefined || nonEmpty(value.masteryStateId))
    && (value.attemptId === undefined || nonEmpty(value.attemptId))
    && (value.graphPointId === undefined || nonEmpty(value.graphPointId))
    && timestamp(value.appliedAt)
  if (!valid) return false
  return value.operation === 'answer'
    ? nonEmpty(value.masteryStateId) && nonNegativeInteger(value.expectedMasteryRevision) && value.appliedMasteryRevision === Number(value.expectedMasteryRevision) + 1 && nonEmpty(value.attemptId) && nonEmpty(value.graphPointId)
    : value.masteryStateId === undefined && value.expectedMasteryRevision === undefined && value.appliedMasteryRevision === undefined && value.attemptId === undefined
}
