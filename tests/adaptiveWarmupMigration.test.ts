import assert from 'node:assert/strict'
import test from 'node:test'
import type { AdaptiveWarmupProfileRegistry, MasteryDatasetLifecycleAssignment } from '../src/warmup/adaptive/contracts.ts'
import { isMasteryTermWarmupEligible } from '../src/warmup/adaptive/eligibility.ts'
import { migrateAdaptiveWarmupStateV2ToV3, type AdaptiveWarmupMigrationOptions, type AdaptiveWarmupV3Projection } from '../src/warmup/adaptive/migration.ts'
import { reconcileAdaptiveWarmupLifecycle } from '../src/warmup/adaptive/lifecycleReconciliation.ts'
import { grade2Tier1WritingAdaptiveWarmupProfile } from '../src/warmup/adaptive/profiles/grade2.ts'
import { materializeAdaptiveWarmupSelection as materializeAdaptiveWarmupSelectionWithRegistry } from '../src/warmup/adaptive/scheduler.ts'
import { activeRegistryForProfiles } from '../src/warmup/adaptive/profileValidation.ts'
import { validateAdaptiveWarmupV3Projection } from '../src/warmup/adaptive/validation.ts'

function profile(grade: string, activityModule: string, id: string) {
  return { ...grade2Tier1WritingAdaptiveWarmupProfile, id, grade, activityModule }
}

function word(datasetId: string, id: string, text: string, metadata: Record<string, unknown> = {}) {
  return { id, text, datasetId, ...metadata }
}

function dataset(id: string, grade: string, words: unknown[], dates: { startDate?: string; endDate?: string } = {}) {
  return { id, grade, schoolYear: '2026-27', words, ...dates }
}

function legacyState(childId: string, datasetId: string, wordId: string, category: string, correctStreak = 0, extra: Record<string, unknown> = {}) {
  return { id: `${childId}::${datasetId}::${wordId}::${category}`, childId, datasetId, wordId, category, correctStreak, ...extra }
}

function lifecycle(datasetId: string, stage: MasteryDatasetLifecycleAssignment['stage'] = { kind: 'mastery' }, finalTestReviewCycle = 1): MasteryDatasetLifecycleAssignment {
  return { datasetId, profileId: 'explicit-test-lifecycle', stage, finalTestReviewCycle }
}

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    version: 2,
    datasets: [],
    childWordStates: [],
    results: [],
    scores: [{ id: 'historical-score' }],
    warmupSessions: [{ id: 'historical-session' }],
    completedSessions: [],
    legacyRecords: [{ id: 'historical-legacy-record' }],
    monthlyRotationScores: [{ id: 'legacy-month', total: 4 }],
    rotationCycles: {},
    acquisitionProgressions: [],
    distractorTargetObservations: [],
    unrelatedFutureField: { preserve: true },
    ...overrides,
  }
}

function projection(result: ReturnType<typeof migrateAdaptiveWarmupStateV2ToV3>) {
  assert.equal(result.status, 'migrated', JSON.stringify(result.report.quarantined))
  return (result.state as { adaptiveWarmup: AdaptiveWarmupV3Projection }).adaptiveWarmup
}

function options(datasetIds: readonly string[], overrides: Partial<AdaptiveWarmupMigrationOptions> = {}): AdaptiveWarmupMigrationOptions {
  return {
    trustedGrade2Tier1DatasetIds: datasetIds,
    lifecycleAssignments: datasetIds.map((id) => lifecycle(id)),
    profileRegistry: activeRegistryForProfiles([grade2Tier1WritingAdaptiveWarmupProfile]),
    ...overrides,
  }
}

function materializeAdaptiveWarmupSelection(
  input: Omit<Parameters<typeof materializeAdaptiveWarmupSelectionWithRegistry>[0], 'profileRegistry'>
    & { profileRegistry?: AdaptiveWarmupProfileRegistry },
) {
  return materializeAdaptiveWarmupSelectionWithRegistry({
    ...input,
    profileRegistry: input.profileRegistry || activeRegistryForProfiles([input.profile]),
  })
}

test('raw v2 migration inventories canonical occurrences before combining child mastery state', () => {
  const raw = baseState({
    datasets: [
      dataset('writing-1', 'Grade 2', [word('writing-1', 'write-1', '写')]),
      dataset('writing-2', 'Grade 2', [word('writing-2', 'write-2', ' 写 ')]),
      dataset('reading', 'Grade 2', [word('reading', 'read-1', '写', { language: 'mandarin', tier: 'tier-2', activityType: 'reading' })]),
      dataset('spelling', 'Grade 3', [word('spelling', 'spell-1', 'Write', { language: 'english', tier: 'tier-3', activityType: 'spelling' })]),
    ],
    childWordStates: [
      legacyState('maya', 'writing-1', 'write-1', 'recent-review', 1),
      legacyState('maya', 'writing-2', 'write-2', 'recent-review', 2),
      legacyState('maya', 'reading', 'read-1', 'random-rotation', 0, { randomCycleId: 2, randomCycleReviewed: true }),
      legacyState('eli', 'writing-1', 'write-1', 'errored-word', 2),
      legacyState('rhys', 'spelling', 'spell-1', 'random-rotation'),
    ],
    results: [{ id: 'warmup-proof', childId: 'maya', datasetId: 'writing-1', wordId: 'write-1', phase: 'warmup', scored: true, correct: true, completedAt: '2026-09-22T10:00:00.000Z' }],
    rotationCycles: { maya: 2, rhys: 4 },
  })
  const untouched = JSON.stringify(raw)
  const migrated = migrateAdaptiveWarmupStateV2ToV3(raw, {
    trustedGrade2Tier1DatasetIds: ['writing-1', 'writing-2'],
    lifecycleAssignments: ['writing-1', 'writing-2', 'reading', 'spelling'].map((id) => lifecycle(id)),
    profileRegistry: activeRegistryForProfiles([
      grade2Tier1WritingAdaptiveWarmupProfile,
      profile('Grade 2', 'mandarin-tier2-reading', 'grade2-tier2-reading-test-profile'),
      profile('Grade 3', 'english-tier3-spelling', 'grade3-tier3-spelling-test-profile'),
    ]),
  })
  const model = projection(migrated)

  assert.equal(JSON.stringify(raw), untouched)
  assert.equal((migrated.state as { version: number }).version, 3)
  assert.deepEqual((migrated.state as { scores: unknown[] }).scores, raw.scores)
  assert.deepEqual((migrated.state as { results: unknown[] }).results, raw.results)
  assert.deepEqual((migrated.state as { unrelatedFutureField: unknown }).unrelatedFutureField, raw.unrelatedFutureField)
  assert.equal(model.terms.length, 3)
  assert.equal(model.lifecycleAssignments.length, 4)
  const writingTerm = model.terms.find((term) => term.identity.activityModule === 'mandarin-tier1-writing')!
  assert.deepEqual(writingTerm.occurrences.map((item) => item.occurrenceId), ['write-1', 'write-2'])
  const mayaWriting = model.childStates.find((item) => item.childId === 'maya' && item.masteryTermId === writingTerm.id)!
  assert.equal(mayaWriting.bucket, 'recent-entry')
  assert.equal(mayaWriting.evidence, 'demonstrated')
  assert.equal(mayaWriting.consecutiveCorrect, 0, 'conflicting collapsed streaks reset')
  assert.ok(model.childStates.some((item) => item.childId === 'eli' && item.bucket === 'needs-attention'))
  assert.equal(model.legacyMonthlyRotationScores.length, 1)
  assert.equal(migrated.report.quarantined.length, 0)
})

