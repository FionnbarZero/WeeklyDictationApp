import type {
  AdaptiveWarmupProfile,
  ChildMasteryState,
  FinalReviewEvidenceCandidate,
  MasteryCurriculumScope,
  MasteryLifecycleAssignment,
  MasteryOccurrence,
  MasteryTermDefinition,
  OccurrenceIntegrationEvidence,
  OccurrenceIntegrationRecord,
} from './contracts.ts'
import { childMasteryStateId } from './identity.ts'

export type OccurrenceIntegrationResult = {
  state: ChildMasteryState | null
  integrated: boolean
  reason?: 'not-mastery-eligible' | 'already-integrated'
  selectedEvidence?: FinalReviewEvidenceCandidate
}

function resolvedAssignment(occurrence: MasteryOccurrence, assignment: MasteryLifecycleAssignment | undefined) {
  return assignment?.occurrenceId === occurrence.occurrenceId && assignment.status === 'resolved' ? assignment : null
}

export function isOccurrenceMasteryEligible(occurrence: MasteryOccurrence, assignment: MasteryLifecycleAssignment | undefined) {
  return resolvedAssignment(occurrence, assignment)?.stage.kind === 'mastery'
}

export function isFinalTestReviewStage(occurrence: MasteryOccurrence, assignment: MasteryLifecycleAssignment | undefined) {
  const resolved = resolvedAssignment(occurrence, assignment)
  return Boolean(resolved && resolved.stage.kind === 'test-review' && resolved.stage.cycle === resolved.finalTestReviewCycle)
}

function assignmentFor(assignments: readonly MasteryLifecycleAssignment[], occurrenceId: string) {
  return assignments.find((assignment) => assignment.occurrenceId === occurrenceId)
}

function occurrenceIsInScope(occurrence: MasteryOccurrence, scope: MasteryCurriculumScope) {
  return occurrence.grade === scope.grade && occurrence.schoolYear === scope.schoolYear
}

export function isMasteryTermSuppressed(term: MasteryTermDefinition, assignments: readonly MasteryLifecycleAssignment[], scope: MasteryCurriculumScope) {
  return term.occurrences.filter((occurrence) => occurrenceIsInScope(occurrence, scope)).some((occurrence) => {
    const assignment = assignmentFor(assignments, occurrence.occurrenceId)
    if (!assignment || assignment.status === 'unresolved') return true
    return assignment.stage.kind === 'acquisition'
      || assignment.stage.kind === 'test-review'
      || assignment.stage.kind === 'legacy-active'
      || assignment.stage.kind === 'no-instruction'
      || assignment.stage.kind === 'malformed'
  })
}

export function isMasteryTermWarmupEligible(term: MasteryTermDefinition, assignments: readonly MasteryLifecycleAssignment[], scope: MasteryCurriculumScope) {
  return isMasteryTermWarmupEligibleFromHistory(term, assignments, scope)
}

export function isMasteryTermWarmupEligibleFromHistory(
  term: MasteryTermDefinition,
  assignments: readonly MasteryLifecycleAssignment[],
  scope: MasteryCurriculumScope,
  integrations?: readonly OccurrenceIntegrationRecord[],
) {
  const historicallyEligible = integrations
    ? integrations.some((record) => record.eligibilityBasis.kind === 'verified-mastery'
      && term.occurrences.some((occurrence) => occurrence.occurrenceId === record.occurrenceId))
    : term.occurrences.some((occurrence) => isOccurrenceMasteryEligible(occurrence, assignmentFor(assignments, occurrence.occurrenceId)))
  return !isMasteryTermSuppressed(term, assignments, scope)
    && historicallyEligible
}

function finalReviewEvidenceSignature(candidate: FinalReviewEvidenceCandidate) {
  return JSON.stringify([
    candidate.attemptId,
    candidate.childId,
    candidate.occurrenceId,
    candidate.reviewCycle,
    candidate.reviewedAt,
    candidate.status,
    candidate.correct ?? null,
  ])
}

