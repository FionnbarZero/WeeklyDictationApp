import assert from 'node:assert/strict'
import test from 'node:test'
import { NEEDS_ATTENTION_RECOVERY_CORRECT, type AdaptiveWarmupProfile, type AdaptiveWarmupProfileRegistry, type ChildMasteryState, type MasteryLifecycleAssignment, type MasteryOccurrence, type MasteryOccurrenceStage, type MasteryTermDefinition } from '../src/warmup/adaptive/contracts.ts'
import {
  integrateMasteryOccurrenceForChild,
  isFinalTestReviewStage,
  isMasteryTermSuppressed,
  isMasteryTermWarmupEligible,
  isOccurrenceMasteryEligible,
  selectLatestFinalReviewEvidence,
} from '../src/warmup/adaptive/eligibility.ts'
import {
  createMasteryOccurrence,
  deterministicMasteryTermId,
  masteryIdentitiesEqual,
  normalizeMasteryTermV1,
  upsertMasteryOccurrence,
  validateMasteryTermIdentity,
} from '../src/warmup/adaptive/identity.ts'
import { reconcileAdaptiveWarmupLifecycle } from '../src/warmup/adaptive/lifecycleReconciliation.ts'
import { upgradeChildMasteryStateToActiveProfile } from '../src/warmup/adaptive/profileUpgrade.ts'
import { activeRegistryForProfiles, validateAdaptiveWarmupProfileRegistry } from '../src/warmup/adaptive/profileValidation.ts'
import { grade2Tier1WritingAdaptiveWarmupProfile } from '../src/warmup/adaptive/profiles/grade2.ts'
import { materializeAdaptiveWarmupSelection as materializeAdaptiveWarmupSelectionWithRegistry } from '../src/warmup/adaptive/scheduler.ts'
import { applyAdaptiveWarmupAssessment } from '../src/warmup/adaptive/transitions.ts'

const lifecycleByOccurrence = new Map<string, MasteryLifecycleAssignment>()
const grade2Scope = { grade: 'Grade 2', schoolYear: '2026-27' } as const

function materializeAdaptiveWarmupSelection(
  input: Omit<Parameters<typeof materializeAdaptiveWarmupSelectionWithRegistry>[0], 'profileRegistry'>
    & { profileRegistry?: AdaptiveWarmupProfileRegistry },
) {
  return materializeAdaptiveWarmupSelectionWithRegistry({
    ...input,
    profileRegistry: input.profileRegistry || activeRegistryForProfiles([input.profile]),
  })
}

function occurrence(text: string, id: string, stage: MasteryOccurrenceStage = { kind: 'mastery' }, overrides: Partial<Parameters<typeof createMasteryOccurrence>[0]> & { finalTestReviewCycle?: number } = {}) {
  const { finalTestReviewCycle = 1, ...occurrenceOverrides } = overrides
  const created = createMasteryOccurrence({
    occurrenceId: id,
    datasetId: `dataset-${id}`,
    grade: 'Grade 2',
    schoolYear: '2026-27',
    text,
    activityModule: 'mandarin-tier1-writing',
    tier: 'tier-1',
    language: 'mandarin',
    ...occurrenceOverrides,
  })
  lifecycleByOccurrence.set(created.occurrenceId, { occurrenceId: created.occurrenceId, status: 'resolved', profileId: 'synthetic-test-profile', stage, finalTestReviewCycle })
  return created
}

function lifecycle(occurrence: MasteryOccurrence) {
  return lifecycleByOccurrence.get(occurrence.occurrenceId)!
}

function lifecycles(terms: readonly MasteryTermDefinition[]) {
  return terms.flatMap((definition) => definition.occurrences.map(lifecycle))
}

function term(...occurrences: MasteryOccurrence[]): MasteryTermDefinition {
  let current: MasteryTermDefinition | undefined
  for (const item of occurrences) {
    const result = upsertMasteryOccurrence(current, item)
    assert.notEqual(result.status, 'collision')
    if (result.status !== 'collision') current = result.term
  }
  return current!
}

function childState(definition: MasteryTermDefinition, bucket: ChildMasteryState['bucket'], overrides: Partial<ChildMasteryState> = {}): ChildMasteryState {
  return {
    version: 1,
    id: `maya-${definition.id}`,
    childId: 'maya',
    masteryTermId: definition.id,
    evidence: bucket === 'needs-attention' ? 'support-needed' : 'demonstrated',
    bucket,
    consecutiveCorrect: 0,
    schedulingProfile: {
      id: grade2Tier1WritingAdaptiveWarmupProfile.id,
      version: grade2Tier1WritingAdaptiveWarmupProfile.version,
      sourceOccurrenceId: definition.occurrences[0].occurrenceId,
    },
    integratedOccurrences: definition.occurrences.map((item) => ({
      occurrenceId: item.occurrenceId,
      evidence: 'none',
      eligibilityBasis: { kind: 'verified-mastery', lifecycleProfileId: 'synthetic-test-profile', finalTestReviewCycle: 1 },
    })),
    ...(bucket === 'mastery-rotation' ? { rotationEligibleFromCycle: 1 } : {}),
    ...overrides,
  }
}

test('mastery-normalizer-v1 produces stable path-safe identities without changing character form or case', () => {
  assert.equal(normalizeMasteryTermV1('  e\u0301   写  '), 'é 写')
  const base = occurrence('写', 'write-1')
  const repeated = occurrence('  写  ', 'write-2')
  const reading = occurrence('写', 'read-1', { kind: 'mastery' }, { activityModule: 'mandarin-tier2-reading', tier: 'tier-2' })
  const upper = occurrence('A', 'upper')
  const lower = occurrence('a', 'lower')
  const simplified = occurrence('后', 'simplified')
  const traditional = occurrence('後', 'traditional')

  assert.equal(base.masteryTermId, repeated.masteryTermId)
  assert.notEqual(base.masteryTermId, reading.masteryTermId)
  assert.notEqual(upper.masteryTermId, lower.masteryTermId)
  assert.notEqual(simplified.masteryTermId, traditional.masteryTermId)
  assert.match(base.masteryTermId, /^mastery-v1-[a-f0-9]{24}$/)
  assert.ok(!base.masteryTermId.includes('写'))
  assert.equal(validateMasteryTermIdentity(term(base)), true)
  assert.equal(validateMasteryTermIdentity({ id: 'wrong-id', identity: base.identity }), false)
  assert.equal(masteryIdentitiesEqual(base.identity, repeated.identity), true)
  assert.equal(deterministicMasteryTermId(base.identity), base.masteryTermId)
})