test('authoritative lifecycle is child-independent and an active occurrence with no child state suppresses the term', () => {
  const raw = baseState({
    datasets: [
      dataset('old', 'Grade 2', [word('old', 'old-word', '写')]),
      dataset('active', 'Grade 2', [word('active', 'active-word', '写')]),
    ],
    childWordStates: [
      legacyState('maya', 'old', 'old-word', 'random-rotation'),
      legacyState('eli', 'active', 'active-word', 'recent-review'),
    ],
  })
  const migrationOptions = {
    trustedGrade2Tier1DatasetIds: ['old', 'active'],
    lifecycleAssignments: [lifecycle('old'), lifecycle('active', { kind: 'acquisition' })],
    profileRegistry: activeRegistryForProfiles([grade2Tier1WritingAdaptiveWarmupProfile]),
  }
  const forward = projection(migrateAdaptiveWarmupStateV2ToV3(raw, migrationOptions))
  const reversed = projection(migrateAdaptiveWarmupStateV2ToV3({ ...raw, childWordStates: [...raw.childWordStates].reverse() }, migrationOptions))
  assert.deepEqual(forward, reversed)
  assert.equal(forward.terms.length, 1)
  assert.equal(forward.terms[0].occurrences.length, 2)
  assert.equal(isMasteryTermWarmupEligible(forward.terms[0], forward.lifecycleAssignments, { grade: 'Grade 2', schoolYear: '2026-27' }), false)
  assert.equal(forward.childStates.length, 1, 'active child state does not create mastery state')
})

test('missing lifecycle fails closed without hiding the canonical occurrence', () => {
  const raw = baseState({ datasets: [dataset('week', 'Grade 2', [word('week', 'target', '会')])] })
  const model = projection(migrateAdaptiveWarmupStateV2ToV3(raw, { trustedGrade2Tier1DatasetIds: ['week'], profileRegistry: activeRegistryForProfiles([grade2Tier1WritingAdaptiveWarmupProfile]) }))
  assert.equal(model.terms.length, 1)
  assert.deepEqual(model.lifecycleAssignments, [{ occurrenceId: 'target', status: 'unresolved', reason: 'missing' }])
  assert.equal(isMasteryTermWarmupEligible(model.terms[0], model.lifecycleAssignments, { grade: 'Grade 2', schoolYear: '2026-27' }), false)
})

test('migration quarantines malformed and orphaned child rows individually while preserving raw history', () => {
  const orphan = legacyState('maya', 'missing-dataset', 'orphan-word', 'recent-review')
  const malformed = { childId: 'rhys', category: 'recent-review' }
  const valid = legacyState('maya', 'trusted', 'valid-word', 'recent-review')
  const raw = baseState({
    datasets: [dataset('trusted', 'Grade 2', [word('trusted', 'valid-word', '会')])],
    childWordStates: [valid, orphan, malformed],
  })
  const migrated = migrateAdaptiveWarmupStateV2ToV3(raw, options(['trusted']))
  const model = projection(migrated)
  assert.equal(model.childStates.length, 1)
  assert.deepEqual(migrated.report.quarantined.map((issue) => issue.code), ['malformed-child-word-state', 'unresolved-dataset'])
  assert.deepEqual((migrated.state as { childWordStates: unknown[] }).childWordStates, [valid, orphan, malformed])
})

test('global occurrence reuse and deterministic mastery-ID collisions are quarantined', () => {
  const reused = baseState({
    datasets: [
      dataset('one', 'Grade 2', [word('one', 'same-id', '一')]),
      dataset('two', 'Grade 2', [word('two', 'same-id', '二')]),
    ],
  })
  const reusedResult = migrateAdaptiveWarmupStateV2ToV3(reused, options(['one', 'two']))
  assert.equal(projection(reusedResult).terms.length, 0)
  assert.ok(reusedResult.report.quarantined.some((issue) => issue.code === 'global-occurrence-id-collision'))

  const collision = baseState({ datasets: [dataset('trusted', 'Grade 2', [word('trusted', 'one', '一'), word('trusted', 'two', '二')])] })
  const collisionResult = migrateAdaptiveWarmupStateV2ToV3(collision, options(['trusted'], { masteryTermIdFactory: () => 'mastery-v1-forced' }))
  assert.equal(projection(collisionResult).terms.length, 0)
  assert.ok(collisionResult.report.quarantined.some((issue) => issue.code === 'mastery-id-collision'))
})

test('conflicting duplicate datasets, words, and word-to-dataset provenance are deterministic quarantines', () => {
  const raw = baseState({
    datasets: [
      dataset('duplicate', 'Grade 2', [word('duplicate', 'a', '一')]),
      dataset('duplicate', 'Grade 2', [word('duplicate', 'a', '二')]),
      dataset('word-conflict', 'Grade 2', [word('word-conflict', 'b', '三'), word('word-conflict', 'b', '四')]),
      dataset('mismatch', 'Grade 2', [word('wrong-owner', 'c', '五')]),
    ],
  })
  const migrated = migrateAdaptiveWarmupStateV2ToV3(raw, options(['duplicate', 'word-conflict', 'mismatch']))
  const model = projection(migrated)
  assert.equal(model.terms.length, 0)
  assert.deepEqual(migrated.report.quarantined.map((issue) => issue.code), ['conflicting-duplicate-dataset', 'conflicting-duplicate-word', 'word-dataset-mismatch'])
})

test('migration output and report are byte-stable under semantic input permutations', () => {
  const datasets = [
    dataset('one', 'Grade 2', [word('one', 'one-a', ' 写 '), word('one', 'one-b', '读')]),
    dataset('two', 'Grade 2', [word('two', 'two-a', '写')]),
  ]
  const states = [
    legacyState('maya', 'one', 'one-a', 'recent-review', 1),
    legacyState('maya', 'two', 'two-a', 'recent-review', 1),
  ]
  const migrationOptions = options(['one', 'two'])
  const first = migrateAdaptiveWarmupStateV2ToV3(baseState({ datasets, childWordStates: states }), migrationOptions)
  const permutedDatasets = [...datasets].reverse().map((item) => ({ ...item, words: [...item.words].reverse() }))
  const second = migrateAdaptiveWarmupStateV2ToV3(baseState({ datasets: permutedDatasets, childWordStates: [...states].reverse() }), {
    ...migrationOptions,
    trustedGrade2Tier1DatasetIds: [...migrationOptions.trustedGrade2Tier1DatasetIds!].reverse(),
    lifecycleAssignments: [...migrationOptions.lifecycleAssignments!].reverse(),
  })
  assert.equal(
    JSON.stringify((first.state as { adaptiveWarmup: AdaptiveWarmupV3Projection }).adaptiveWarmup),
    JSON.stringify((second.state as { adaptiveWarmup: AdaptiveWarmupV3Projection }).adaptiveWarmup),
  )
})

test('latest incorrect Warmup evidence and collapsed-state disagreement always reset the streak', () => {
  const raw = baseState({
    datasets: [
      dataset('one', 'Grade 2', [word('one', 'one-a', '写')]),
      dataset('two', 'Grade 2', [word('two', 'two-a', ' 写 ')]),
    ],
    childWordStates: [
      legacyState('maya', 'one', 'one-a', 'recent-review', 2),
      legacyState('maya', 'two', 'two-a', 'errored-word', 2),
    ],
    results: [{ id: 'latest-wrong', childId: 'maya', datasetId: 'one', wordId: 'one-a', phase: 'warmup', scored: true, correct: false, completedAt: '2026-09-28T10:00:00.000Z' }],
  })
  const model = projection(migrateAdaptiveWarmupStateV2ToV3(raw, options(['one', 'two'])))
  assert.equal(model.childStates[0].bucket, 'needs-attention')
  assert.equal(model.childStates[0].evidence, 'support-needed')
  assert.equal(model.childStates[0].consecutiveCorrect, 0)
})

