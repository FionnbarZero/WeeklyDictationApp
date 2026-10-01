import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { extractGrade5Presentation } from '../src/curriculum/adapters/grade5GoogleSlides.ts'
import type { SlidesPresentationPayload } from '../src/curriculum/model.ts'
import {
  buildGrade5LearningHub,
  type Grade5HubActivity,
  type Grade5HubSection,
} from '../src/grade5Lab/learningHub.ts'
import { grade5LearningHubView } from '../src/grade5Lab/learningHubView.ts'

function loadFixture(): SlidesPresentationPayload {
  return JSON.parse(readFileSync(new URL('./fixtures/grade5-presentation.json', import.meta.url), 'utf8')) as SlidesPresentationPayload
}

function model() {
  return buildGrade5LearningHub(extractGrade5Presentation(loadFixture()))
}

function section(id: Grade5HubSection['id']) {
  const value = model().sections.find((item) => item.id === id)
  assert.ok(value, `Missing ${id} section`)
  return value
}

function activity(sectionValue: Grade5HubSection, id: string): Grade5HubActivity {
  const value = sectionValue.activities.find((item) => item.id === id)
  assert.ok(value, `Missing ${id} activity`)
  return value
}

test('the Grade 5 hub assigns accepted cohorts to Acquisition, Test 1, Test 2, and Mastery', () => {
  const hub = model()

  assert.deepEqual(hub.sections.map((item) => item.title), [
    'Enter the Dojo',
    'Practice your Ninja Skills',
    'The Final Boss Test',
    'Enter the Spirit Realm',
  ])
  assert.equal(section('homework').cohorts[0]?.cohortId, 'grade-5__2026-27__2026-09-21__2026-09-25')
  assert.equal(section('test-review-1').cohorts[0]?.cohortId, 'grade-5__2026-27__2026-09-14__2026-09-18')
  assert.equal(section('test-review-2').cohorts[0]?.cohortId, 'grade-5__2026-27__2026-09-08__2026-09-11')
  assert.deepEqual(section('review').cohorts.map((cohort) => cohort.cohortId), [
    'grade-5__2026-27__2026-08-31__2026-09-04',
  ])
})

test('each weekly area exposes the approved activity labels', () => {
  assert.deepEqual(section('homework').activities.map((item) => item.label), [
    'Read the Book',
    'Learn to Write',
    'Read the Words',
  ])
  assert.deepEqual(section('test-review-1').activities.map((item) => item.label), [
    'Read the Book',
    'Writing Test',
    'Reading Test',
    'Reenter the Training Dojo',
  ])
  assert.deepEqual(section('test-review-2').activities.map((item) => item.label), [
    'Read the Book',
    'Writing Test',
    'Reading Test',
    'Reenter the Training Dojo',
  ])
  assert.deepEqual(section('review').activities.map((item) => item.label), [
    'Tier 1 Writing Warmup',
    'Tier 2 Reading Warmup',
    'Re-teach Words',
  ])
})

test('book buttons use the resource from the cohort current-stage source section', () => {
  const acquisitionBook = activity(section('homework'), 'acquisition-book').book
  const test1Book = activity(section('test-review-1'), 'test-review-1-book').book
  const test2Book = activity(section('test-review-2'), 'test-review-2-book').book

  assert.deepEqual(acquisitionBook, {
    title: '《海水为什么是咸的》',
    url: 'https://app.levellearning.com/v3/browse/1/?take-store=sourceId--book-why-the-ocean-is-salty',
    sourceRole: 'acquisition',
  })
  assert.deepEqual(test1Book, {
    title: '《大象的沟通方式》',
    url: 'https://read.bookcreator.com/aUUlFiDeMpTFq09bGXGtynfHaqk2/WCp_n0hSSWC01Ko-G2C27g/a-TmD2HyRZmyvtVGCIy1gA',
    sourceRole: 'review',
  })
  assert.deepEqual(test2Book, {
    title: '《植物的光合作用》',
    url: 'https://read.bookcreator.com/GPclK_add-_IhzIQYIm_h9o8fRZCg5qIcEXiy5swCv0/1pbWajYoTXicpABe7EIGrw/lcg0W43qS12klVG6Pc_qqQ',
    sourceRole: 'review',
  })
})

test('writing and reading launch requests remain distinct and offer their own up-to-six-word Warmup', () => {
  const homework = section('homework')
  const writing = activity(homework, 'acquisition-writing').launchRequests[0]
  const reading = activity(homework, 'acquisition-reading').launchRequests[0]

  assert.equal(writing.learningChannel, 'tier-1-writing')
  assert.equal(reading.learningChannel, 'tier-2-reading')
  assert.equal(writing.cohortId, reading.cohortId)
  assert.equal(writing.stage, 'acquisition')
  assert.equal(reading.stage, 'acquisition')
  assert.equal(writing.warmupMaximum, 6)
  assert.equal(reading.warmupMaximum, 6)
  assert.equal(writing.preActivityWarmupRequirement, 'undecided')
  assert.equal(reading.preActivityWarmupRequirement, 'undecided')
})

