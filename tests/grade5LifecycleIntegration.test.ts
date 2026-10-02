import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { extractGrade5Presentation } from '../src/curriculum/adapters/grade5GoogleSlides.ts'
import type { SlidesPresentationPayload } from '../src/curriculum/model.ts'
import { SOURCE_REGISTRY } from '../src/config.ts'
import { buildGrade5LearningHub, resolveGrade5SourceLifecycle } from '../src/grade5Lab/learningHub.ts'
import { grade5WritingLabProfile } from '../src/grade5Lab/practiceProfile.ts'
import { grade5LabWarmupSelection, grade5LabWritingRequestIsConnected } from '../src/grade5Lab/writingPractice.ts'
import { grade5LabReadingRequestIsConnected } from '../src/grade5Lab/readingPractice.ts'
import { lifecycleProgressionEventsFrom } from '../src/lifecycle/curriculumProgression.ts'
import { resolveGrade5ProgressionLifecycle } from '../src/lifecycle/strategies/grade5ProgressionStrategy.ts'
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

function lifecycleContext(currentDateKey = '2026-09-29') {
  const source = extraction()
  return {
    scope: { grade: 'Grade 5', schoolYearKey: '2026-27', currentDateKey },
    sets: source.classification.selectedCandidates.map((candidate) => ({
      datasetId: candidate.datasetId!,
      grade: candidate.grade,
      schoolYearKey: '2026-27',
      activationDate: candidate.normalizedStartDate!,
      instructionalEndDate: candidate.normalizedEndDate!,
      kind: 'vocabulary' as const,
    })),
    progressionEvents: lifecycleProgressionEventsFrom(source.progressionEvidence),
  }
}

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

test('Grade 5 lifecycle resolution is deterministic under input permutation', () => {
  const context = lifecycleContext()
  const expected = resolveGrade5ProgressionLifecycle(context)
  const permuted = resolveGrade5ProgressionLifecycle({
    ...context,
    sets: [...context.sets].reverse(),
    progressionEvents: [...context.progressionEvents].reverse(),
  })

  assert.deepEqual(permuted, expected)
})

test('identical duplicate lifecycle sets and evidence are idempotent', () => {
  const context = lifecycleContext()
  const expected = resolveGrade5ProgressionLifecycle(context)
  const duplicated = resolveGrade5ProgressionLifecycle({
    ...context,
    sets: [...context.sets, structuredClone(context.sets[0])],
    progressionEvents: [...context.progressionEvents, structuredClone(context.progressionEvents[1])],
  })

  assert.deepEqual(duplicated, expected)
})

test('conflicting duplicate dataset provenance fails closed instead of using input order', () => {
  const context = lifecycleContext()
  const baseline = context.sets.find((set) => set.datasetId === week0831)!
  const conflict = { ...baseline, activationDate: '2026-08-30' }
  const forward = resolveGrade5ProgressionLifecycle({ ...context, sets: [...context.sets, conflict] })
  const reverse = resolveGrade5ProgressionLifecycle({ ...context, sets: [conflict, ...context.sets] })

  assert.deepEqual(reverse, forward)
  assert.equal(forward.acquisitionDatasetId, null)
  assert.deepEqual(forward.assignmentByDatasetId[week0831].stage, { kind: 'future' })
  assert.ok(forward.futureDatasetIds.includes(week0831))
})

test('conflicting progression evidence IDs freeze the chain at the conflict', () => {
  const context = lifecycleContext()
  const conflicted = {
    ...context.progressionEvents[2],
    confirmedDatasetId: week0831,
  }
  const forward = resolveGrade5ProgressionLifecycle({
    ...context,
    progressionEvents: [...context.progressionEvents, conflicted],
  })
  const reverse = resolveGrade5ProgressionLifecycle({
    ...context,
    progressionEvents: [conflicted, ...context.progressionEvents].reverse(),
  })

  assert.deepEqual(reverse, forward)
  assert.equal(forward.acquisitionDatasetId, week0908)
  assert.deepEqual(forward.testReviews, [{ datasetId: week0831, cycle: 1 }])
  assert.ok(forward.futureDatasetIds.includes(week0914))
  assert.ok(forward.futureDatasetIds.includes(week0921))
})