test('conflicting legacy Warmup attempt IDs are quarantined without order-dependent state', () => {
  const conflictingResults = [
    { id: 'same-attempt', childId: 'maya', datasetId: 'week', wordId: 'target', phase: 'warmup', scored: true, correct: true, completedAt: '2026-09-28T10:00:00.000Z' },
    { id: 'same-attempt', childId: 'maya', datasetId: 'week', wordId: 'target', phase: 'warmup', scored: true, correct: false, completedAt: '2026-09-28T10:00:00.000Z' },
  ]
  const raw = baseState({
    datasets: [dataset('week', 'Grade 2', [word('week', 'target', '写')])],
    childWordStates: [legacyState('maya', 'week', 'target', 'recent-review', 2)],
    results: conflictingResults,
  })
  const forward = migrateAdaptiveWarmupStateV2ToV3(raw, options(['week']))
  const reversed = migrateAdaptiveWarmupStateV2ToV3({ ...raw, results: [...conflictingResults].reverse() }, options(['week']))

  assert.deepEqual(projection(forward), projection(reversed))
  assert.deepEqual(forward.report.quarantined.map((issue) => issue.code), ['conflicting-warmup-evidence'])
  assert.deepEqual(reversed.report.quarantined.map((issue) => issue.code), ['conflicting-warmup-evidence'])
  assert.deepEqual(
    { evidence: projection(forward).childStates[0].evidence, bucket: projection(forward).childStates[0].bucket, streak: projection(forward).childStates[0].consecutiveCorrect },
    { evidence: 'unassessed', bucket: 'recent-entry', streak: 0 },
  )
})

test('raw final-review conflicts are quarantined before malformed payloads can be filtered out', () => {
  const results = [
    { id: 'raw-conflict', childId: 'maya', datasetId: 'grade2', wordId: 'target', phase: 'test-review', scored: true, completeSourceDatasetReviewed: true, correct: true, completedAt: '2026-09-28T10:00:00.000Z' },
    { id: 'raw-conflict', childId: 'maya', datasetId: 'grade2', wordId: 'target', phase: 'test-review', scored: true, completeSourceDatasetReviewed: true, correct: 'malformed', completedAt: 'not-a-time' },
  ]
  const raw = baseState({
    datasets: [dataset('grade2', 'Grade 2', [word('grade2', 'target', '写')])],
    results,
  })
  const migrationOptions = options(['grade2'], { trustedLegacyFinalReviewDatasetIds: ['grade2'] })
  const forward = migrateAdaptiveWarmupStateV2ToV3(raw, migrationOptions)
  const reversed = migrateAdaptiveWarmupStateV2ToV3({ ...raw, results: [...results].reverse() }, migrationOptions)

  assert.deepEqual(projection(forward), projection(reversed))
  assert.equal(projection(forward).childStates.length, 0)
  assert.deepEqual(forward.report.quarantined.map((issue) => issue.code), ['conflicting-final-review-evidence'])
})

test('a stable attempt ID shared by malformed legacy and valid explicit evidence is quarantined globally', () => {
  const raw = baseState({
    datasets: [dataset('grade2', 'Grade 2', [word('grade2', 'target', '写')])],
    results: [{
      id: 'shared-id', childId: 'maya', datasetId: 'grade2', wordId: 'target', phase: 'test-review',
      scored: true, completeSourceDatasetReviewed: true, correct: true,
    }],
  })
  const migrated = migrateAdaptiveWarmupStateV2ToV3(raw, options(['grade2'], {
    trustedLegacyFinalReviewDatasetIds: ['grade2'],
    finalReviewEvidence: [{
      attemptId: 'shared-id', childId: 'maya', occurrenceId: 'target', reviewCycle: 1,
      reviewedAt: '2026-09-28T10:00:00.000Z', status: 'completed', correct: true,
    }],
  }))
  const model = projection(migrated)
  assert.equal(model.childStates.length, 0)
  assert.equal(migrated.report.quarantined.filter((issue) => issue.recordId === 'shared-id').length, 1)
  assert.equal(migrated.report.quarantined.find((issue) => issue.recordId === 'shared-id')?.code, 'conflicting-final-review-evidence')
})

test('semantically identical legacy and explicit final-review copies collapse to one attempt', () => {
  const raw = baseState({
    datasets: [dataset('grade2', 'Grade 2', [word('grade2', 'target', '写')])],
    results: [{
      id: 'same-id', childId: 'maya', datasetId: 'grade2', wordId: 'target', phase: 'test-review',
      scored: true, completeSourceDatasetReviewed: true, correct: true, completedAt: '2026-09-28T10:00:00.000Z',
    }],
  })
  const migrated = migrateAdaptiveWarmupStateV2ToV3(raw, options(['grade2'], {
    trustedLegacyFinalReviewDatasetIds: ['grade2'],
    finalReviewEvidence: [{
      attemptId: 'same-id', childId: 'maya', occurrenceId: 'target', reviewCycle: 1,
      reviewedAt: '2026-09-28T10:00:00.000Z', status: 'completed', correct: true,
    }],
  }))
  const model = projection(migrated)
  assert.equal(model.childStates.length, 1)
  assert.equal(model.childStates[0].integratedOccurrences[0].sourceAttemptId, 'same-id')
  assert.equal(migrated.report.quarantined.some((issue) => issue.recordId === 'same-id'), false)
})

test('trusted completed final Test Review evidence creates state without legacy Warmup state', () => {
  const raw = baseState({
    datasets: [dataset('grade2', 'Grade 2', [word('grade2', 'target', '写')])],
    results: [
      { id: 'final-correct', childId: 'maya', datasetId: 'grade2', wordId: 'target', phase: 'test-review', scored: true, completeSourceDatasetReviewed: true, correct: true, completedAt: '2026-09-28T10:00:00.000Z' },
      { id: 'not-complete', childId: 'eli', datasetId: 'grade2', wordId: 'target', phase: 'test-review', scored: true, completeSourceDatasetReviewed: false, correct: false, completedAt: '2026-09-28T10:00:00.000Z' },
    ],
  })
  const model = projection(migrateAdaptiveWarmupStateV2ToV3(raw, options(['grade2'], {
    trustedLegacyFinalReviewDatasetIds: ['grade2'],
    finalReviewEvidence: [{ attemptId: 'wrong-cycle', childId: 'rhys', occurrenceId: 'target', reviewCycle: 2, reviewedAt: '2026-09-28T10:00:00.000Z', status: 'completed', correct: true }],
  })))
  assert.equal(model.childStates.length, 1)
  assert.equal(model.childStates[0].childId, 'maya')
  assert.equal(model.childStates[0].evidence, 'demonstrated')
  assert.equal(model.childStates[0].bucket, 'recent-entry')
  assert.equal(model.childStates[0].integratedOccurrences[0].sourceAttemptId, 'final-correct')
})