test('mastery term construction combines occurrences and detects ID or provenance collisions', () => {
  const first = occurrence('写', 'week-1')
  const second = occurrence('写', 'week-2')
  const combined = term(first, second)
  assert.deepEqual(combined.occurrences.map((item) => item.occurrenceId), ['week-1', 'week-2'])
  assert.equal(upsertMasteryOccurrence(combined, second).status, 'unchanged')

  const forcedId = () => 'mastery-v1-forced-collision'
  const left = createMasteryOccurrence({ ...first, text: '写', activityModule: first.identity.activityModule, tier: first.identity.tier, language: first.identity.language }, forcedId)
  const right = createMasteryOccurrence({ ...second, text: '读', activityModule: second.identity.activityModule, tier: second.identity.tier, language: second.identity.language }, forcedId)
  const created = upsertMasteryOccurrence(undefined, left)
  assert.notEqual(created.status, 'collision')
  if (created.status !== 'collision') assert.equal(upsertMasteryOccurrence(created.term, right).status, 'collision')

  const reused = occurrence('写', 'week-1', { kind: 'mastery' }, { datasetId: 'different-dataset' })
  assert.equal(upsertMasteryOccurrence(combined, reused).status, 'collision')
  const changedGrade = occurrence('写', 'week-1', { kind: 'mastery' }, { grade: 'Grade 5' })
  assert.equal(upsertMasteryOccurrence(combined, changedGrade).status, 'collision')
  const changedDisplayText = occurrence('  写  ', 'week-1')
  assert.equal(upsertMasteryOccurrence(combined, changedDisplayText).status, 'collision')
})

test('final-stage eligibility works for Grade 2 and a synthetic Grade 5 multi-review strategy', () => {
  const grade2Review = occurrence('写', 'g2-review', { kind: 'test-review', cycle: 1 })
  const grade2Mastery = occurrence('写', 'g2-mastery')
  const grade5Review1 = occurrence('读', 'g5-review-1', { kind: 'test-review', cycle: 1 }, { grade: 'Grade 5', finalTestReviewCycle: 2 })
  const grade5Review2 = occurrence('读', 'g5-review-2', { kind: 'test-review', cycle: 2 }, { grade: 'Grade 5', finalTestReviewCycle: 2 })
  const grade5Mastery = occurrence('读', 'g5-mastery', { kind: 'mastery' }, { grade: 'Grade 5', finalTestReviewCycle: 2 })

  assert.equal(isOccurrenceMasteryEligible(grade2Review, lifecycle(grade2Review)), false)
  assert.equal(isFinalTestReviewStage(grade2Review, lifecycle(grade2Review)), true)
  assert.equal(isOccurrenceMasteryEligible(grade2Mastery, lifecycle(grade2Mastery)), true)
  assert.equal(isOccurrenceMasteryEligible(grade5Review1, lifecycle(grade5Review1)), false)
  assert.equal(isFinalTestReviewStage(grade5Review1, lifecycle(grade5Review1)), false)
  assert.equal(isOccurrenceMasteryEligible(grade5Review2, lifecycle(grade5Review2)), false)
  assert.equal(isFinalTestReviewStage(grade5Review2, lifecycle(grade5Review2)), true)
  assert.equal(isOccurrenceMasteryEligible(grade5Mastery, lifecycle(grade5Mastery)), true)
})

test('a matching active occurrence suppresses older mastery without crossing module boundaries', () => {
  const oldMastery = occurrence('写', 'old')
  const activeWriting = occurrence('写', 'new-active', { kind: 'acquisition' })
  const writingTerm = term(oldMastery, activeWriting)
  const readingTerm = term(occurrence('写', 'reading', { kind: 'mastery' }, { activityModule: 'mandarin-tier2-reading', tier: 'tier-2' }))

  assert.equal(isMasteryTermSuppressed(writingTerm, lifecycles([writingTerm]), grade2Scope), true)
  assert.equal(isMasteryTermWarmupEligible(writingTerm, lifecycles([writingTerm]), grade2Scope), false)
  assert.equal(isMasteryTermSuppressed(readingTerm, lifecycles([readingTerm]), grade2Scope), false)
  assert.equal(isMasteryTermWarmupEligible(readingTerm, lifecycles([readingTerm]), grade2Scope), true)

  const unresolved = { occurrenceId: oldMastery.occurrenceId, status: 'unresolved' as const, reason: 'missing' as const }
  assert.equal(isMasteryTermWarmupEligible(term(oldMastery), [unresolved], grade2Scope), false)
})

