import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { finalReviewEvidence } from '../src/application/warmup/modelAdapter.ts'
import { extractGrade5Presentation } from '../src/curriculum/adapters/grade5GoogleSlides.ts'
import { datasetFromCanonicalCandidate } from '../src/curriculum/datasetProjection.ts'
import type { SlidesPresentationPayload } from '../src/curriculum/model.ts'
import {
  commitCompletedSession,
  createInitialState,
  createPracticeSessionForTarget,
  datasetLifecycleResolutionFrom,
  isAppState,
  loadState,
  resolveDatasetLifecycles,
  type PracticeSession,
} from '../src/domain.ts'
import { cloudDataToAppState, cloudSessionFor, type CloudAttempt, type CloudSession } from '../src/firestoreClient.ts'
import { resolveGrade5SourceLifecycle } from '../src/grade5Lab/learningHub.ts'
import { practiceTargetsForLifecycle } from '../src/practice/targets.ts'
import { grade2DeckProfile, importWeeklyDatasets } from '../src/slidesImporter.ts'

const grade2Datasets = importWeeklyDatasets({
  presentationId: grade2DeckProfile.sourceDeckId,
  slides: [
    { objectId: 'week-0908', text: 'Week 9/8-9/11\nMandarin\nTier 1: 一、二、三、四、五' },
    { objectId: 'week-0914', text: 'Week 9/14-9/18\nMandarin\nTier 1: 六、七、八、九、十' },
  ],
}, [], grade2DeckProfile).datasets

function grade5State() {
  const payload = JSON.parse(readFileSync(new URL('./fixtures/grade5-presentation.json', import.meta.url), 'utf8')) as SlidesPresentationPayload
  const extraction = extractGrade5Presentation(payload)
  const datasets = extraction.classification.selectedCandidates
    .filter((candidate) => candidate.status === 'valid')
    .map(datasetFromCanonicalCandidate)
  const lifecycle = resolveGrade5SourceLifecycle(extraction, '2026-09-29')
  return { datasets, lifecycle, resolution: datasetLifecycleResolutionFrom(datasets, lifecycle) }
}

test('Grade 2 compatibility targets explicitly preserve their single Test Review as cycle 1', () => {
  const targets = practiceTargetsForLifecycle(resolveDatasetLifecycles(grade2Datasets, new Date(2026, 8, 14, 12, 0)))
  const review = targets.find((target) => target.phase === 'test-review')

  assert.ok(review)
  assert.equal(review.reviewCycle, 1)
})

test('Grade 5 lifecycle projection exposes Test Review 1 and Test Review 2 as distinct targets', () => {
  const { resolution } = grade5State()
  const targets = practiceTargetsForLifecycle(resolution)
  const reviews = targets.filter((target) => target.phase === 'test-review')

  assert.deepEqual(reviews.map((target) => target.reviewCycle), [1, 2])
  assert.notEqual(reviews[0].dataset.id, reviews[1].dataset.id)
  assert.equal(resolution.testReview?.id, reviews[0].dataset.id, 'the old compatibility field remains cycle 1')
})

test('lifecycle projection fails closed on missing datasets or contradictory review assignments', () => {
  const { datasets, lifecycle } = grade5State()
  assert.throws(
    () => datasetLifecycleResolutionFrom([...datasets, datasets[0]], lifecycle),
    /duplicate canonical dataset IDs/,
  )
  assert.throws(
    () => datasetLifecycleResolutionFrom(datasets.slice(1), lifecycle),
    /unavailable canonical datasets/,
  )
  const repeated = {
    ...lifecycle,
    testReviews: [...lifecycle.testReviews, { ...lifecycle.testReviews[0], cycle: 2 }],
  }
  assert.throws(
    () => datasetLifecycleResolutionFrom(datasets, repeated),
    /assigned more than once/,
  )
  const contradictoryCycle = {
    ...lifecycle,
    testReviews: lifecycle.testReviews.map((review, index) => index === 0 ? { ...review, cycle: review.cycle + 1 } : review),
  }
  assert.throws(
    () => datasetLifecycleResolutionFrom(datasets, contradictoryCycle),
    /contradicts its authoritative assignment/,
  )
})

test('new cloud Test Review sessions always carry one explicit valid cycle identity', () => {
  const legacyCompatible = cloudSessionFor('family-maya', 'maya', 'cycle-1', grade2Datasets[0].id, 'test-review')
  const laterCycle = cloudSessionFor('family-maya', 'maya', 'cycle-2', grade2Datasets[0].id, 'test-review', 'in_progress', 2)
  const acquisition = cloudSessionFor('family-maya', 'maya', 'acquisition', grade2Datasets[0].id, 'acquisition')

  assert.equal(legacyCompatible.reviewCycle, 1)
  assert.equal(laterCycle.reviewCycle, 2)
  assert.equal(acquisition.reviewCycle, undefined)
  assert.throws(
    () => cloudSessionFor('family-maya', 'maya', 'invalid', grade2Datasets[0].id, 'test-review', 'in_progress', 0),
    /invalid Test Review cycle identity/,
  )
  assert.throws(
    () => cloudSessionFor('family-maya', 'maya', 'invalid-acquisition', grade2Datasets[0].id, 'acquisition', 'in_progress', 2),
    /invalid Test Review cycle identity/,
  )
})