test('final Test Review evidence corrects stale legacy placement and conflicting attempt IDs are quarantined', () => {
  const raw = baseState({
    datasets: [dataset('grade2', 'Grade 2', [word('grade2', 'target', '写')])],
    childWordStates: [legacyState('maya', 'grade2', 'target', 'recent-review', 2)],
    results: [{ id: 'final-wrong', childId: 'maya', datasetId: 'grade2', wordId: 'target', phase: 'test-review', scored: true, completeSourceDatasetReviewed: true, correct: false, completedAt: '2026-09-28T10:00:00.000Z' }],
  })
  const migrated = migrateAdaptiveWarmupStateV2ToV3(raw, options(['grade2'], {
    trustedLegacyFinalReviewDatasetIds: ['grade2'],
    finalReviewEvidence: [
      { attemptId: 'conflict', childId: 'eli', occurrenceId: 'target', reviewCycle: 1, reviewedAt: '2026-09-28T10:00:00.000Z', status: 'completed', correct: true },
      { attemptId: 'conflict', childId: 'eli', occurrenceId: 'target', reviewCycle: 1, reviewedAt: '2026-09-28T10:00:00.000Z', status: 'completed', correct: false },
    ],
  }))
  const model = projection(migrated)
  assert.equal(model.childStates.length, 1)
  assert.deepEqual({ evidence: model.childStates[0].evidence, bucket: model.childStates[0].bucket, streak: model.childStates[0].consecutiveCorrect }, { evidence: 'support-needed', bucket: 'needs-attention', streak: 0 })
  assert.ok(migrated.report.quarantined.some((issue) => issue.code === 'conflicting-final-review-evidence'))
})

test('final Test Review correctness initializes evidence but never counts toward a Warmup streak', () => {
  const raw = baseState({
    datasets: [dataset('grade2', 'Grade 2', [word('grade2', 'target', '写')])],
    childWordStates: [legacyState('maya', 'grade2', 'target', 'recent-review', 1)],
    results: [
      { id: 'older-warmup-wrong', childId: 'maya', datasetId: 'grade2', wordId: 'target', phase: 'warmup', scored: true, correct: false, completedAt: '2026-09-27T10:00:00.000Z' },
      { id: 'final-correct', childId: 'maya', datasetId: 'grade2', wordId: 'target', phase: 'test-review', scored: true, completeSourceDatasetReviewed: true, correct: true, completedAt: '2026-09-28T10:00:00.000Z' },
    ],
  })
  const model = projection(migrateAdaptiveWarmupStateV2ToV3(raw, options(['grade2'], { trustedLegacyFinalReviewDatasetIds: ['grade2'] })))
  assert.deepEqual(
    { evidence: model.childStates[0].evidence, bucket: model.childStates[0].bucket, streak: model.childStates[0].consecutiveCorrect },
    { evidence: 'demonstrated', bucket: 'recent-entry', streak: 0 },
  )
})

test('final Test Review correctness preserves an existing Needs Attention recovery requirement', () => {
  const raw = baseState({
    datasets: [dataset('grade2', 'Grade 2', [word('grade2', 'target', '写')])],
    childWordStates: [legacyState('maya', 'grade2', 'target', 'errored-word', 2)],
    results: [{ id: 'final-correct', childId: 'maya', datasetId: 'grade2', wordId: 'target', phase: 'test-review', scored: true, completeSourceDatasetReviewed: true, correct: true, completedAt: '2026-09-28T10:00:00.000Z' }],
  })
  const model = projection(migrateAdaptiveWarmupStateV2ToV3(raw, options(['grade2'], { trustedLegacyFinalReviewDatasetIds: ['grade2'] })))
  assert.deepEqual(
    { evidence: model.childStates[0].evidence, bucket: model.childStates[0].bucket, streak: model.childStates[0].consecutiveCorrect },
    { evidence: 'support-needed', bucket: 'needs-attention', streak: 2 },
  )
})

test('migration replays later Warmup evidence after Final Test Review resets placement', () => {
  const raw = baseState({
    datasets: [dataset('grade2', 'Grade 2', [word('grade2', 'target', '写')])],
    childWordStates: [legacyState('maya', 'grade2', 'target', 'random-rotation', 0, { randomCycleId: 2 })],
    results: [
      { id: 'final-correct', childId: 'maya', datasetId: 'grade2', wordId: 'target', phase: 'test-review', scored: true, completeSourceDatasetReviewed: true, correct: true, completedAt: '2026-09-20T10:00:00.000Z' },
      { id: 'warmup-after-final', childId: 'maya', datasetId: 'grade2', wordId: 'target', phase: 'warmup', scored: true, correct: true, completedAt: '2026-09-21T10:00:00.000Z' },
    ],
    rotationCycles: { maya: 2 },
  })
  const model = projection(migrateAdaptiveWarmupStateV2ToV3(raw, options(['grade2'], { trustedLegacyFinalReviewDatasetIds: ['grade2'] })))

  assert.deepEqual(
    { evidence: model.childStates[0].evidence, bucket: model.childStates[0].bucket, streak: model.childStates[0].consecutiveCorrect },
    { evidence: 'demonstrated', bucket: 'recent-entry', streak: 1 },
  )
  assert.equal(model.childStates[0].integratedOccurrences[0].sourceAttemptId, 'final-correct')
  assert.equal(model.childStates[0].lastReviewedAt, '2026-09-21T10:00:00.000Z')
})

test('migration orders equivalent timestamp formats by instant rather than string representation', () => {
  const raw = baseState({
    datasets: [dataset('grade2', 'Grade 2', [word('grade2', 'target', '写')])],
    childWordStates: [legacyState('maya', 'grade2', 'target', 'random-rotation', 0, { randomCycleId: 2 })],
    results: [
      {
        id: 'final-with-offset', childId: 'maya', datasetId: 'grade2', wordId: 'target', phase: 'test-review',
        scored: true, completeSourceDatasetReviewed: true, correct: true, completedAt: '2026-09-20T20:00:00+02:00',
      },
      {
        id: 'warmup-in-zulu', childId: 'maya', datasetId: 'grade2', wordId: 'target', phase: 'warmup',
        scored: true, correct: true, completedAt: '2026-09-20T18:30:00.000Z',
      },
    ],
    rotationCycles: { maya: 2 },
  })
  const model = projection(migrateAdaptiveWarmupStateV2ToV3(raw, options(['grade2'], {
    trustedLegacyFinalReviewDatasetIds: ['grade2'],
  })))
  assert.deepEqual(
    { evidence: model.childStates[0].evidence, bucket: model.childStates[0].bucket, streak: model.childStates[0].consecutiveCorrect },
    { evidence: 'demonstrated', bucket: 'recent-entry', streak: 1 },
  )
})

test('a Warmup attempt already represented by a dated legacy checkpoint is not replayed twice', () => {
  const raw = baseState({
    datasets: [dataset('grade2', 'Grade 2', [word('grade2', 'target', '写')])],
    childWordStates: [legacyState('maya', 'grade2', 'target', 'errored-word', 1, {
      lastReviewedAt: '2026-09-21T10:00:00.000Z',
    })],
    results: [{
      id: 'already-in-snapshot', childId: 'maya', datasetId: 'grade2', wordId: 'target', phase: 'warmup',
      scored: true, correct: true, completedAt: '2026-09-21T10:00:00.000Z',
    }],
  })
  const model = projection(migrateAdaptiveWarmupStateV2ToV3(raw, options(['grade2'])))
  assert.deepEqual(
    { evidence: model.childStates[0].evidence, bucket: model.childStates[0].bucket, streak: model.childStates[0].consecutiveCorrect },
    { evidence: 'support-needed', bucket: 'needs-attention', streak: 1 },
  )
  assert.deepEqual(model.childStates[0].appliedLegacyWarmupAttempts, [])
})