test('missing baseline evidence and mismatched event dates cannot activate Grade 5', () => {
  const context = lifecycleContext()
  const noBaseline = resolveGrade5ProgressionLifecycle({
    ...context,
    progressionEvents: context.progressionEvents.slice(1),
  })
  const wrongDate = resolveGrade5ProgressionLifecycle({
    ...context,
    progressionEvents: context.progressionEvents.map((event, index) =>
      index === 0 ? { ...event, effectiveDate: '2026-09-01' } : event),
  })

  assert.equal(noBaseline.acquisitionDatasetId, null)
  assert.equal(wrongDate.acquisitionDatasetId, null)
  assert.ok(noBaseline.futureDatasetIds.includes(week0831))
  assert.ok(wrongDate.futureDatasetIds.includes(week0831))
})

test('a future no-instruction set remains in the future partition until its activation date', () => {
  const context = lifecycleContext()
  const noInstructionId = 'grade-5__2026-27__2026-10-05__2026-10-11'
  const resolution = resolveGrade5ProgressionLifecycle({
    ...context,
    sets: [...context.sets, {
      datasetId: noInstructionId,
      grade: 'Grade 5',
      schoolYearKey: '2026-27',
      activationDate: '2026-10-05',
      instructionalEndDate: '2026-10-11',
      kind: 'no-instruction',
    }],
  })

  assert.deepEqual(resolution.assignmentByDatasetId[noInstructionId].stage, { kind: 'future' })
  assert.ok(resolution.futureDatasetIds.includes(noInstructionId))
  assert.ok(!resolution.noInstructionDatasetIds.includes(noInstructionId))
})

test('each connected Grade 5 writing activity receives up to six unique mastery Warmup trials', () => {
  const source = extraction()
  const recentWarmup = grade5LabWarmupSelection(source, '2026-09-21', () => 0)
  const rotationWarmup = grade5LabWarmupSelection(source, '2026-09-29', () => 0)

  assert.equal(grade5WritingLabProfile.warmupPreview.preActivityMaximum, 6)
  assert.equal(grade5WritingLabProfile.warmupPreview.preActivityWarmupRequirement, 'undecided')
  assert.equal(grade5WritingLabProfile.timers.testReview, 10)
  assert.equal(recentWarmup.words.length, 5)
  assert.equal(rotationWarmup.words.length, 5)
  for (const warmup of [recentWarmup, rotationWarmup]) {
    assert.equal(new Set(warmup.words.map((word) => word.id)).size, warmup.words.length)
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

test('Grade 5 writing and reading launch requests are connected, including mastery reacquisition', () => {
  const hub = buildGrade5LearningHub(extraction())
  const activities = hub.sections.flatMap((section) => section.activities)
  const acquisitionWriting = activities.find((activity) => activity.id === 'acquisition-writing')!
  const acquisitionReading = activities.find((activity) => activity.id === 'acquisition-reading')!
  const test1Writing = activities.find((activity) => activity.id === 'test-review-1-writing')!
  const test2Writing = activities.find((activity) => activity.id === 'test-review-2-writing')!
  const reentry = activities.find((activity) => activity.id === 'test-review-1-reenter-training-dojo')!
  const masteryReentry = activities.find((activity) => activity.id === 'mastery-reteach')!

  assert.equal(grade5LabWritingRequestIsConnected(acquisitionWriting.launchRequests[0]), true)
  assert.equal(grade5LabReadingRequestIsConnected(acquisitionReading.launchRequests[0]), true)
  assert.equal(grade5LabWritingRequestIsConnected(test1Writing.launchRequests[0]), true)
  assert.equal(grade5LabWritingRequestIsConnected(test2Writing.launchRequests[0]), true)
  assert.equal(grade5LabWritingRequestIsConnected(reentry.launchRequests[0]), true)
  assert.equal(grade5LabReadingRequestIsConnected(reentry.launchRequests[1]), true)
  assert.equal(grade5LabWritingRequestIsConnected(reentry.launchRequests[2]), true)
  assert.equal(grade5LabReadingRequestIsConnected(reentry.launchRequests[3]), true)
  assert.deepEqual(reentry.launchRequests.map((request) => request.activityKind), [
    'acquisition',
    'acquisition',
    'test-review',
    'test-review',
  ])
  assert.equal(grade5LabWritingRequestIsConnected(masteryReentry.launchRequests[0]), true)
  assert.equal(grade5LabReadingRequestIsConnected(masteryReentry.launchRequests[1]), true)
  assert.equal(grade5LabWritingRequestIsConnected(masteryReentry.launchRequests[2]), true)
  assert.equal(grade5LabReadingRequestIsConnected(masteryReentry.launchRequests[3]), true)
  assert.ok(masteryReentry.launchRequests.every((request) => request.stage === 'mastery'))
  assert.deepEqual(masteryReentry.launchRequests.map((request) => request.activityKind), [
    'reacquisition',
    'reacquisition',
    'test-review',
    'test-review',
  ])
})