test('Test Review 1 and Test Review 2 requests reference different cohorts', () => {
  const test1 = activity(section('test-review-1'), 'test-review-1-writing').launchRequests[0]
  const test2 = activity(section('test-review-2'), 'test-review-2-writing').launchRequests[0]

  assert.notEqual(test1.cohortId, test2.cohortId)
  assert.equal(test1.activityKind, 'test-review')
  assert.equal(test2.activityKind, 'test-review')
  assert.equal(test1.warmupMaximum, 6)
  assert.equal(test2.warmupMaximum, 6)
  assert.equal(test1.preActivityWarmupRequirement, 'undecided')
  assert.equal(test2.preActivityWarmupRequirement, 'undecided')
})

test('both Test Review stages can request Acquisition help without changing curriculum stage', () => {
  for (const stage of ['test-review-1', 'test-review-2'] as const) {
    const requests = activity(section(stage), `${stage}-reenter-training-dojo`).launchRequests

    assert.deepEqual(requests.map((request) => request.learningChannel), [
      'tier-1-writing',
      'tier-2-reading',
    ])
    assert.ok(requests.every((request) => request.stage === stage))
    assert.ok(requests.every((request) => request.activityKind === 'acquisition'))
    assert.ok(requests.every((request) => request.warmupMaximum === 6))
    assert.ok(requests.every((request) => request.preActivityWarmupRequirement === 'undecided'))
    assert.equal(new Set(requests.map((request) => request.cohortId)).size, 1)
  }
})

test('mastery requests preserve separate writing and reading queues', () => {
  const review = section('review')
  const writingWarmup = activity(review, 'mastery-writing-warmup').launchRequests[0]
  const readingWarmup = activity(review, 'mastery-reading-warmup').launchRequests[0]
  const reteach = activity(review, 'mastery-reteach').launchRequests

  assert.equal(writingWarmup.learningChannel, 'tier-1-writing')
  assert.equal(readingWarmup.learningChannel, 'tier-2-reading')
  assert.equal(writingWarmup.warmupMaximum, null)
  assert.equal(readingWarmup.warmupMaximum, null)
  assert.equal(writingWarmup.preActivityWarmupRequirement, 'not-applicable')
  assert.equal(readingWarmup.preActivityWarmupRequirement, 'not-applicable')
  assert.deepEqual(reteach.map((request) => request.learningChannel), ['tier-1-writing', 'tier-2-reading'])
  assert.deepEqual(writingWarmup.eligibleCohortIds, ['grade-5__2026-27__2026-08-31__2026-09-04'])
  assert.equal(writingWarmup.cohortId, null)
})

test('unavailable cohorts remain visible with disabled activities and explanations', () => {
  const extraction = extractGrade5Presentation(loadFixture())
  extraction.progressionEvidence = extraction.progressionEvidence.slice(0, 1)
  extraction.resources = extraction.resources.filter((resource) =>
    resource.datasetId === extraction.progressionEvidence[0]?.introducedDatasetId)
  const hub = buildGrade5LearningHub(extraction)

  assert.equal(hub.sections.length, 4)
  const test1 = hub.sections.find((item) => item.id === 'test-review-1')!
  const test2 = hub.sections.find((item) => item.id === 'test-review-2')!
  const review = hub.sections.find((item) => item.id === 'review')!
  assert.equal(test1.available, false)
  assert.equal(test2.available, false)
  assert.equal(review.available, false)
  assert.ok(test1.unavailableReason)
  assert.ok(test2.activities.every((item) => item.availability === 'unavailable'))
  assert.ok(review.activities.every((item) => item.availability === 'unavailable'))
})

test('the Grade 5 adapter preserves content and launch requests in the shared Learning Hub contract', () => {
  const view = grade5LearningHubView(model())

  assert.equal(view.profileLabel, 'Grade 5')
  assert.deepEqual(view.sections.map((item) => item.id), [
    'homework',
    'test-review-1',
    'test-review-2',
    'review',
  ])
  const homework = view.sections[0]
  assert.equal(homework?.cohorts[0]?.groups[0]?.label, 'Tier 1 · Writing')
  assert.equal(homework?.cohorts[0]?.groups[1]?.label, 'Tier 2 · Reading')
  const writing = homework?.activities.find((item) => item.id === 'acquisition-writing')
  assert.equal(writing?.action.kind, 'launch')
  if (writing?.action.kind === 'launch') {
    assert.equal(writing.action.launch.requests[0]?.learningChannel, 'tier-1-writing')
  }
  const reading = homework?.activities.find((item) => item.id === 'acquisition-reading')
  assert.equal(reading?.action.kind, 'launch')
  if (reading?.action.kind === 'launch') {
    assert.equal(reading.action.launch.requests[0]?.learningChannel, 'tier-2-reading')
  }
})