function conflictFreeFinalReviewEvidence(candidates: readonly FinalReviewEvidenceCandidate[]) {
  const byAttemptId = new Map<string, FinalReviewEvidenceCandidate[]>()
  for (const candidate of candidates) {
    const group = byAttemptId.get(candidate.attemptId) || []
    group.push(candidate)
    byAttemptId.set(candidate.attemptId, group)
  }
  return [...byAttemptId.values()].flatMap((group) => {
    const signatures = new Set(group.map(finalReviewEvidenceSignature))
    return signatures.size === 1 ? [group[0]] : []
  })
}

export function selectLatestFinalReviewEvidence(occurrence: MasteryOccurrence, assignment: MasteryLifecycleAssignment | undefined, childId: string, candidates: readonly FinalReviewEvidenceCandidate[]) {
  const resolved = resolvedAssignment(occurrence, assignment)
  if (!resolved) return undefined
  const matching = conflictFreeFinalReviewEvidence(candidates)
    .filter((candidate) => candidate.childId === childId
      && candidate.occurrenceId === occurrence.occurrenceId
      && candidate.reviewCycle === resolved.finalTestReviewCycle
      && Number.isFinite(Date.parse(candidate.reviewedAt)))
  const ordered = (values: FinalReviewEvidenceCandidate[]) => values
    .sort((left, right) => Date.parse(left.reviewedAt) - Date.parse(right.reviewedAt) || left.attemptId.localeCompare(right.attemptId))
  const completed = ordered(matching.filter((candidate) => candidate.status === 'completed' && typeof candidate.correct === 'boolean'))
  if (completed.length > 0) return completed[completed.length - 1]
  const noResult = ordered(matching.filter((candidate) => candidate.status === 'abandoned' || candidate.status === 'skipped' || candidate.status === 'unanswered'))
  return noResult[noResult.length - 1]
}

function integrationRecord(
  occurrence: MasteryOccurrence,
  assignment: Extract<MasteryLifecycleAssignment, { status: 'resolved' }>,
  evidence?: FinalReviewEvidenceCandidate,
): OccurrenceIntegrationRecord {
  const completed = evidence?.status === 'completed' && typeof evidence.correct === 'boolean'
  const result: OccurrenceIntegrationEvidence = completed ? (evidence.correct ? 'correct' : 'incorrect') : 'none'
  return {
    occurrenceId: occurrence.occurrenceId,
    evidence: result,
    eligibilityBasis: {
      kind: 'verified-mastery',
      lifecycleProfileId: assignment.profileId,
      finalTestReviewCycle: assignment.finalTestReviewCycle,
    },
    ...(evidence ? { sourceAttemptId: evidence.attemptId, sourceReviewedAt: evidence.reviewedAt } : {}),
  }
}

function latestTimestamp(...values: Array<string | undefined>) {
  const ordered = values.filter((value): value is string => Boolean(value) && Number.isFinite(Date.parse(value!)))
    .sort((left, right) => Date.parse(left) - Date.parse(right) || left.localeCompare(right))
  return ordered[ordered.length - 1]
}

function schedulingProfile(profile: AdaptiveWarmupProfile, occurrence: MasteryOccurrence) {
  return { id: profile.id, version: profile.version, sourceOccurrenceId: occurrence.occurrenceId }
}

function initialState(
  childId: string,
  occurrence: MasteryOccurrence,
  assignment: Extract<MasteryLifecycleAssignment, { status: 'resolved' }>,
  profile: AdaptiveWarmupProfile,
  evidence?: FinalReviewEvidenceCandidate,
): ChildMasteryState {
  const completed = evidence?.status === 'completed' && typeof evidence.correct === 'boolean'
  const incorrect = completed && evidence.correct === false
  return {
    version: 1,
    id: childMasteryStateId(childId, occurrence.masteryTermId),
    childId,
    masteryTermId: occurrence.masteryTermId,
    evidence: incorrect ? 'support-needed' : completed && evidence.correct ? 'demonstrated' : 'unassessed',
    bucket: incorrect ? 'needs-attention' : 'recent-entry',
    consecutiveCorrect: 0,
    schedulingProfile: schedulingProfile(profile, occurrence),
    integratedOccurrences: [integrationRecord(occurrence, assignment, evidence)],
    ...(completed && evidence ? { lastReviewedAt: evidence.reviewedAt } : {}),
    ...(incorrect && evidence ? { lastIncorrectAt: evidence.reviewedAt } : {}),
  }
}