test('one Test Review cycle identity survives session, result, score, and completion records', () => {
  const dataset = grade2Datasets[0]
  const started = createPracticeSessionForTarget({
    id: 'cycle-2-session',
    childId: 'maya',
    grade: 'Grade 2',
    target: { dataset, phase: 'test-review', reviewCycle: 2 },
    warmup: { words: [], randomRotationWordIds: [], recentReviewWordIds: [], erroredWordIds: [], rotationCycleId: 1 },
    startedAt: '2026-09-28T19:00:00.000Z',
    random: () => 0,
  })
  const completed: PracticeSession = {
    ...started,
    segment: 'primary',
    stage: 'complete',
    queue: started.primaryQueue,
    warmupSkipped: true,
    primaryAnswers: started.primaryQueue.map((word) => ({ word, correct: true, revealMethod: 'timer' })),
  }
  const state = commitCompletedSession(createInitialState([dataset]), completed, new Date('2026-09-28T19:05:00.000Z'))

  assert.equal(started.reviewCycle, 2)
  assert.ok(state.results.length > 0)
  assert.ok(state.results.every((result) => result.reviewCycle === 2))
  assert.equal(state.scores[0].reviewCycle, 2)
  assert.equal(state.completedSessions[0].reviewCycle, 2)
  assert.equal(finalReviewEvidence(state.results)[0].reviewCycle, 2)

  assert.throws(() => createPracticeSessionForTarget({
    id: 'invalid-cycle', childId: 'maya', grade: 'Grade 2', target: { dataset, phase: 'test-review', reviewCycle: 0 },
    warmup: { words: [], randomRotationWordIds: [], recentReviewWordIds: [], erroredWordIds: [], rotationCycleId: 1 },
    startedAt: '2026-09-28T19:00:00.000Z',
  }), /invalid Test Review cycle/)
})

test('legacy local Test Review records normalize to cycle 1 while explicit cycles remain intact', () => {
  const dataset = grade2Datasets[0]
  const state = createInitialState([dataset])
  state.results.push({ id: 'legacy-result', childId: 'maya', datasetId: dataset.id, datasetDateRange: dataset.dateRange, wordId: dataset.words[0].id, grade: 'Grade 2', phase: 'test-review', sessionId: 'legacy-session', sessionDate: '2026-09-28', completedAt: '2026-09-28T19:05:00.000Z', correct: true, revealMethod: 'timer', scored: true, completeSourceDatasetReviewed: true })
  state.scores.push({ id: 'legacy-score', childId: 'maya', datasetId: dataset.id, datasetDateRange: dataset.dateRange, phase: 'test-review', sessionId: 'legacy-session', sessionDate: '2026-09-28', percent: 100, correct: 1, wordCount: 1 })
  state.completedSessions.push({ id: 'legacy-session', childId: 'maya', sessionDate: '2026-09-28', primaryDatasetId: dataset.id, primaryPhase: 'test-review', complete: true })

  const loaded = loadState(JSON.stringify(state))
  assert.equal(loaded.results[0].reviewCycle, 1)
  assert.equal(loaded.scores[0].reviewCycle, 1)
  assert.equal(loaded.completedSessions[0].reviewCycle, 1)

  const malformed = JSON.parse(JSON.stringify(state))
  malformed.results[0].reviewCycle = 0
  assert.equal(isAppState(malformed), false)

  const mismatched = JSON.parse(JSON.stringify(state))
  mismatched.results[0].reviewCycle = 2
  assert.equal(isAppState(mismatched), false)
})

test('cloud hydration preserves explicit cycle 2 and defaults legacy Test Review data to cycle 1', () => {
  const dataset = grade2Datasets[0]
  const baseSession: CloudSession = {
    id: 'review-2', childId: 'maya', familyId: 'family-maya', sessionDate: '2026-09-28T19:00:00.000Z', localDate: '2026-09-28', startedAt: '2026-09-28T19:00:00.000Z', primaryPhase: 'test-review', datasetId: dataset.id, reviewCycle: 2, status: 'completed', warmupStatus: 'skipped', applicationVersion: 'test',
  }
  const { reviewCycle: _cycle, ...withoutCycle } = baseSession
  const legacySession: CloudSession = { ...withoutCycle, id: 'legacy-review' }
  const attempts: CloudAttempt[] = [
    { id: 'review-2-attempt', sessionId: baseSession.id, wordId: dataset.words[0].id, sourceDatasetId: dataset.id, phase: 'test-review', reviewCycle: 2, correct: true, reviewedAt: '2026-09-28T19:05:00.000Z', completionStatus: 'complete' },
    { id: 'legacy-attempt', sessionId: legacySession.id, wordId: dataset.words[1].id, sourceDatasetId: dataset.id, phase: 'test-review', correct: true, reviewedAt: '2026-09-28T19:06:00.000Z', completionStatus: 'complete' },
  ]
  const scores = [
    { id: 'review-2-score', childId: 'maya', datasetId: dataset.id, datasetDateRange: dataset.dateRange, phase: 'test-review' as const, sessionId: baseSession.id, sessionDate: '2026-09-28', percent: 100, correct: 1, wordCount: 1, reviewCycle: 2 },
    { id: 'legacy-score', childId: 'maya', datasetId: dataset.id, datasetDateRange: dataset.dateRange, phase: 'test-review' as const, sessionId: legacySession.id, sessionDate: '2026-09-28', percent: 100, correct: 1, wordCount: 1 },
  ]
  const hydrated = cloudDataToAppState([dataset], scores, [baseSession, legacySession], attempts, 'maya', 'Grade 2')

  assert.deepEqual(hydrated.results.map((result) => result.reviewCycle), [2, 1])
  assert.deepEqual(hydrated.scores.map((score) => score.reviewCycle), [2, 1])
  assert.deepEqual(hydrated.completedSessions.map((session) => session.reviewCycle), [2, 1])

  const mismatched = cloudDataToAppState([dataset], [{ ...scores[0], reviewCycle: 1 }], [baseSession], [{ ...attempts[0], reviewCycle: 1 }], 'maya', 'Grade 2')
  assert.deepEqual(mismatched.results, [])
  assert.deepEqual(mismatched.scores, [])
})