test('mastery remains longitudinal while active suppression is scoped to the selected grade and school year', () => {
  const priorYearMastery = occurrence('读', 'prior-year-mastered', { kind: 'mastery' }, { schoolYear: '2025-26' })
  const priorYearTerm = term(priorYearMastery)
  assert.equal(isMasteryTermWarmupEligible(priorYearTerm, lifecycles([priorYearTerm]), grade2Scope), true)
  const priorYearSelection = materializeAdaptiveWarmupSelection({
    childId: 'maya',
    schoolYear: '2026-27',
    visitType: 'standalone',
    profile: grade2Tier1WritingAdaptiveWarmupProfile,
    terms: [priorYearTerm],
    lifecycleAssignments: lifecycles([priorYearTerm]),
    childStates: [childState(priorYearTerm, 'mastery-rotation')],
    random: () => 0.999,
  })
  assert.deepEqual(priorYearSelection.entries[0].occurrenceIds, [priorYearMastery.occurrenceId])

  const unresolvedHistoricalSelection = materializeAdaptiveWarmupSelection({
    childId: 'maya',
    schoolYear: '2026-27',
    visitType: 'standalone',
    profile: grade2Tier1WritingAdaptiveWarmupProfile,
    terms: [priorYearTerm],
    lifecycleAssignments: [{ occurrenceId: priorYearMastery.occurrenceId, status: 'unresolved', reason: 'missing' }],
    childStates: [childState(priorYearTerm, 'mastery-rotation')],
    random: () => 0.999,
  })
  assert.deepEqual(unresolvedHistoricalSelection.entries[0].occurrenceIds, [priorYearMastery.occurrenceId])

  const grade2Mastery = occurrence('写', 'grade2-mastered')
  const grade5Active = occurrence('写', 'grade5-active', { kind: 'acquisition' }, { grade: 'Grade 5' })
  const priorYearUnresolved = occurrence('写', 'prior-year', { kind: 'acquisition' }, { schoolYear: '2025-26' })
  const definition = term(grade2Mastery, grade5Active, priorYearUnresolved)
  const assignments = lifecycles([definition]).map((assignment) => assignment.occurrenceId === priorYearUnresolved.occurrenceId
    ? { occurrenceId: assignment.occurrenceId, status: 'unresolved' as const, reason: 'missing' as const }
    : assignment)

  assert.equal(isMasteryTermSuppressed(definition, assignments, grade2Scope), false)
  assert.equal(isMasteryTermWarmupEligible(definition, assignments, grade2Scope), true)
  const grade2HistoricalState = childState(definition, 'recent-entry')
  grade2HistoricalState.integratedOccurrences = grade2HistoricalState.integratedOccurrences
    .filter((record) => record.occurrenceId === grade2Mastery.occurrenceId)
  const selection = materializeAdaptiveWarmupSelection({
    childId: 'maya',
    schoolYear: '2026-27',
    visitType: 'standalone',
    profile: grade2Tier1WritingAdaptiveWarmupProfile,
    terms: [definition],
    lifecycleAssignments: assignments,
    childStates: [grade2HistoricalState],
    random: () => 0.999,
  })
  assert.deepEqual(selection.entries.map((entry) => entry.masteryTermId), [definition.id])
  assert.deepEqual(selection.entries[0].occurrenceIds, [grade2Mastery.occurrenceId])

  const grade2Active = occurrence('写', 'grade2-active', { kind: 'test-review', cycle: 1 })
  const suppressed = term(grade2Mastery, grade5Active, priorYearUnresolved, grade2Active)
  assert.equal(isMasteryTermWarmupEligible(suppressed, lifecycles([suppressed]), grade2Scope), false)
})

test('a current no-instruction occurrence suppresses prior-year mastery without erasing longitudinal mastery', () => {
  const priorYearMastery = occurrence('会', 'prior-year-no-instruction', { kind: 'mastery' }, { schoolYear: '2025-26' })
  const currentNoInstruction = occurrence('会', 'current-no-instruction', { kind: 'no-instruction' })
  const definition = term(priorYearMastery, currentNoInstruction)

  assert.equal(isMasteryTermSuppressed(definition, lifecycles([definition]), grade2Scope), true)
  assert.equal(isMasteryTermWarmupEligible(definition, lifecycles([definition]), grade2Scope), false)

  const priorScope = { grade: 'Grade 2', schoolYear: '2025-26' } as const
  assert.equal(isMasteryTermSuppressed(definition, lifecycles([definition]), priorScope), false)
  assert.equal(isMasteryTermWarmupEligible(definition, lifecycles([definition]), priorScope), true)
})

test('lifecycle reconciliation updates stages without remigrating child state', () => {
  const active = occurrence('写', 'reconcile', { kind: 'acquisition' })
  const definition = term(active)
  const currentAssignments = lifecycles([definition])
  const authoritative = [{
    datasetId: active.datasetId,
    profileId: 'synthetic-test-profile',
    stage: { kind: 'mastery' as const },
    finalTestReviewCycle: 1,
  }]
  const updated = reconcileAdaptiveWarmupLifecycle({ terms: [definition], currentAssignments, authoritativeAssignments: authoritative })
  assert.equal(updated.status, 'updated')
  assert.equal(updated.activeOccurrenceCount, 0)
  assert.deepEqual(updated.lifecycleAssignments[0], { occurrenceId: active.occurrenceId, status: 'resolved', profileId: 'synthetic-test-profile', stage: { kind: 'mastery' }, finalTestReviewCycle: 1 })

  const repeated = reconcileAdaptiveWarmupLifecycle({ terms: [definition], currentAssignments: updated.lifecycleAssignments, authoritativeAssignments: authoritative })
  assert.equal(repeated.status, 'unchanged')
  const rejected = reconcileAdaptiveWarmupLifecycle({
    terms: [definition],
    currentAssignments: updated.lifecycleAssignments,
    authoritativeAssignments: [{ ...authoritative[0], finalTestReviewCycle: 2 }],
  })
  assert.equal(rejected.status, 'attention-required')
  assert.deepEqual(rejected.lifecycleAssignments, [{ occurrenceId: active.occurrenceId, status: 'unresolved', reason: 'strategy-mismatch' }])
  assert.ok(rejected.issues.some((issue) => issue.code === 'strategy-mismatch'))
})

test('lifecycle reconciliation applies safe updates while a different dataset has a strategy mismatch', () => {
  const changedToActive = occurrence('写', 'safe-update', { kind: 'mastery' })
  const mismatched = occurrence('读', 'strategy-mismatch', { kind: 'mastery' })
  const terms = [term(changedToActive), term(mismatched)]
  const result = reconcileAdaptiveWarmupLifecycle({
    terms,
    currentAssignments: lifecycles(terms),
    authoritativeAssignments: [
      {
        datasetId: changedToActive.datasetId,
        profileId: 'synthetic-test-profile',
        stage: { kind: 'acquisition' },
        finalTestReviewCycle: 1,
      },
      {
        datasetId: mismatched.datasetId,
        profileId: 'replacement-strategy',
        stage: { kind: 'mastery' },
        finalTestReviewCycle: 2,
      },
    ],
  })

  assert.equal(result.status, 'attention-required')
  assert.deepEqual(result.lifecycleAssignments, [
    { occurrenceId: changedToActive.occurrenceId, status: 'resolved', profileId: 'synthetic-test-profile', stage: { kind: 'acquisition' }, finalTestReviewCycle: 1 },
    { occurrenceId: mismatched.occurrenceId, status: 'unresolved', reason: 'strategy-mismatch' },
  ].sort((left, right) => left.occurrenceId.localeCompare(right.occurrenceId)))
  assert.equal(isMasteryTermWarmupEligible(terms[0], result.lifecycleAssignments, grade2Scope), false)
  assert.equal(isMasteryTermWarmupEligible(terms[1], result.lifecycleAssignments, grade2Scope), false)
})