export function integrateMasteryOccurrenceForChild(input: {
  childId: string
  occurrence: MasteryOccurrence
  profile: AdaptiveWarmupProfile
  lifecycleAssignment: MasteryLifecycleAssignment
  currentState?: ChildMasteryState | null
  finalReviewEvidence?: readonly FinalReviewEvidenceCandidate[]
}): OccurrenceIntegrationResult {
  const { childId, occurrence, profile } = input
  if (profile.grade !== occurrence.grade || profile.activityModule !== occurrence.identity.activityModule) {
    throw new Error('The Adaptive Warmup profile does not match the occurrence being integrated.')
  }
  const currentState = input.currentState || null
  if (currentState && (currentState.childId !== childId || currentState.masteryTermId !== occurrence.masteryTermId)) {
    throw new Error('The child mastery state does not match the occurrence being integrated.')
  }
  if (!isOccurrenceMasteryEligible(occurrence, input.lifecycleAssignment)) return { state: currentState, integrated: false, reason: 'not-mastery-eligible' }
  const resolvedAssignment = input.lifecycleAssignment as Extract<MasteryLifecycleAssignment, { status: 'resolved' }>
  if (currentState?.integratedOccurrences.some((record) => record.occurrenceId === occurrence.occurrenceId)) {
    return { state: currentState, integrated: false, reason: 'already-integrated' }
  }
  const selectedEvidence = selectLatestFinalReviewEvidence(occurrence, input.lifecycleAssignment, childId, input.finalReviewEvidence || [])
  if (!currentState) return { state: initialState(childId, occurrence, resolvedAssignment, profile, selectedEvidence), integrated: true, selectedEvidence }

  const record = integrationRecord(occurrence, resolvedAssignment, selectedEvidence)
  if (selectedEvidence?.status === 'completed' && selectedEvidence.correct === false) {
    const lastReviewedAt = latestTimestamp(currentState.lastReviewedAt, selectedEvidence.reviewedAt)
    const lastIncorrectAt = latestTimestamp(currentState.lastIncorrectAt, selectedEvidence.reviewedAt)
    return {
      state: {
        ...currentState,
        evidence: 'support-needed',
        bucket: 'needs-attention',
        consecutiveCorrect: 0,
        schedulingProfile: schedulingProfile(profile, occurrence),
        integratedOccurrences: [...currentState.integratedOccurrences, record],
        ...(lastReviewedAt ? { lastReviewedAt } : {}),
        ...(lastIncorrectAt ? { lastIncorrectAt } : {}),
      },
      integrated: true,
      selectedEvidence,
    }
  }
  if (currentState.bucket === 'needs-attention') {
    const lastReviewedAt = selectedEvidence?.status === 'completed'
      ? latestTimestamp(currentState.lastReviewedAt, selectedEvidence.reviewedAt)
      : currentState.lastReviewedAt
    return {
      state: {
        ...currentState,
        schedulingProfile: schedulingProfile(profile, occurrence),
        integratedOccurrences: [...currentState.integratedOccurrences, record],
        ...(lastReviewedAt ? { lastReviewedAt } : {}),
      },
      integrated: true,
      selectedEvidence,
    }
  }
  const lastReviewedAt = selectedEvidence?.status === 'completed'
    ? latestTimestamp(currentState.lastReviewedAt, selectedEvidence.reviewedAt)
    : currentState.lastReviewedAt
  return {
    state: {
      ...currentState,
      evidence: selectedEvidence?.status === 'completed' && selectedEvidence.correct ? 'demonstrated' : 'unassessed',
      bucket: 'recent-entry',
      consecutiveCorrect: 0,
      schedulingProfile: schedulingProfile(profile, occurrence),
      rotationEligibleFromCycle: undefined,
      lastConsumedRotationCycle: undefined,
      integratedOccurrences: [...currentState.integratedOccurrences, record],
      ...(lastReviewedAt ? { lastReviewedAt } : {}),
    },
    integrated: true,
    selectedEvidence,
  }
}
