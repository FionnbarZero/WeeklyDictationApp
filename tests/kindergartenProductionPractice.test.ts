import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { productionSourceIsActive } from '../src/config.ts'
import { datasetFromCanonicalCandidate, isSourceNeutralCanonicalDataset } from '../src/curriculum/datasetProjection.ts'
import type { SheetsWorkbookPayload } from '../src/curriculum/model.ts'
import {
  commitCompletedSession,
  createInitialState,
  createPracticeSessionForTarget,
  resolveDatasetLifecycles,
  type PracticeSession,
} from '../src/domain.ts'
import { inspectKindergartenWorkbook } from '../src/kindergartenSheetsImporter.ts'
import { grade2PracticeProfile } from '../src/practice/profiles/grade2.ts'
import { kindergartenWritingPracticeProfile } from '../src/practice/profiles/kindergarten.ts'
import { practiceProfileForGrade } from '../src/practice/profiles/registry.ts'
import { practiceTargetsForLifecycle } from '../src/practice/targets.ts'
import { isCanonicalDataset } from '../src/slidesImporter.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/kindergarten-workbook.json', import.meta.url), 'utf8')) as Omit<SheetsWorkbookPayload, 'sourceType'>
const candidates = inspectKindergartenWorkbook(fixture)
const datasets = candidates
  .filter((candidate) => candidate.status === 'valid')
  .map(datasetFromCanonicalCandidate)
const unitOneDatasets = datasets.filter((dataset) => dataset.endDate <= '2026-09-27')

test('validated Kindergarten candidates project through the source-neutral production boundary', () => {
  assert.equal(datasets.length, 5)
  assert.ok(datasets.every(isSourceNeutralCanonicalDataset))
  assert.ok(datasets.every(isCanonicalDataset))
  assert.ok(datasets.every((dataset) => dataset.source?.sourceType === 'google-sheets'))
  assert.ok(datasets.every((dataset) => !('sourceDeckId' in dataset) && !('sourceSlideId' in dataset)))
  assert.ok(datasets.every((dataset) => dataset.words === dataset.vocabulary?.tier1))
  assert.ok(datasets.every((dataset) => dataset.vocabulary?.tier1.every((word) => word.activityType === 'dictation')))
  assert.ok(datasets.every((dataset) => dataset.vocabulary?.tier2.every((word) => word.activityType === 'reading')))
  assert.deepEqual(datasets.flatMap((dataset) => dataset.vocabulary?.tier2.map((word) => word.text) || []), [
    '猫', '狗', '鸟',
    '红色', '蓝色', '有', '没有', '我', '开心', '爸爸', '妈妈', '小',
  ])

  const changedTier2 = {
    ...datasets[0],
    vocabulary: {
      ...datasets[0].vocabulary!,
      tier2: datasets[0].vocabulary!.tier2.map((word, index) => index === 0 ? { ...word, text: `${word.text} changed` } : word),
    },
  }
  assert.equal(isSourceNeutralCanonicalDataset(changedTier2), false)
  assert.equal(isCanonicalDataset(changedTier2), false)
})

test('Kindergarten production practice has an owned profile but remains behind the inactive source gate', () => {
  assert.strictEqual(practiceProfileForGrade('Kindergarten'), kindergartenWritingPracticeProfile)
  assert.notStrictEqual(kindergartenWritingPracticeProfile, grade2PracticeProfile)
  assert.notStrictEqual(kindergartenWritingPracticeProfile.lifecycle, grade2PracticeProfile.lifecycle)
  assert.notStrictEqual(kindergartenWritingPracticeProfile.acquisition, grade2PracticeProfile.acquisition)
  assert.equal(kindergartenWritingPracticeProfile.presentation.homeHeading, 'Enter the Dojo')
  assert.equal(kindergartenWritingPracticeProfile.presentation.testReviewAction, 'Prepare for your test')
  assert.equal(productionSourceIsActive('Kindergarten', '2026–2027'), false)
  assert.equal(productionSourceIsActive('Grade 2', '2026–2027'), true)
})

test('the Unit 1 review creates one cumulative session and persists one score per source week', () => {
  const lifecycle = resolveDatasetLifecycles(unitOneDatasets, new Date(2026, 9, 3, 12, 0))
  const targets = practiceTargetsForLifecycle(lifecycle)
  const acquisition = targets.find((target) => target.phase === 'acquisition')
  const review = targets.find((target) => target.phase === 'test-review')

  assert.equal(acquisition, undefined)
  assert.ok(review)
  assert.equal(review.reviewCycle, 1)
  assert.equal(review.reviewGroupId, 'kindergarten-2026-27-unit-1')
  assert.deepEqual(review.reviewDatasets?.map((dataset) => dataset.startDate), [
    '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21',
  ])
  assert.equal(review.reviewDatasets?.reduce((total, dataset) => total + dataset.words.length, 0), 14)

  const session = createPracticeSessionForTarget({
    id: 'kindergarten-unit-1-session',
    childId: 'k-child',
    grade: 'Kindergarten',
    target: review,
    warmup: { words: [], randomRotationWordIds: [], recentReviewWordIds: [], erroredWordIds: [], rotationCycleId: 1 },
    startedAt: '2026-10-03T19:00:00.000Z',
    random: () => 0,
  })
  assert.equal(session.primaryQueue.length, 14)
  assert.equal(session.reviewCycle, 1)
  assert.deepEqual(session.primaryDatasetIds, review.reviewDatasets?.map((dataset) => dataset.id))

  const completed: PracticeSession = {
    ...session,
    segment: 'primary',
    stage: 'complete',
    queue: session.primaryQueue,
    warmupSkipped: true,
    primaryAnswers: session.primaryQueue.map((word) => ({ word, correct: true, revealMethod: 'timer' })),
  }
  const committed = commitCompletedSession(createInitialState(unitOneDatasets), completed, new Date(2026, 9, 3, 12, 0))

  assert.equal(committed.results.filter((result) => result.phase === 'test-review').length, 14)
  assert.deepEqual(committed.scores.map((score) => score.datasetId), review.reviewDatasets?.map((dataset) => dataset.id))
  assert.ok(committed.scores.every((score) => score.percent === 100 && score.phase === 'test-review'))
  assert.deepEqual(committed.completedSessions[0].primaryDatasetIds, review.reviewDatasets?.map((dataset) => dataset.id))
  assert.equal(committed.completedSessions[0].reviewGroupId, 'kindergarten-2026-27-unit-1')
  assert.equal(committed.completedSessions[0].reviewCycle, 1)
})