test('the Grade 2 profile keeps pre-activity Warmup optional during development', () => {
  assert.equal(grade2Tier1WritingAdaptiveWarmupProfile.preActivityWarmupRequirement, 'optional')
})

test('latest valid final Test Review evidence initializes placement with deterministic ties', () => {
  const item = occurrence('写', 'initialize')
  const evidence = [
    { attemptId: 'other-child', childId: 'eli', occurrenceId: item.occurrenceId, reviewCycle: 1, reviewedAt: '2026-09-23T10:00:00.000Z', status: 'completed' as const, correct: true },
    { attemptId: 'ignored-skipped', childId: 'maya', occurrenceId: item.occurrenceId, reviewCycle: 1, reviewedAt: '2026-09-24T10:00:00.000Z', status: 'skipped' as const },
    { attemptId: 'ignored-abandoned', childId: 'maya', occurrenceId: item.occurrenceId, reviewCycle: 1, reviewedAt: '2026-09-25T10:00:00.000Z', status: 'abandoned' as const, correct: true },
    { attemptId: 'ignored-unanswered', childId: 'maya', occurrenceId: item.occurrenceId, reviewCycle: 1, reviewedAt: '2026-09-26T10:00:00.000Z', status: 'unanswered' as const },
    { attemptId: 'ignored-invalid-time', childId: 'maya', occurrenceId: item.occurrenceId, reviewCycle: 1, reviewedAt: 'not-a-time', status: 'completed' as const, correct: true },
    { attemptId: 'ignored-cycle', childId: 'maya', occurrenceId: item.occurrenceId, reviewCycle: 2, reviewedAt: '2026-09-20T10:00:00.000Z', status: 'completed' as const, correct: false },
    { attemptId: 'ignored-provisional', childId: 'maya', occurrenceId: item.occurrenceId, reviewCycle: 1, reviewedAt: '2026-09-21T10:00:00.000Z', status: 'provisional' as const, correct: false },
    { attemptId: 'attempt-a', childId: 'maya', occurrenceId: item.occurrenceId, reviewCycle: 1, reviewedAt: '2026-09-22T10:00:00.000Z', status: 'completed' as const, correct: true },
    { attemptId: 'attempt-b', childId: 'maya', occurrenceId: item.occurrenceId, reviewCycle: 1, reviewedAt: '2026-09-22T10:00:00.000Z', status: 'completed' as const, correct: false },
  ]
  const initialized = integrateMasteryOccurrenceForChild({ childId: 'maya', occurrence: item, lifecycleAssignment: lifecycle(item), profile: grade2Tier1WritingAdaptiveWarmupProfile, finalReviewEvidence: evidence })
  assert.equal(initialized.selectedEvidence?.attemptId, 'attempt-b')
  assert.equal(initialized.state?.evidence, 'support-needed')
  assert.equal(initialized.state?.bucket, 'needs-attention')
  assert.equal(initialized.state?.consecutiveCorrect, 0)
  assert.equal(initialized.state?.integratedOccurrences[0].sourceReviewedAt, '2026-09-22T10:00:00.000Z')
  assert.equal(initialized.state?.lastReviewedAt, '2026-09-22T10:00:00.000Z')
  assert.equal(initialized.state?.lastIncorrectAt, '2026-09-22T10:00:00.000Z')

  const unassessed = integrateMasteryOccurrenceForChild({ childId: 'eli', occurrence: item, lifecycleAssignment: lifecycle(item), profile: grade2Tier1WritingAdaptiveWarmupProfile })
  assert.equal(unassessed.state?.evidence, 'unassessed')
  assert.equal(unassessed.state?.bucket, 'recent-entry')
})

test('conflicting final Test Review attempt IDs are rejected independently of input order', () => {
  const item = occurrence('写', 'conflicting-final-review')
  const conflict = [
    { attemptId: 'same-attempt', childId: 'maya', occurrenceId: item.occurrenceId, reviewCycle: 1, reviewedAt: '2026-09-28T10:00:00.000Z', status: 'completed' as const, correct: true },
    { attemptId: 'same-attempt', childId: 'maya', occurrenceId: item.occurrenceId, reviewCycle: 1, reviewedAt: '2026-09-28T10:00:00.000Z', status: 'completed' as const, correct: false },
  ]
  for (const candidates of [conflict, [...conflict].reverse()]) {
    assert.equal(selectLatestFinalReviewEvidence(item, lifecycle(item), 'maya', candidates), undefined)
    const result = integrateMasteryOccurrenceForChild({
      childId: 'maya',
      occurrence: item,
      lifecycleAssignment: lifecycle(item),
      profile: grade2Tier1WritingAdaptiveWarmupProfile,
      finalReviewEvidence: candidates,
    })
    assert.deepEqual(
      { evidence: result.state?.evidence, bucket: result.state?.bucket, streak: result.state?.consecutiveCorrect },
      { evidence: 'unassessed', bucket: 'recent-entry', streak: 0 },
    )
  }
})