test('a dated legacy streak after Final Test Review remains authoritative when its attempt row is missing', () => {
  const raw = baseState({
    datasets: [dataset('grade2', 'Grade 2', [word('grade2', 'target', '写')])],
    childWordStates: [legacyState('maya', 'grade2', 'target', 'recent-review', 1, {
      lastReviewedAt: '2026-09-22T10:00:00.000Z',
    })],
    results: [{
      id: 'final-before-snapshot', childId: 'maya', datasetId: 'grade2', wordId: 'target', phase: 'test-review',
      scored: true, completeSourceDatasetReviewed: true, correct: true, completedAt: '2026-09-20T10:00:00.000Z',
    }],
  })
  const model = projection(migrateAdaptiveWarmupStateV2ToV3(raw, options(['grade2'], {
    trustedLegacyFinalReviewDatasetIds: ['grade2'],
  })))
  assert.deepEqual(
    { evidence: model.childStates[0].evidence, bucket: model.childStates[0].bucket, streak: model.childStates[0].consecutiveCorrect },
    { evidence: 'demonstrated', bucket: 'recent-entry', streak: 1 },
  )
  assert.equal(model.childStates[0].lastReviewedAt, '2026-09-22T10:00:00.000Z')
  assert.equal(model.childStates[0].integratedOccurrences[0].sourceAttemptId, 'final-before-snapshot')
  assert.equal(model.childStates[0].integratedOccurrences[0].evidence, 'correct')
})

test('Warmup evidence on an older occurrence replays after a newer curriculum reintroduction', () => {
  const raw = baseState({
    datasets: [
      dataset('older', 'Grade 2', [word('older', 'older-target', '写')], { startDate: '2026-09-01', endDate: '2026-09-07' }),
      dataset('newer', 'Grade 2', [word('newer', 'newer-target', '写')], { startDate: '2026-09-15', endDate: '2026-09-20' }),
    ],
    childWordStates: [legacyState('maya', 'older', 'older-target', 'random-rotation', 0, {
      lastReviewedAt: '2026-09-10T10:00:00.000Z', randomCycleId: 2,
    })],
    results: [
      {
        id: 'newer-final', childId: 'maya', datasetId: 'newer', wordId: 'newer-target', phase: 'test-review',
        scored: true, completeSourceDatasetReviewed: true, correct: true, completedAt: '2026-09-20T10:00:00.000Z',
      },
      {
        id: 'older-word-later-warmup', childId: 'maya', datasetId: 'older', wordId: 'older-target', phase: 'warmup',
        scored: true, correct: true, completedAt: '2026-09-21T10:00:00.000Z',
      },
    ],
    rotationCycles: { maya: 2 },
  })
  const model = projection(migrateAdaptiveWarmupStateV2ToV3(raw, options(['older', 'newer'], {
    trustedLegacyFinalReviewDatasetIds: ['newer'],
  })))
  assert.deepEqual(
    { evidence: model.childStates[0].evidence, bucket: model.childStates[0].bucket, streak: model.childStates[0].consecutiveCorrect },
    { evidence: 'demonstrated', bucket: 'recent-entry', streak: 1 },
  )
  assert.deepEqual(model.childStates[0].integratedOccurrences.map((record) => record.occurrenceId).sort(), ['newer-target', 'older-target'])
  assert.deepEqual(model.childStates[0].appliedLegacyWarmupAttempts?.map((attempt) => attempt.attemptId), ['older-word-later-warmup'])
})

test('noncompleted final-review outcomes initialize unassessed Recent Entry state', () => {
  const raw = baseState({ datasets: [dataset('grade2', 'Grade 2', [word('grade2', 'target', '写')])] })
  const statuses = ['skipped', 'unanswered', 'abandoned'] as const
  const finalReviewEvidence = statuses.map((status, index) => ({
    attemptId: `final-${status}`,
    childId: `child-${index}`,
    occurrenceId: 'target',
    reviewCycle: 1,
    reviewedAt: `2026-09-2${index + 1}T10:00:00.000Z`,
    status,
  }))
  const model = projection(migrateAdaptiveWarmupStateV2ToV3(raw, options(['grade2'], { finalReviewEvidence })))

  assert.equal(model.childStates.length, 3)
  for (const state of model.childStates) {
    assert.deepEqual(
      { evidence: state.evidence, bucket: state.bucket, streak: state.consecutiveCorrect },
      { evidence: 'unassessed', bucket: 'recent-entry', streak: 0 },
    )
    assert.equal(state.integratedOccurrences[0].evidence, 'none')
    assert.ok(state.integratedOccurrences[0].sourceAttemptId?.startsWith('final-'))
    assert.equal(state.lastReviewedAt, undefined)
  }
})

test('migration normalizes impossible legacy streak states conservatively', () => {
  const raw = baseState({
    datasets: [
      dataset('unassessed', 'Grade 2', [word('unassessed', 'unassessed-word', '写')]),
      dataset('recovering', 'Grade 2', [word('recovering', 'recovering-word', '读')]),
    ],
    childWordStates: [
      legacyState('maya', 'unassessed', 'unassessed-word', 'recent-review', 2),
      legacyState('maya', 'recovering', 'recovering-word', 'errored-word', 3),
    ],
  })
  const model = projection(migrateAdaptiveWarmupStateV2ToV3(raw, options(['unassessed', 'recovering'])))
  const unassessed = model.childStates.find((state) => state.evidence === 'unassessed')!
  const recovering = model.childStates.find((state) => state.bucket === 'needs-attention')!
  assert.equal(unassessed.consecutiveCorrect, 0)
  assert.equal(recovering.evidence, 'support-needed')
  assert.equal(recovering.consecutiveCorrect, 0)
})

test('completed final-review integration keeps reviewed and incorrect timestamps coherent across repeated occurrences', () => {
  const raw = baseState({
    datasets: [
      dataset('older', 'Grade 2', [word('older', 'older-word', '写')]),
      dataset('newer', 'Grade 2', [word('newer', 'newer-word', ' 写 ')]),
    ],
    childWordStates: [legacyState('maya', 'older', 'older-word', 'errored-word', 1, {
      lastReviewedAt: '2026-09-20T10:00:00.000Z',
      lastIncorrectAt: '2026-09-20T10:00:00.000Z',
    })],
  })
  const model = projection(migrateAdaptiveWarmupStateV2ToV3(raw, options(['older', 'newer'], {
    finalReviewEvidence: [
      { attemptId: 'newer-correct', childId: 'maya', occurrenceId: 'newer-word', reviewCycle: 1, reviewedAt: '2026-09-28T10:00:00.000Z', status: 'completed', correct: true },
    ],
  })))
  const state = model.childStates[0]
  assert.equal(state.bucket, 'needs-attention')
  assert.equal(state.lastIncorrectAt, '2026-09-20T10:00:00.000Z')
  assert.equal(state.lastReviewedAt, '2026-09-28T10:00:00.000Z')
  assert.equal(validateAdaptiveWarmupV3Projection(model, { profileRegistry: activeRegistryForProfiles([grade2Tier1WritingAdaptiveWarmupProfile]) }).valid, true)
})

test('migration normalizes a legacy incorrect timestamp later than last reviewed without losing unrelated state', () => {
  const raw = baseState({
    datasets: [
      dataset('inconsistent', 'Grade 2', [word('inconsistent', 'inconsistent-word', '写')]),
      dataset('unrelated', 'Grade 2', [word('unrelated', 'unrelated-word', '读')]),
    ],
    childWordStates: [
      legacyState('maya', 'inconsistent', 'inconsistent-word', 'errored-word', 1, {
        lastReviewedAt: '2026-09-20T10:00:00.000Z',
        lastIncorrectAt: '2026-09-21T10:00:00.000Z',
      }),
      legacyState('eli', 'unrelated', 'unrelated-word', 'recent-review', 0),
    ],
  })
  const model = projection(migrateAdaptiveWarmupStateV2ToV3(raw, options(['inconsistent', 'unrelated'])))
  assert.equal(model.childStates.length, 2)
  const normalized = model.childStates.find((state) => state.childId === 'maya')!
  assert.equal(normalized.lastIncorrectAt, '2026-09-21T10:00:00.000Z')
  assert.equal(normalized.lastReviewedAt, '2026-09-21T10:00:00.000Z')
  assert.ok(model.childStates.some((state) => state.childId === 'eli'))
})

