import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { extractGrade5Presentation } from '../src/curriculum/adapters/grade5GoogleSlides.ts'
import type { SlidesPresentationPayload } from '../src/curriculum/model.ts'
import { SOURCE_REGISTRY } from '../src/config.ts'
import { buildGrade5LearningHub, resolveGrade5SourceLifecycle } from '../src/grade5Lab/learningHub.ts'
import { grade5WritingLabProfile } from '../src/grade5Lab/practiceProfile.ts'
import { grade5LabWarmupSelection, grade5LabWritingRequestIsConnected } from '../src/grade5Lab/writingPractice.ts'
import { practiceProfileForGrade } from '../src/practice/profiles/registry.ts'

function extraction() {
  const payload = JSON.parse(
    readFileSync(new URL('./fixtures/grade5-presentation.json', import.meta.url), 'utf8'),
  ) as SlidesPresentationPayload
  return extractGrade5Presentation(payload)
}

const week0831 = 'grade-5__2026-27__2026-08-31__2026-09-04'
const week0908 = 'grade-5__2026-27__2026-09-08__2026-09-11'
const week0914 = 'grade-5__2026-27__2026-09-14__2026-09-18'
const week0921 = 'grade-5__2026-27__2026-09-21__2026-09-25'

test('Grade 5 progression assigns Acquisition, both Test Reviews, and Mastery from accepted source events', () => {
  const resolution = resolveGrade5SourceLifecycle(extraction(), '2026-09-29')

  assert.equal(resolution.acquisitionDatasetId, week0921)
  assert.deepEqual(resolution.testReviews, [
    { datasetId: week0914, cycle: 1 },
    { datasetId: week0908, cycle: 2 },
  ])
  assert.deepEqual(resolution.masteryDatasetIds, [week0831])
  assert.equal(resolution.masteredAtByDatasetId[week0831], '2026-09-21')
  assert.deepEqual(resolution.assignmentByDatasetId[week0921].stage, { kind: 'acquisition' })
  assert.deepEqual(resolution.assignmentByDatasetId[week0914].stage, { kind: 'test-review', cycle: 1 })
  assert.deepEqual(resolution.assignmentByDatasetId[week0908].stage, { kind: 'test-review', cycle: 2 })
  assert.deepEqual(resolution.assignmentByDatasetId[week0831].stage, { kind: 'mastery' })
})

test('calendar gaps do not advance Grade 5 without another accepted progression event', () => {
  const source = extraction()
  const frozen = { ...source, progressionEvidence: source.progressionEvidence.slice(0, 3) }
  const resolution = resolveGrade5SourceLifecycle(frozen, '2026-10-12')

  assert.equal(resolution.acquisitionDatasetId, week0914)
  assert.deepEqual(resolution.testReviews, [
    { datasetId: week0908, cycle: 1 },
    { datasetId: week0831, cycle: 2 },
  ])
  assert.deepEqual(resolution.masteryDatasetIds, [])
  assert.ok(resolution.futureDatasetIds.includes(week0921))
})

test('a broken confirmation chain freezes later Grade 5 cohorts', () => {
  const source = extraction()
  const brokenEvents = source.progressionEvidence.map((event, index) => index === 2
    ? { ...event, confirmedDatasetId: week0831 }
    : event)
  const resolution = resolveGrade5SourceLifecycle({ ...source, progressionEvidence: brokenEvents }, '2026-09-29')

  assert.equal(resolution.acquisitionDatasetId, week0908)
  assert.deepEqual(resolution.testReviews, [{ datasetId: week0831, cycle: 1 }])
  assert.deepEqual(resolution.masteryDatasetIds, [])
  assert.ok(resolution.futureDatasetIds.includes(week0914))
  assert.ok(resolution.futureDatasetIds.includes(week0921))
})

test('each connected Grade 5 writing activity receives exactly six mastery Warmup trials', () => {
  const source = extraction()
  const recentWarmup = grade5LabWarmupSelection(source, '2026-09-21', () => 0)
  const rotationWarmup = grade5LabWarmupSelection(source, '2026-09-29', () => 0)

  assert.equal(grade5WritingLabProfile.requiredWarmupTrials, 6)
  assert.equal(grade5WritingLabProfile.testReviewTimerSeconds, 10)
  assert.equal(recentWarmup.words.length, 6)
  assert.equal(rotationWarmup.words.length, 6)
  assert.equal(new Set(recentWarmup.words.slice(0, 5).map((word) => word.id)).size, 5)
  for (const warmup of [recentWarmup, rotationWarmup]) {
    assert.ok(warmup.words.every((word) => word.datasetId === week0831))
    assert.ok(warmup.words.every((word) => word.datasetId !== week0908 && word.datasetId !== week0914 && word.datasetId !== week0921))
  }
})

test('Grade 5 remains development-only despite having a registered lifecycle strategy', () => {
  const registryEntry = SOURCE_REGISTRY.find((entry) => entry.grade === 'Grade 5')

  assert.equal(registryEntry?.active, false)
  assert.equal(registryEntry?.practiceProfileId, 'grade-5-unimplemented')
  assert.equal(practiceProfileForGrade('Grade 5'), null)
})

test('every Tier 1 writing link is connected while Tier 2 remains deferred', () => {
  const hub = buildGrade5LearningHub(extraction())
  const writingActivities = hub.sections.flatMap((section) => section.activities)
    .filter((activity) => activity.id.includes('writing') || activity.id.includes('reenter-training-dojo'))
  const acquisitionWriting = writingActivities.find((activity) => activity.id === 'acquisition-writing')!
  const test1Writing = writingActivities.find((activity) => activity.id === 'test-review-1-writing')!
  const test2Writing = writingActivities.find((activity) => activity.id === 'test-review-2-writing')!
  const reentry = writingActivities.find((activity) => activity.id === 'test-review-1-reenter-training-dojo')!

  assert.equal(grade5LabWritingRequestIsConnected(acquisitionWriting.launchRequests[0]), true)
  assert.equal(grade5LabWritingRequestIsConnected(test1Writing.launchRequests[0]), true)
  assert.equal(grade5LabWritingRequestIsConnected(test2Writing.launchRequests[0]), true)
  assert.equal(grade5LabWritingRequestIsConnected(reentry.launchRequests[0]), true)
  assert.equal(grade5LabWritingRequestIsConnected(reentry.launchRequests[1]), false)
})