test('occurrence integration is exactly once and repeated evidence preserves an existing recovery requirement', () => {
  const first = occurrence('写', 'first')
  const second = occurrence('写', 'second')
  const initial = integrateMasteryOccurrenceForChild({
    childId: 'maya',
    occurrence: first,
    lifecycleAssignment: lifecycle(first),
    profile: grade2Tier1WritingAdaptiveWarmupProfile,
    finalReviewEvidence: [{ attemptId: 'wrong', childId: 'maya', occurrenceId: first.occurrenceId, reviewCycle: 1, reviewedAt: '2026-09-20T10:00:00.000Z', status: 'completed', correct: false }],
  })
  assert.ok(initial.state)
  const recovering = { ...initial.state!, consecutiveCorrect: 2 }
  const repeated = integrateMasteryOccurrenceForChild({
    childId: 'maya',
    occurrence: second,
    lifecycleAssignment: lifecycle(second),
    profile: grade2Tier1WritingAdaptiveWarmupProfile,
    currentState: recovering,
    finalReviewEvidence: [{ attemptId: 'correct', childId: 'maya', occurrenceId: second.occurrenceId, reviewCycle: 1, reviewedAt: '2026-09-27T10:00:00.000Z', status: 'completed', correct: true }],
  })
  assert.equal(repeated.state?.bucket, 'needs-attention')
  assert.equal(repeated.state?.evidence, 'support-needed')
  assert.equal(repeated.state?.consecutiveCorrect, 2)
  assert.equal(repeated.state?.lastReviewedAt, '2026-09-27T10:00:00.000Z')
  assert.equal(repeated.state?.lastIncorrectAt, '2026-09-20T10:00:00.000Z')
  assert.deepEqual(repeated.state?.integratedOccurrences.map((item) => item.occurrenceId), ['first', 'second'])

  const duplicate = integrateMasteryOccurrenceForChild({ childId: 'maya', occurrence: second, lifecycleAssignment: lifecycle(second), profile: grade2Tier1WritingAdaptiveWarmupProfile, currentState: repeated.state })
  assert.equal(duplicate.integrated, false)
  assert.equal(duplicate.reason, 'already-integrated')
  assert.strictEqual(duplicate.state, repeated.state)

  const wrongOwner = { ...repeated.state!, childId: 'eli' }
  assert.throws(
    () => integrateMasteryOccurrenceForChild({ childId: 'maya', occurrence: second, lifecycleAssignment: lifecycle(second), profile: grade2Tier1WritingAdaptiveWarmupProfile, currentState: wrongOwner }),
    /does not match/,
  )
})

test('Adaptive Warmup transitions implement Recent Entry promotion and universal Needs Attention recovery', () => {
  assert.equal(NEEDS_ATTENTION_RECOVERY_CORRECT, 3)
  const definition = term(occurrence('写', 'transition'))
  const initial = childState(definition, 'recent-entry', { evidence: 'unassessed' })
  const first = applyAdaptiveWarmupAssessment(initial, { outcome: 'correct', reviewedAt: '2026-09-28T10:00:00.000Z' }, 1, grade2Tier1WritingAdaptiveWarmupProfile)
  assert.deepEqual({ evidence: first.evidence, bucket: first.bucket, streak: first.consecutiveCorrect }, { evidence: 'demonstrated', bucket: 'recent-entry', streak: 1 })
  const second = applyAdaptiveWarmupAssessment(first, { outcome: 'correct', reviewedAt: '2026-09-29T10:00:00.000Z' }, 1, grade2Tier1WritingAdaptiveWarmupProfile)
  assert.deepEqual({ bucket: second.bucket, streak: second.consecutiveCorrect, eligible: second.rotationEligibleFromCycle }, { bucket: 'mastery-rotation', streak: 0, eligible: 2 })

  const errored = applyAdaptiveWarmupAssessment(second, { outcome: 'incorrect', reviewedAt: '2026-09-30T10:00:00.000Z' }, 2, grade2Tier1WritingAdaptiveWarmupProfile)
  assert.deepEqual({ evidence: errored.evidence, bucket: errored.bucket, streak: errored.consecutiveCorrect, consumed: errored.lastConsumedRotationCycle }, { evidence: 'support-needed', bucket: 'needs-attention', streak: 0, consumed: 2 })
  const recovery1 = applyAdaptiveWarmupAssessment(errored, { outcome: 'correct', reviewedAt: '2026-10-01T10:00:00.000Z' }, 2, grade2Tier1WritingAdaptiveWarmupProfile)
  const recovery2 = applyAdaptiveWarmupAssessment(recovery1, { outcome: 'correct', reviewedAt: '2026-10-02T10:00:00.000Z' }, 2, grade2Tier1WritingAdaptiveWarmupProfile)
  assert.equal(recovery2.evidence, 'support-needed')
  assert.equal(recovery2.bucket, 'needs-attention')
  assert.equal(recovery2.consecutiveCorrect, 2)
  const recovery3 = applyAdaptiveWarmupAssessment(recovery2, { outcome: 'correct', reviewedAt: '2026-10-03T10:00:00.000Z' }, 2, grade2Tier1WritingAdaptiveWarmupProfile)
  assert.deepEqual({ evidence: recovery3.evidence, bucket: recovery3.bucket, streak: recovery3.consecutiveCorrect, eligible: recovery3.rotationEligibleFromCycle }, { evidence: 'demonstrated', bucket: 'mastery-rotation', streak: 0, eligible: 3 })
  assert.strictEqual(applyAdaptiveWarmupAssessment(recovery3, { outcome: 'unanswered' }, 2, grade2Tier1WritingAdaptiveWarmupProfile), recovery3)
  assert.strictEqual(applyAdaptiveWarmupAssessment(recovery3, { outcome: 'skipped' }, 2, grade2Tier1WritingAdaptiveWarmupProfile), recovery3)
  const rotationCorrect = applyAdaptiveWarmupAssessment(recovery3, { outcome: 'correct', reviewedAt: '2026-10-04T10:00:00.000Z' }, 3, grade2Tier1WritingAdaptiveWarmupProfile)
  assert.deepEqual({ evidence: rotationCorrect.evidence, bucket: rotationCorrect.bucket, consumed: rotationCorrect.lastConsumedRotationCycle }, { evidence: 'demonstrated', bucket: 'mastery-rotation', consumed: 3 })
  assert.throws(
    () => applyAdaptiveWarmupAssessment(initial, { outcome: 'correct', reviewedAt: 'not-a-time' }, 1, grade2Tier1WritingAdaptiveWarmupProfile),
    /valid reviewed timestamp/,
  )

  const wrongProfile = { ...grade2Tier1WritingAdaptiveWarmupProfile, id: 'wrong-owner-profile' }
  assert.throws(
    () => applyAdaptiveWarmupAssessment(initial, { outcome: 'correct', reviewedAt: '2026-10-05T10:00:00.000Z' }, 1, wrongProfile),
    /does not own/,
  )
})