test('Grade 2 migration promotes a demonstrated Recent Entry streak at its explicit profile threshold', () => {
  const raw = baseState({
    datasets: [dataset('week', 'Grade 2', [word('week', 'target', '写')])],
    childWordStates: [legacyState('maya', 'week', 'target', 'recent-review', 2)],
    results: [{ id: 'second-correct', childId: 'maya', datasetId: 'week', wordId: 'target', phase: 'warmup', scored: true, correct: true, completedAt: '2026-09-28T10:00:00.000Z' }],
  })
  const model = projection(migrateAdaptiveWarmupStateV2ToV3(raw, options(['week'])))
  assert.deepEqual(
    {
      evidence: model.childStates[0].evidence,
      bucket: model.childStates[0].bucket,
      streak: model.childStates[0].consecutiveCorrect,
      eligible: model.childStates[0].rotationEligibleFromCycle,
    },
    { evidence: 'demonstrated', bucket: 'mastery-rotation', streak: 0, eligible: 2 },
  )
})

test('migration reconciles a missing global rotation cycle from the legacy per-word cycle', () => {
  const raw = baseState({
    datasets: [dataset('week', 'Grade 2', [word('week', 'target', '写')])],
    childWordStates: [legacyState('maya', 'week', 'target', 'random-rotation', 0, { randomCycleId: 3, randomCycleReviewed: false })],
  })
  const model = projection(migrateAdaptiveWarmupStateV2ToV3(raw, options(['week'])))
  assert.equal(model.rotationStates[0].cycle, 3)
  assert.equal(model.childStates[0].rotationEligibleFromCycle, 3)
  const selection = materializeAdaptiveWarmupSelection({
    childId: 'maya',
    schoolYear: '2026-27',
    visitType: 'standalone',
    profile: grade2Tier1WritingAdaptiveWarmupProfile,
    terms: model.terms,
    lifecycleAssignments: model.lifecycleAssignments,
    childStates: model.childStates,
    rotationState: model.rotationStates[0],
    random: () => 0.999,
  })
  assert.deepEqual(selection.entries.map((entry) => entry.masteryTermId), [model.terms[0].id])
})

test('migration reconciles rotation cycles before assigning next-cycle promotion eligibility', () => {
  const raw = baseState({
    datasets: [dataset('week', 'Grade 2', [word('week', 'target', '写')])],
    childWordStates: [legacyState('maya', 'week', 'target', 'recent-review', 2, { randomCycleId: 3 })],
    results: [{ id: 'second-correct', childId: 'maya', datasetId: 'week', wordId: 'target', phase: 'warmup', scored: true, correct: true, completedAt: '2026-09-28T10:00:00.000Z' }],
    rotationCycles: { maya: 1 },
  })
  const model = projection(migrateAdaptiveWarmupStateV2ToV3(raw, options(['week'])))
  const state = model.childStates[0]

  assert.equal(model.rotationStates[0].cycle, 3)
  assert.equal(state.bucket, 'mastery-rotation')
  assert.equal(state.rotationEligibleFromCycle, 4)
  const selection = materializeAdaptiveWarmupSelection({
    childId: 'maya',
    schoolYear: '2026-27',
    visitType: 'standalone',
    profile: grade2Tier1WritingAdaptiveWarmupProfile,
    terms: model.terms,
    lifecycleAssignments: model.lifecycleAssignments,
    childStates: model.childStates,
    rotationState: model.rotationStates[0],
    random: () => 0.999,
  })
  assert.equal(selection.rotationCycle, 4)
  assert.equal(selection.rotationAdvanced, true)
  assert.deepEqual(selection.entries.map((entry) => entry.masteryTermId), [model.terms[0].id])
})

test('a later mastered occurrence with no legacy row is integrated and resets an existing stable term to unassessed Recent Entry', () => {
  const raw = baseState({
    datasets: [
      { ...dataset('week-1', 'Grade 2', [word('week-1', 'first', '写')]), startDate: '2026-09-07', endDate: '2026-09-11' },
      { ...dataset('week-2', 'Grade 2', [word('week-2', 'second', '写')]), startDate: '2026-09-14', endDate: '2026-09-18' },
    ],
    childWordStates: [legacyState('maya', 'week-1', 'first', 'random-rotation', 0, { randomCycleId: 2 })],
    rotationCycles: { maya: 2 },
  })
  const model = projection(migrateAdaptiveWarmupStateV2ToV3(raw, options(['week-1', 'week-2'])))
  const state = model.childStates[0]

  assert.deepEqual(state.integratedOccurrences.map(({ occurrenceId, evidence }) => ({ occurrenceId, evidence })), [
    { occurrenceId: 'first', evidence: 'none' },
    { occurrenceId: 'second', evidence: 'none' },
  ])
  assert.deepEqual(
    { evidence: state.evidence, bucket: state.bucket, streak: state.consecutiveCorrect },
    { evidence: 'unassessed', bucket: 'recent-entry', streak: 0 },
  )
  assert.equal(state.schedulingProfile.sourceOccurrenceId, 'second')
})

test('version-3 validation rejects identity, lifecycle, and graph-reference inconsistencies', () => {
  const raw = baseState({
    datasets: [dataset('week', 'Grade 2', [word('week', 'one', '写'), word('week', 'two', '读')])],
    childWordStates: [legacyState('maya', 'week', 'one', 'recent-review')],
  })
  const valid = projection(migrateAdaptiveWarmupStateV2ToV3(raw, options(['week'])))
  const validationOptions = { profileRegistry: activeRegistryForProfiles([grade2Tier1WritingAdaptiveWarmupProfile]) }
  assert.equal(validateAdaptiveWarmupV3Projection(valid, validationOptions).valid, true)

  const mismatchedText = structuredClone(valid)
  mismatchedText.terms[0].occurrences[0].displayText = '不匹配'
  assert.equal(validateAdaptiveWarmupV3Projection(mismatchedText, validationOptions).valid, false)

  const missingRotation = structuredClone(valid)
  missingRotation.rotationStates = []
  assert.equal(validateAdaptiveWarmupV3Projection(missingRotation, validationOptions).valid, false)

  const inconsistentDatasetLifecycle = structuredClone(valid)
  inconsistentDatasetLifecycle.lifecycleAssignments[1] = {
    ...inconsistentDatasetLifecycle.lifecycleAssignments[1],
    status: 'resolved',
    profileId: 'explicit-test-lifecycle',
    stage: { kind: 'acquisition' },
    finalTestReviewCycle: 1,
  }
  assert.equal(validateAdaptiveWarmupV3Projection(inconsistentDatasetLifecycle, validationOptions).valid, false)

  const malformedIntegration = structuredClone(valid)
  malformedIntegration.childStates[0].integratedOccurrences[0].sourceAttemptId = 'missing-timestamp'
  assert.equal(validateAdaptiveWarmupV3Projection(malformedIntegration, validationOptions).valid, false)

  const activeIntegration = structuredClone(valid)
  for (const assignment of activeIntegration.lifecycleAssignments) {
    Object.assign(assignment, { status: 'resolved', profileId: 'explicit-test-lifecycle', stage: { kind: 'acquisition' }, finalTestReviewCycle: 1 })
  }
  activeIntegration.migrationReport.activeOccurrenceCount = activeIntegration.lifecycleAssignments.length
  assert.equal(validateAdaptiveWarmupV3Projection(activeIntegration, validationOptions).valid, true)

  const mismatchedIntegrationBasis = structuredClone(valid)
  mismatchedIntegrationBasis.childStates[0].integratedOccurrences[0].eligibilityBasis.lifecycleProfileId = 'different-lifecycle-profile'
  assert.equal(validateAdaptiveWarmupV3Projection(mismatchedIntegrationBasis, validationOptions).valid, false)

  const impossibleUnassessedStreak = structuredClone(valid)
  impossibleUnassessedStreak.childStates[0].evidence = 'unassessed'
  impossibleUnassessedStreak.childStates[0].bucket = 'recent-entry'
  impossibleUnassessedStreak.childStates[0].consecutiveCorrect = 2
  assert.equal(validateAdaptiveWarmupV3Projection(impossibleUnassessedStreak, validationOptions).valid, false)

  const impossibleRecoveryStreak = structuredClone(valid)
  impossibleRecoveryStreak.childStates[0].evidence = 'support-needed'
  impossibleRecoveryStreak.childStates[0].bucket = 'needs-attention'
  impossibleRecoveryStreak.childStates[0].consecutiveCorrect = 3
  assert.equal(validateAdaptiveWarmupV3Projection(impossibleRecoveryStreak, validationOptions).valid, false)

  const completedRecentEntry = structuredClone(valid)
  completedRecentEntry.childStates[0].evidence = 'demonstrated'
  completedRecentEntry.childStates[0].bucket = 'recent-entry'
  completedRecentEntry.childStates[0].consecutiveCorrect = 2
  assert.equal(validateAdaptiveWarmupV3Projection(completedRecentEntry, validationOptions).valid, false)

  const impossibleRotationCycle = structuredClone(valid)
  impossibleRotationCycle.childStates[0].evidence = 'demonstrated'
  impossibleRotationCycle.childStates[0].bucket = 'mastery-rotation'
  impossibleRotationCycle.childStates[0].consecutiveCorrect = 0
  impossibleRotationCycle.childStates[0].rotationEligibleFromCycle = impossibleRotationCycle.rotationStates[0].cycle + 2
  assert.equal(validateAdaptiveWarmupV3Projection(impossibleRotationCycle, validationOptions).valid, false)
})