test('Grade 2 selections honor exact allocations, instructional shortage priority, and unique short queues', () => {
  const rotation = Array.from({ length: 8 }, (_, index) => term(occurrence(`rotation-${index}`, `rotation-${index}`)))
  const recent = Array.from({ length: 7 }, (_, index) => term(occurrence(`recent-${index}`, `recent-${index}`)))
  const attention = [term(occurrence('attention-0', 'attention-0'))]
  const terms = [...rotation, ...recent, ...attention]
  const states = [
    ...rotation.map((item) => childState(item, 'mastery-rotation')),
    ...recent.map((item) => childState(item, 'recent-entry')),
    ...attention.map((item) => childState(item, 'needs-attention')),
  ]
  const standalone = materializeAdaptiveWarmupSelection({ childId: 'maya', schoolYear: '2026-27', visitType: 'standalone', profile: grade2Tier1WritingAdaptiveWarmupProfile, terms, lifecycleAssignments: lifecycles(terms), childStates: states, random: () => 0.999 })
  const counts = standalone.entries.reduce<Record<string, number>>((result, entry) => ({ ...result, [entry.sourceBucket]: (result[entry.sourceBucket] || 0) + 1 }), {})
  assert.equal(standalone.entries.length, 16)
  assert.deepEqual(counts, { 'mastery-rotation': 8, 'recent-entry': 7, 'needs-attention': 1 })
  assert.equal(new Set(standalone.entries.map((entry) => entry.masteryTermId)).size, 16)

  const short = materializeAdaptiveWarmupSelection({ childId: 'maya', schoolYear: '2026-27', visitType: 'pre-activity', profile: grade2Tier1WritingAdaptiveWarmupProfile, terms: terms.slice(0, 5), lifecycleAssignments: lifecycles(terms.slice(0, 5)), childStates: states.slice(0, 5), random: () => 0.999 })
  assert.equal(short.configuredMaximum, 6)
  assert.equal(short.entries.length, 5)
  assert.equal(new Set(short.entries.map((entry) => entry.masteryTermId)).size, 5)
})

test('Grade 2 selections produce exact 8/4/4 and 3/2/1 allocations when every bucket is stocked', () => {
  const rotation = Array.from({ length: 8 }, (_, index) => term(occurrence(`rotation-full-${index}`, `rotation-full-${index}`)))
  const recent = Array.from({ length: 4 }, (_, index) => term(occurrence(`recent-full-${index}`, `recent-full-${index}`)))
  const attention = Array.from({ length: 4 }, (_, index) => term(occurrence(`attention-full-${index}`, `attention-full-${index}`)))
  const terms = [...rotation, ...recent, ...attention]
  const states = [
    ...rotation.map((item) => childState(item, 'mastery-rotation')),
    ...recent.map((item) => childState(item, 'recent-entry')),
    ...attention.map((item) => childState(item, 'needs-attention')),
  ]
  const countBuckets = (visitType: 'standalone' | 'pre-activity') => materializeAdaptiveWarmupSelection({
    childId: 'maya', schoolYear: '2026-27', visitType, profile: grade2Tier1WritingAdaptiveWarmupProfile, terms, lifecycleAssignments: lifecycles(terms), childStates: states, random: () => 0.999,
  }).entries.reduce<Record<string, number>>((result, entry) => ({ ...result, [entry.sourceBucket]: (result[entry.sourceBucket] || 0) + 1 }), {})

  assert.deepEqual(countBuckets('standalone'), { 'mastery-rotation': 8, 'recent-entry': 4, 'needs-attention': 4 })
  assert.deepEqual(countBuckets('pre-activity'), { 'mastery-rotation': 3, 'recent-entry': 2, 'needs-attention': 1 })
})

test('shortage filling uses Needs Attention before Recent Entry and Mastery Rotation', () => {
  const recent = Array.from({ length: 4 }, (_, index) => term(occurrence(`priority-recent-${index}`, `priority-recent-${index}`)))
  const attention = Array.from({ length: 4 }, (_, index) => term(occurrence(`priority-attention-${index}`, `priority-attention-${index}`)))
  const terms = [...recent, ...attention]
  const states = [
    ...recent.map((item) => childState(item, 'recent-entry')),
    ...attention.map((item) => childState(item, 'needs-attention')),
  ]
  const selection = materializeAdaptiveWarmupSelection({ childId: 'maya', schoolYear: '2026-27', visitType: 'pre-activity', profile: grade2Tier1WritingAdaptiveWarmupProfile, terms, lifecycleAssignments: lifecycles(terms), childStates: states, random: () => 0.999 })
  const counts = selection.entries.reduce<Record<string, number>>((result, entry) => ({ ...result, [entry.sourceBucket]: (result[entry.sourceBucket] || 0) + 1 }), {})
  assert.deepEqual(counts, { 'recent-entry': 2, 'needs-attention': 4 })
})

test('Mastery Rotation exhausts the current cycle before reuse and delays newly promoted terms', () => {
  const reviewed = term(occurrence('reviewed', 'reviewed'))
  const current = term(occurrence('current', 'current'))
  const promoted = term(occurrence('promoted', 'promoted'))
  const terms = [reviewed, current, promoted]
  const during = [
    childState(reviewed, 'mastery-rotation', { rotationEligibleFromCycle: 1, lastConsumedRotationCycle: 1 }),
    childState(current, 'mastery-rotation', { rotationEligibleFromCycle: 1 }),
    childState(promoted, 'mastery-rotation', { rotationEligibleFromCycle: 2 }),
  ]
  const currentSelection = materializeAdaptiveWarmupSelection({ childId: 'maya', schoolYear: '2026-27', visitType: 'pre-activity', profile: grade2Tier1WritingAdaptiveWarmupProfile, terms, lifecycleAssignments: lifecycles(terms), childStates: during, rotationState: { version: 1, id: 'cycle', childId: 'maya', activityModule: 'mandarin-tier1-writing', cycle: 1 }, random: () => 0.999 })
  assert.equal(currentSelection.rotationCycle, 1)
  assert.deepEqual(currentSelection.entries.map((entry) => entry.masteryTermId), [current.id])

  const exhausted = during.map((state) => state.masteryTermId === current.id ? { ...state, lastConsumedRotationCycle: 1 } : state)
  const nextSelection = materializeAdaptiveWarmupSelection({ childId: 'maya', schoolYear: '2026-27', visitType: 'pre-activity', profile: grade2Tier1WritingAdaptiveWarmupProfile, terms, lifecycleAssignments: lifecycles(terms), childStates: exhausted, rotationState: { version: 1, id: 'cycle', childId: 'maya', activityModule: 'mandarin-tier1-writing', cycle: 1 }, random: () => 0.999 })
  assert.equal(nextSelection.rotationCycle, 2)
  assert.equal(nextSelection.rotationAdvanced, true)
  assert.ok(nextSelection.entries.some((entry) => entry.masteryTermId === promoted.id))
})

test('duplicate and rotation behavior comes from the explicit profile policy', () => {
  const definition = term(occurrence('写', 'profile-policy'))
  const state = childState(definition, 'recent-entry')
  const repeatingProfile = {
    ...grade2Tier1WritingAdaptiveWarmupProfile,
    id: 'synthetic-repeating-profile',
    ordinaryDuplicatePolicy: 'repeat-after-unique-exhaustion',
    visits: {
      ...grade2Tier1WritingAdaptiveWarmupProfile.visits,
      'pre-activity': { maximum: 3, allocation: { 'mastery-rotation': 0, 'recent-entry': 1, 'needs-attention': 0 } },
    },
  } as const satisfies AdaptiveWarmupProfile
  const repeated = materializeAdaptiveWarmupSelection({
    childId: 'maya', schoolYear: '2026-27', visitType: 'pre-activity', profile: repeatingProfile,
    terms: [definition], lifecycleAssignments: lifecycles([definition]),
    childStates: [{ ...state, schedulingProfile: { ...state.schedulingProfile, id: repeatingProfile.id } }], random: () => 0.999,
  })
  assert.equal(repeated.entries.length, 3)
  assert.deepEqual(repeated.entries.map((entry) => entry.masteryTermId), [definition.id, definition.id, definition.id])

  const consumed = childState(definition, 'mastery-rotation', { rotationEligibleFromCycle: 1, lastConsumedRotationCycle: 1 })
  const nonAdvancingProfile = {
    ...grade2Tier1WritingAdaptiveWarmupProfile,
    id: 'synthetic-nonadvancing-profile',
    rotationPolicy: { ...grade2Tier1WritingAdaptiveWarmupProfile.rotationPolicy, advanceCycleWhenExhausted: false },
  } as const satisfies AdaptiveWarmupProfile
  assert.throws(() => materializeAdaptiveWarmupSelection({
    childId: 'maya', schoolYear: '2026-27', visitType: 'pre-activity', profile: nonAdvancingProfile,
    terms: [definition], lifecycleAssignments: lifecycles([definition]), childStates: [consumed],
    rotationState: { version: 1, id: 'cycle', childId: 'maya', activityModule: 'mandarin-tier1-writing', cycle: 1 }, random: () => 0.999,
  }), /Next-cycle promotion requires/)

  const currentCycleProfile = {
    ...grade2Tier1WritingAdaptiveWarmupProfile,
    id: 'synthetic-current-cycle-profile',
    rotationPolicy: { ...grade2Tier1WritingAdaptiveWarmupProfile.rotationPolicy, promotedTermEligibility: 'current-cycle' },
  } as const satisfies AdaptiveWarmupProfile
  const currentCyclePromotion = applyAdaptiveWarmupAssessment(
    { ...state, consecutiveCorrect: 1, schedulingProfile: { ...state.schedulingProfile, id: currentCycleProfile.id } },
    { outcome: 'correct', reviewedAt: '2026-09-28T10:00:00.000Z' },
    4,
    currentCycleProfile,
  )
  assert.equal(currentCyclePromotion.rotationEligibleFromCycle, 4)
})

test('a profile cannot strand next-cycle promotions with a non-advancing rotation policy', () => {
  const definition = term(occurrence('写', 'stranded-policy'))
  const invalidProfile = {
    ...grade2Tier1WritingAdaptiveWarmupProfile,
    id: 'stranded-next-cycle-profile',
    rotationPolicy: { ...grade2Tier1WritingAdaptiveWarmupProfile.rotationPolicy, advanceCycleWhenExhausted: false },
  } as const satisfies AdaptiveWarmupProfile

  assert.throws(() => materializeAdaptiveWarmupSelection({
    childId: 'maya',
    schoolYear: '2026-27',
    visitType: 'standalone',
    profile: invalidProfile,
    terms: [definition],
    lifecycleAssignments: lifecycles([definition]),
    childStates: [childState(definition, 'recent-entry')],
  }), /Next-cycle promotion requires/)
})

test('assessment transitions use the exact profile that owns the child state', () => {
  const definition = term(occurrence('写', 'transition-profile-owner'))
  const state = childState(definition, 'recent-entry', { consecutiveCorrect: 1 })
  const promoted = applyAdaptiveWarmupAssessment(
    state,
    { outcome: 'correct', reviewedAt: '2026-09-28T10:00:00.000Z' },
    2,
    grade2Tier1WritingAdaptiveWarmupProfile,
  )
  assert.equal(promoted.bucket, 'mastery-rotation')
  assert.equal(promoted.rotationEligibleFromCycle, 3)

  const wrongOwner = { ...grade2Tier1WritingAdaptiveWarmupProfile, id: 'different-transition-owner' }
  assert.throws(() => applyAdaptiveWarmupAssessment(
    state,
    { outcome: 'correct', reviewedAt: '2026-09-28T10:00:00.000Z' },
    2,
    wrongOwner,
  ), /does not own/)
})