test('mixed-grade longitudinal terms validate against the exact stored scheduling profile', () => {
  const raw = baseState({
    datasets: [dataset('grade2', 'Grade 2', [word('grade2', 'grade2-word', '写')])],
    childWordStates: [legacyState('maya', 'grade2', 'grade2-word', 'recent-review', 1)],
  })
  const model = structuredClone(projection(migrateAdaptiveWarmupStateV2ToV3(raw, options(['grade2']))))
  const grade2Occurrence = model.terms[0].occurrences[0]
  const grade5Occurrence = {
    ...grade2Occurrence,
    occurrenceId: 'grade5-word',
    wordId: 'grade5-word',
    datasetId: 'grade5',
    grade: 'Grade 5',
  }
  model.terms[0].occurrences.push(grade5Occurrence)
  model.lifecycleAssignments.push({ occurrenceId: 'grade5-word', status: 'resolved', profileId: 'synthetic-grade5-lifecycle', stage: { kind: 'mastery' }, finalTestReviewCycle: 2 })
  model.childStates[0].integratedOccurrences.push({
    occurrenceId: 'grade5-word',
    evidence: 'none',
    eligibilityBasis: { kind: 'verified-mastery', lifecycleProfileId: 'synthetic-grade5-lifecycle', finalTestReviewCycle: 2 },
  })
  model.migrationReport.migratedOccurrenceCount += 1
  const grade5Profile = profile('Grade 5', 'mandarin-tier1-writing', 'grade5-tier1-writing-test-profile')

  assert.equal(validateAdaptiveWarmupV3Projection(model, { profileRegistry: activeRegistryForProfiles([grade2Tier1WritingAdaptiveWarmupProfile, grade5Profile]) }).valid, true)
  assert.equal(validateAdaptiveWarmupV3Projection(model, { profileRegistry: activeRegistryForProfiles([grade5Profile]) }).valid, false)
})

test('version-3 validation preserves historical integration while current lifecycle suppression stays mutable', () => {
  const raw = baseState({
    datasets: [dataset('week', 'Grade 2', [word('week', 'target', '写')])],
    childWordStates: [legacyState('maya', 'week', 'target', 'recent-review', 1)],
  })
  const model = structuredClone(projection(migrateAdaptiveWarmupStateV2ToV3(raw, options(['week']))))
  const reconciled = reconcileAdaptiveWarmupLifecycle({
    terms: model.terms,
    currentAssignments: model.lifecycleAssignments,
    authoritativeAssignments: [],
  })
  assert.equal(reconciled.status, 'attention-required')
  assert.equal(reconciled.issues[0].code, 'missing-authoritative-assignment')
  model.lifecycleAssignments = reconciled.lifecycleAssignments
  model.migrationReport.activeOccurrenceCount = reconciled.activeOccurrenceCount

  const validation = validateAdaptiveWarmupV3Projection(model, { profileRegistry: activeRegistryForProfiles([grade2Tier1WritingAdaptiveWarmupProfile]) })
  assert.equal(validation.valid, true, validation.errors.join('\n'))
  assert.equal(isMasteryTermWarmupEligible(
    model.terms[0],
    model.lifecycleAssignments,
    { grade: 'Grade 2', schoolYear: '2026-27' },
  ), false)
  const selection = materializeAdaptiveWarmupSelection({
    childId: 'maya',
    schoolYear: '2026-27',
    visitType: 'standalone',
    profile: grade2Tier1WritingAdaptiveWarmupProfile,
    terms: model.terms,
    lifecycleAssignments: model.lifecycleAssignments,
    childStates: model.childStates,
  })
  assert.deepEqual(selection.entries, [])
})

test('missing legacy childWordStates is treated as empty while a present malformed collection fails safely', () => {
  const missing = baseState({ datasets: [dataset('week', 'Grade 2', [word('week', 'target', '写')])] }) as Record<string, unknown>
  delete missing.childWordStates
  assert.equal(migrateAdaptiveWarmupStateV2ToV3(missing, options(['week'])).status, 'migrated')

  const malformed = baseState({ childWordStates: 'not-an-array' })
  const result = migrateAdaptiveWarmupStateV2ToV3(malformed, { profileRegistry: activeRegistryForProfiles([grade2Tier1WritingAdaptiveWarmupProfile]) })
  assert.equal(result.status, 'failed')
  assert.strictEqual(result.state, malformed)
})

test('strict version-3 validation rejects malformed pseudo-migrations without replacing the raw record', () => {
  const malformed = { version: 3, adaptiveWarmup: { schemaVersion: 3, migrationReport: { quarantined: [] } } }
  const result = migrateAdaptiveWarmupStateV2ToV3(malformed, { profileRegistry: activeRegistryForProfiles([grade2Tier1WritingAdaptiveWarmupProfile]) })
  assert.equal(result.status, 'failed')
  assert.strictEqual(result.state, malformed)
  assert.equal(result.report.quarantined[0].code, 'invalid-v3-projection')
})