test('profile registry retains historical definitions and requires an explicit version upgrade before selection', () => {
  const definition = term(occurrence('写', 'profile-upgrade'))
  const version1 = grade2Tier1WritingAdaptiveWarmupProfile
  const version2 = {
    ...version1,
    version: 2,
    recentEntryPromotionCorrect: 3,
  } as const satisfies AdaptiveWarmupProfile
  const registry: AdaptiveWarmupProfileRegistry = {
    definitions: [version1, version2],
    activeProfiles: [{
      grade: version2.grade,
      activityModule: version2.activityModule,
      profile: { id: version2.id, version: version2.version },
    }],
    upgrades: [{
      id: 'grade2-writing-v1-to-v2',
      kind: 'version-upgrade',
      from: { id: version1.id, version: version1.version },
      to: { id: version2.id, version: version2.version },
    }],
  }
  assert.deepEqual(validateAdaptiveWarmupProfileRegistry(registry), { valid: true, errors: [] })

  const historicalState = childState(definition, 'recent-entry', { consecutiveCorrect: 1 })
  assert.throws(() => materializeAdaptiveWarmupSelection({
    childId: 'maya',
    schoolYear: '2026-27',
    visitType: 'standalone',
    profile: version1,
    profileRegistry: registry,
    terms: [definition],
    lifecycleAssignments: lifecycles([definition]),
    childStates: [historicalState],
  }), /not the active profile/)
  assert.throws(() => materializeAdaptiveWarmupSelection({
    childId: 'maya',
    schoolYear: '2026-27',
    visitType: 'standalone',
    profile: version2,
    terms: [definition],
    lifecycleAssignments: lifecycles([definition]),
    childStates: [historicalState],
  }), /explicit profile upgrade/)

  const upgraded = upgradeChildMasteryStateToActiveProfile({
    state: historicalState,
    term: definition,
    registry,
    targetGrade: 'Grade 2',
    currentRotationCycle: 1,
  })
  assert.equal(upgraded.status, 'upgraded')
  assert.deepEqual(upgraded.appliedUpgradeIds, ['grade2-writing-v1-to-v2'])
  assert.deepEqual(upgraded.state.schedulingProfile, {
    id: version2.id,
    version: 2,
    sourceOccurrenceId: 'profile-upgrade',
  })

  const selection = materializeAdaptiveWarmupSelection({
    childId: 'maya',
    schoolYear: '2026-27',
    visitType: 'standalone',
    profile: version2,
    terms: [definition],
    lifecycleAssignments: lifecycles([definition]),
    childStates: [upgraded.state],
  })
  assert.deepEqual(selection.profile, { id: version2.id, version: 2 })
})

test('profile upgrade blocks when an active replacement has no declared path', () => {
  const definition = term(occurrence('写', 'missing-profile-upgrade'))
  const version2 = { ...grade2Tier1WritingAdaptiveWarmupProfile, version: 2 } as const satisfies AdaptiveWarmupProfile
  const registry: AdaptiveWarmupProfileRegistry = {
    definitions: [grade2Tier1WritingAdaptiveWarmupProfile, version2],
    activeProfiles: [{
      grade: version2.grade,
      activityModule: version2.activityModule,
      profile: { id: version2.id, version: version2.version },
    }],
    upgrades: [],
  }
  const result = upgradeChildMasteryStateToActiveProfile({
    state: childState(definition, 'recent-entry'),
    term: definition,
    registry,
    targetGrade: 'Grade 2',
    currentRotationCycle: 1,
  })
  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'missing-upgrade-path')
})

test('profile registry supports an explicit grade rebind only after the target-grade occurrence is integrated', () => {
  const grade2Occurrence = occurrence('写', 'grade2-profile-owner')
  const grade5Occurrence = occurrence('写', 'grade5-profile-owner', { kind: 'mastery' }, { grade: 'Grade 5' })
  const definition = term(grade2Occurrence, grade5Occurrence)
  const grade5Profile = {
    ...grade2Tier1WritingAdaptiveWarmupProfile,
    id: 'grade5-tier1-writing-test-profile',
    grade: 'Grade 5',
  } as const satisfies AdaptiveWarmupProfile
  const registry: AdaptiveWarmupProfileRegistry = {
    definitions: [grade2Tier1WritingAdaptiveWarmupProfile, grade5Profile],
    activeProfiles: [
      {
        grade: 'Grade 2', activityModule: grade2Tier1WritingAdaptiveWarmupProfile.activityModule,
        profile: { id: grade2Tier1WritingAdaptiveWarmupProfile.id, version: grade2Tier1WritingAdaptiveWarmupProfile.version },
      },
      {
        grade: 'Grade 5', activityModule: grade5Profile.activityModule,
        profile: { id: grade5Profile.id, version: grade5Profile.version },
      },
    ],
    upgrades: [{
      id: 'grade2-to-grade5-writing-rebind',
      kind: 'grade-rebind',
      from: { id: grade2Tier1WritingAdaptiveWarmupProfile.id, version: grade2Tier1WritingAdaptiveWarmupProfile.version },
      to: { id: grade5Profile.id, version: grade5Profile.version },
    }],
  }
  const state = childState(definition, 'recent-entry')
  const rebound = upgradeChildMasteryStateToActiveProfile({
    state,
    term: definition,
    registry,
    targetGrade: 'Grade 5',
    currentRotationCycle: 1,
  })
  assert.equal(rebound.status, 'upgraded')
  assert.deepEqual(rebound.state.schedulingProfile, {
    id: grade5Profile.id,
    version: grade5Profile.version,
    sourceOccurrenceId: grade5Occurrence.occurrenceId,
  })

  const withoutTargetIntegration = {
    ...state,
    integratedOccurrences: state.integratedOccurrences.filter((record) => record.occurrenceId !== grade5Occurrence.occurrenceId),
  }
  const blocked = upgradeChildMasteryStateToActiveProfile({
    state: withoutTargetIntegration,
    term: definition,
    registry,
    targetGrade: 'Grade 5',
    currentRotationCycle: 1,
  })
  assert.equal(blocked.status, 'blocked')
  assert.equal(blocked.reason, 'missing-rebind-occurrence')
})

test('selection omits an older mastery term while a matching occurrence is active', () => {
  const definition = term(occurrence('写', 'old'), occurrence('写', 'active', { kind: 'test-review', cycle: 1 }))
  const selection = materializeAdaptiveWarmupSelection({ childId: 'maya', schoolYear: '2026-27', visitType: 'standalone', profile: grade2Tier1WritingAdaptiveWarmupProfile, terms: [definition], lifecycleAssignments: lifecycles([definition]), childStates: [childState(definition, 'recent-entry')], random: () => 0.999 })
  assert.deepEqual(selection.entries, [])
})

test('selection provenance includes mastery-eligible occurrences but not future occurrences', () => {
  const definition = term(occurrence('写', 'mastered'), occurrence('写', 'future', { kind: 'future' }))
  const state = childState(definition, 'recent-entry')
  state.integratedOccurrences = state.integratedOccurrences.filter((record) => record.occurrenceId === 'mastered')
  const selection = materializeAdaptiveWarmupSelection({ childId: 'maya', schoolYear: '2026-27', visitType: 'standalone', profile: grade2Tier1WritingAdaptiveWarmupProfile, terms: [definition], lifecycleAssignments: lifecycles([definition]), childStates: [state], random: () => 0.999 })
  assert.deepEqual(selection.entries[0].occurrenceIds, ['mastered'])
})