test('successful conversion is idempotent and fatal top-level failures preserve the original record', () => {
  const raw = baseState({
    datasets: [dataset('trusted', 'Grade 2', [word('trusted', 'one', '一')])],
    childWordStates: [legacyState('maya', 'trusted', 'one', 'random-rotation', 0, { randomCycleId: 3 })],
    rotationCycles: { maya: 3 },
  })
  const migrationOptions = options(['trusted'])
  const first = migrateAdaptiveWarmupStateV2ToV3(raw, migrationOptions)
  const second = migrateAdaptiveWarmupStateV2ToV3(first.state, migrationOptions)
  assert.equal(second.status, 'already-migrated')
  assert.strictEqual(second.state, first.state)

  const unsupported = { version: 1, childWordStates: [{ preserve: true }] }
  const unsupportedResult = migrateAdaptiveWarmupStateV2ToV3(unsupported)
  assert.equal(unsupportedResult.status, 'failed')
  assert.strictEqual(unsupportedResult.state, unsupported)
})

test('migration and version-3 validation require the same explicit profile registry', () => {
  const raw = baseState({
    datasets: [dataset('trusted', 'Grade 2', [word('trusted', 'one', '一')])],
    childWordStates: [legacyState('maya', 'trusted', 'one', 'recent-review', 1)],
  })
  const withoutProfiles = migrateAdaptiveWarmupStateV2ToV3(raw)
  assert.equal(withoutProfiles.status, 'failed')
  assert.equal(withoutProfiles.report.quarantined[0].code, 'invalid-adaptive-profile-registry')

  const migrationOptions = options(['trusted'])
  const migrated = migrateAdaptiveWarmupStateV2ToV3(raw, migrationOptions)
  assert.equal(migrated.status, 'migrated')
  assert.equal(migrateAdaptiveWarmupStateV2ToV3(migrated.state, migrationOptions).status, 'already-migrated')
  assert.equal(migrateAdaptiveWarmupStateV2ToV3(migrated.state, { ...migrationOptions, profileRegistry: activeRegistryForProfiles([]) }).status, 'failed')
})

test('missing profile coverage produces a retryable partial migration that completes after registration', () => {
  const grade5Profile = profile('Grade 5', 'mandarin-tier1-writing', 'grade5-tier1-writing-test-profile')
  const raw = baseState({
    datasets: [dataset('grade5', 'Grade 5', [word('grade5', 'grade5-target', '写', {
      language: 'mandarin', tier: 'tier-1', activityType: 'dictation',
    })])],
    childWordStates: [legacyState('maya', 'grade5', 'grade5-target', 'recent-review', 1, {
      lastReviewedAt: '2026-09-25T10:00:00.000Z',
    })],
  })
  const grade2Only = activeRegistryForProfiles([grade2Tier1WritingAdaptiveWarmupProfile])
  const completeRegistry: AdaptiveWarmupProfileRegistry = activeRegistryForProfiles([
    grade2Tier1WritingAdaptiveWarmupProfile,
    grade5Profile,
  ])
  const migrationOptions: AdaptiveWarmupMigrationOptions = {
    lifecycleAssignments: [lifecycle('grade5', { kind: 'mastery' }, 2)],
    profileRegistry: grade2Only,
  }
  const partial = migrateAdaptiveWarmupStateV2ToV3(raw, migrationOptions)
  assert.equal(partial.status, 'partially-migrated')
  const partialProjection = (partial.state as { adaptiveWarmup: AdaptiveWarmupV3Projection }).adaptiveWarmup
  assert.equal(partialProjection.migrationStatus, 'partial')
  assert.equal(partialProjection.childStates.length, 0)
  assert.equal(partialProjection.deferredRecords.length, 1)
  assert.equal(partialProjection.deferredRecords[0].reason, 'missing-profile')

  const completed = migrateAdaptiveWarmupStateV2ToV3(partial.state, {
    ...migrationOptions,
    profileRegistry: completeRegistry,
  })
  assert.equal(completed.status, 'migrated')
  const completedProjection = (completed.state as { adaptiveWarmup: AdaptiveWarmupV3Projection }).adaptiveWarmup
  assert.equal(completedProjection.migrationStatus, 'complete')
  assert.equal(completedProjection.deferredRecords.length, 0)
  assert.equal(completedProjection.childStates.length, 1)
  assert.equal(completedProjection.childStates[0].consecutiveCorrect, 1)

  const fresh = projection(migrateAdaptiveWarmupStateV2ToV3(raw, {
    ...migrationOptions,
    profileRegistry: completeRegistry,
  }))
  assert.deepEqual(completedProjection, fresh)
})

test('missing profile coverage defers Warmup evidence even when no legacy child snapshot exists', () => {
  const grade5Profile = profile('Grade 5', 'mandarin-tier1-writing', 'grade5-tier1-writing-test-profile')
  const raw = baseState({
    datasets: [dataset('grade5', 'Grade 5', [word('grade5', 'grade5-target', '写', {
      language: 'mandarin', tier: 'tier-1', activityType: 'dictation',
    })])],
    results: [{
      id: 'grade5-warmup', childId: 'maya', datasetId: 'grade5', wordId: 'grade5-target', phase: 'warmup',
      scored: true, correct: true, completedAt: '2026-09-25T10:00:00.000Z',
    }],
  })
  const baseOptions: AdaptiveWarmupMigrationOptions = {
    lifecycleAssignments: [lifecycle('grade5', { kind: 'mastery' }, 2)],
    profileRegistry: activeRegistryForProfiles([grade2Tier1WritingAdaptiveWarmupProfile]),
  }
  const partial = migrateAdaptiveWarmupStateV2ToV3(raw, baseOptions)
  assert.equal(partial.status, 'partially-migrated')
  const partialProjection = (partial.state as { adaptiveWarmup: AdaptiveWarmupV3Projection }).adaptiveWarmup
  assert.deepEqual(partialProjection.deferredRecords.map((record) => record.collection), ['results'])

  const completed = migrateAdaptiveWarmupStateV2ToV3(partial.state, {
    ...baseOptions,
    profileRegistry: activeRegistryForProfiles([grade2Tier1WritingAdaptiveWarmupProfile, grade5Profile]),
  })
  assert.equal(completed.status, 'migrated')
  const completedProjection = (completed.state as { adaptiveWarmup: AdaptiveWarmupV3Projection }).adaptiveWarmup
  assert.deepEqual(
    {
      evidence: completedProjection.childStates[0].evidence,
      bucket: completedProjection.childStates[0].bucket,
      streak: completedProjection.childStates[0].consecutiveCorrect,
    },
    { evidence: 'demonstrated', bucket: 'recent-entry', streak: 1 },
  )
  assert.deepEqual(completedProjection.childStates[0].appliedLegacyWarmupAttempts?.map((attempt) => attempt.attemptId), ['grade5-warmup'])
})

test('version-3 validation rejects a source attempt ID reused anywhere in the mastery graph', () => {
  const raw = baseState({
    datasets: [dataset('grade2', 'Grade 2', [word('grade2', 'target', '写')])],
    results: [{
      id: 'final-attempt', childId: 'maya', datasetId: 'grade2', wordId: 'target', phase: 'test-review',
      scored: true, completeSourceDatasetReviewed: true, correct: true, completedAt: '2026-09-28T10:00:00.000Z',
    }],
  })
  const model = structuredClone(projection(migrateAdaptiveWarmupStateV2ToV3(raw, options(['grade2'], {
    trustedLegacyFinalReviewDatasetIds: ['grade2'],
  }))))
  model.childStates[0].appliedLegacyWarmupAttempts = [{
    attemptId: 'final-attempt',
    reviewedAt: '2026-09-29T10:00:00.000Z',
    correct: true,
    payloadFingerprint: 'different-payload',
  }]
  const validation = validateAdaptiveWarmupV3Projection(model, {
    profileRegistry: activeRegistryForProfiles([grade2Tier1WritingAdaptiveWarmupProfile]),
  })
  assert.equal(validation.valid, false)
  assert.ok(validation.errors.some((error) => error.includes('Source attempt final-attempt is referenced more than once')))
})
