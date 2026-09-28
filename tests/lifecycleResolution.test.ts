import assert from 'node:assert/strict'
import test from 'node:test'
import {
  filterDatasetsForChild,
  requireDatasetLifecycle,
  resolveDatasetLifecycles,
  type Dataset,
  type DatasetLifecycleResolution,
} from '../src/domain.ts'
import { schoolYearToken } from '../src/curriculum/identity.ts'
import { grade2DeckProfile, grade5DeckProfile, importWeeklyDatasets } from '../src/slidesImporter.ts'
import type { LifecycleProgressionEvent, LifecycleSet } from '../src/lifecycle/contracts.ts'
import { lifecycleStrategyForGradeAndSchoolYear, lifecycleStrategyForScope, resolveLifecycle } from '../src/lifecycle/registry.ts'
import { curriculumStageLabel, practicePhaseForStage } from '../src/lifecycle/stageMapping.ts'

const grade2Presentation = {
  presentationId: grade2DeckProfile.sourceDeckId,
  slides: [
    { objectId: 'week-0831', text: 'Week 8/31-9/4\nMandarin\nTier 1: 甲、乙、丙、丁、戊' },
    { objectId: 'week-0908', text: 'Week 9/8-9/11\nMandarin\nTier 1: 己、庚、辛、壬、癸' },
    { objectId: 'week-0914', text: 'Week 9/14-9/18\nMandarin\nTier 1: 子、丑、寅、卯、辰' },
    { objectId: 'week-0921', text: 'Week 9/21-9/25\nMandarin\nTier 1: 巳、午、未、申、酉' },
    { objectId: 'week-0928', text: 'Week 9/28-10/2\nMandarin\nTier 1: 天、地、玄、黄、宇' },
    { objectId: 'week-1012', text: 'Week 10/12-10/16\nMandarin\nTier 1: 金、木、水、火、土' },
  ],
}

const datasets = importWeeklyDatasets(grade2Presentation, [], grade2DeckProfile).datasets
const bySlide = new Map(datasets.map((dataset) => [dataset.sourceSlideId, dataset]))
const week0831 = bySlide.get('week-0831')!
const week0908 = bySlide.get('week-0908')!
const week0914 = bySlide.get('week-0914')!
const week0921 = bySlide.get('week-0921')!
const week0928 = bySlide.get('week-0928')!
const week1012 = bySlide.get('week-1012')!

function label(dataset: Dataset) {
  return dataset.sourceSlideId || dataset.id
}

function summarize(resolution: DatasetLifecycleResolution) {
  return {
    acquisition: resolution.acquisition ? label(resolution.acquisition) : null,
    testReview: resolution.testReview ? label(resolution.testReview) : null,
    mastered: resolution.mastered.map(label),
    masteredAt: Object.fromEntries(resolution.mastered.map((dataset) => [label(dataset), resolution.masteredAtByDatasetId[dataset.id]])),
    future: resolution.future.map(label),
    noInstruction: resolution.noInstruction.map(label),
    stages: Object.fromEntries(
      [...resolution.mastered, ...resolution.future, ...resolution.noInstruction, resolution.testReview, resolution.acquisition]
        .filter((dataset): dataset is Dataset => Boolean(dataset))
        .map((dataset) => [label(dataset), resolution.lifecycleByDatasetId[dataset.id]]),
    ),
  }
}

const baseSets = [week0831, week0908, week0914, week0921]

function lifecycleSet(dataset: Dataset): LifecycleSet {
  return {
    datasetId: dataset.id,
    grade: dataset.grade,
    schoolYearKey: schoolYearToken(dataset.schoolYear),
    activationDate: dataset.startDate,
    instructionalEndDate: dataset.endDate,
    kind: dataset.isWritingWorkshop ? 'no-instruction' : 'vocabulary',
  }
}

function lifecycleContext(sets: Dataset[], currentDateKey: string, progressionEvents: LifecycleProgressionEvent[] = []) {
  return {
    scope: { grade: 'Grade 2', schoolYearKey: '2026-27', currentDateKey },
    sets: sets.map(lifecycleSet),
    progressionEvents,
  }
}

test('Grade 2 lifecycle golden matrix preserves weekends, missing weeks, and replacement events', () => {
  const cases = [
    {
      name: 'Friday before the next replacement',
      date: new Date(2026, 8, 18),
      sets: baseSets,
      expected: {
        acquisition: 'week-0914',
        testReview: 'week-0908',
        mastered: ['week-0831'],
        masteredAt: { 'week-0831': '2026-09-14' },
        future: ['week-0921'],
        noInstruction: [],
        stages: { 'week-0831': 'mastered', 'week-0921': 'future', 'week-0908': 'test-review', 'week-0914': 'acquisition' },
      },
    },
    {
      name: 'Saturday retains Friday assignments',
      date: new Date(2026, 8, 19),
      sets: baseSets,
      expected: {
        acquisition: 'week-0914',
        testReview: 'week-0908',
        mastered: ['week-0831'],
        masteredAt: { 'week-0831': '2026-09-14' },
        future: ['week-0921'],
        noInstruction: [],
        stages: { 'week-0831': 'mastered', 'week-0921': 'future', 'week-0908': 'test-review', 'week-0914': 'acquisition' },
      },
    },
    {
      name: 'Sunday retains Friday assignments',
      date: new Date(2026, 8, 20),
      sets: baseSets,
      expected: {
        acquisition: 'week-0914',
        testReview: 'week-0908',
        mastered: ['week-0831'],
        masteredAt: { 'week-0831': '2026-09-14' },
        future: ['week-0921'],
        noInstruction: [],
        stages: { 'week-0831': 'mastered', 'week-0921': 'future', 'week-0908': 'test-review', 'week-0914': 'acquisition' },
      },
    },
    {
      name: 'a missing replacement holds the latest assignments',
      date: new Date(2026, 8, 28),
      sets: baseSets,
      expected: {
        acquisition: 'week-0921',
        testReview: 'week-0914',
        mastered: ['week-0831', 'week-0908'],
        masteredAt: { 'week-0831': '2026-09-14', 'week-0908': '2026-09-21' },
        future: [],
        noInstruction: [],
        stages: { 'week-0831': 'mastered', 'week-0908': 'mastered', 'week-0914': 'test-review', 'week-0921': 'acquisition' },
      },
    },
    {
      name: 'a valid replacement advances every older assignment',
      date: new Date(2026, 8, 28),
      sets: [...baseSets, week0928],
      expected: {
        acquisition: 'week-0928',
        testReview: 'week-0921',
        mastered: ['week-0831', 'week-0908', 'week-0914'],
        masteredAt: { 'week-0831': '2026-09-14', 'week-0908': '2026-09-21', 'week-0914': '2026-09-28' },
        future: [],
        noInstruction: [],
        stages: { 'week-0831': 'mastered', 'week-0908': 'mastered', 'week-0914': 'mastered', 'week-0921': 'test-review', 'week-0928': 'acquisition' },
      },
    },
    {
      name: 'a delayed replacement advances assignments only when it arrives',
      date: new Date(2026, 9, 12),
      sets: [...baseSets, week1012],
      expected: {
        acquisition: 'week-1012',
        testReview: 'week-0921',
        mastered: ['week-0831', 'week-0908', 'week-0914'],
        masteredAt: { 'week-0831': '2026-09-14', 'week-0908': '2026-09-21', 'week-0914': '2026-10-12' },
        future: [],
        noInstruction: [],
        stages: { 'week-0831': 'mastered', 'week-0908': 'mastered', 'week-0914': 'mastered', 'week-0921': 'test-review', 'week-1012': 'acquisition' },
      },
    },
  ]

  for (const matrixCase of cases) {
    assert.deepEqual(summarize(resolveDatasetLifecycles(matrixCase.sets, matrixCase.date)), matrixCase.expected, matrixCase.name)
  }
})

test('Grade 2 lifecycle golden matrix is deterministic for duplicates and unordered input', () => {
  const expected = summarize(resolveDatasetLifecycles([...baseSets, week0928], new Date(2026, 8, 28)))
  const duplicatedAndUnordered = [week0928, week0914, week0831, week0921, week0908, week0928, week0914]
  assert.deepEqual(summarize(resolveDatasetLifecycles(duplicatedAndUnordered, new Date(2026, 8, 28))), expected)
})

test('Grade 2 lifecycle golden matrix preserves no-instruction and malformed handling', () => {
  const workshop = importWeeklyDatasets({
    presentationId: grade2DeckProfile.sourceDeckId,
    slides: [{ objectId: 'week-workshop', text: 'Week 9/28-10/2\nMandarin\nWriting Workshop\nNo new Tier 1 targets' }],
  }, [], grade2DeckProfile).datasets[0]
  const malformed = { ...week0921, id: '2026-09-21__2026-09-25', sourceSlideId: 'malformed' }
  const resolution = summarize(resolveDatasetLifecycles([...baseSets, workshop, malformed], new Date(2026, 8, 28)))

  assert.deepEqual(resolution, {
    acquisition: 'week-0921',
    testReview: 'week-0914',
    mastered: ['week-0831', 'week-0908'],
    masteredAt: { 'week-0831': '2026-09-14', 'week-0908': '2026-09-21' },
    future: [],
    noInstruction: ['week-workshop'],
    stages: { 'week-0831': 'mastered', 'week-0908': 'mastered', 'week-workshop': 'no-instruction', 'week-0914': 'test-review', 'week-0921': 'acquisition' },
  })
})

test('Grade 2 lifecycle golden matrix scopes grade and school year before resolution', () => {
  const grade5 = importWeeklyDatasets({
    presentationId: grade5DeckProfile.sourceDeckId,
    slides: [{ objectId: 'grade-5-week', text: 'Week 6 (9/21-25)\nMandarin\nTier 1: 需要、部分、重要' }],
  }, [], grade5DeckProfile).datasets[0]
  const scoped = filterDatasetsForChild([...baseSets, grade5], 'Grade 2', '2026–2027')
  assert.deepEqual(summarize(resolveDatasetLifecycles(scoped, new Date(2026, 8, 23))), {
    acquisition: 'week-0921',
    testReview: 'week-0914',
    mastered: ['week-0831', 'week-0908'],
    masteredAt: { 'week-0831': '2026-09-14', 'week-0908': '2026-09-21' },
    future: [],
    noInstruction: [],
    stages: { 'week-0831': 'mastered', 'week-0908': 'mastered', 'week-0914': 'test-review', 'week-0921': 'acquisition' },
  })
  assert.deepEqual(summarize(resolveDatasetLifecycles([], new Date(2026, 8, 23))), {
    acquisition: null,
    testReview: null,
    mastered: [],
    masteredAt: {},
    future: [],
    noInstruction: [],
    stages: {},
  })
})

test('Grade 2 replacement strategy reproduces the golden replacement ordering', () => {
  const resolution = resolveLifecycle(lifecycleContext([...baseSets, week0928], '2026-09-28'))

  assert.equal(resolution.acquisitionDatasetId, week0928.id)
  assert.deepEqual(resolution.testReviews, [{ datasetId: week0921.id, cycle: 1 }])
  assert.deepEqual(resolution.masteryDatasetIds, [week0831.id, week0908.id, week0914.id])
  assert.deepEqual(resolution.masteredAtByDatasetId, {
    [week0831.id]: '2026-09-14',
    [week0908.id]: '2026-09-21',
    [week0914.id]: '2026-09-28',
  })
})

test('Grade 2 compatibility wrapper projects the strategy without changing dataset identity', () => {
  const sourceDatasets = [...baseSets, week0928]
  const compatibility = resolveDatasetLifecycles(sourceDatasets, new Date(2026, 8, 28))
  const strategy = resolveLifecycle(lifecycleContext(sourceDatasets, '2026-09-28'))

  assert.strictEqual(compatibility.acquisition, week0928)
  assert.strictEqual(compatibility.testReview, week0921)
  assert.deepEqual(compatibility.mastered.map((dataset) => dataset.id), strategy.masteryDatasetIds)
  assert.deepEqual(compatibility.future.map((dataset) => dataset.id), strategy.futureDatasetIds)
  assert.deepEqual(compatibility.noInstruction.map((dataset) => dataset.id), strategy.noInstructionDatasetIds)
  assert.deepEqual(compatibility.masteredAtByDatasetId, strategy.masteredAtByDatasetId)
  assert.deepEqual(compatibility.lifecycleByDatasetId, Object.fromEntries(
    Object.entries(strategy.assignmentByDatasetId).map(([datasetId, assignment]) => [
      datasetId,
      assignment.stage.kind === 'test-review'
        ? 'test-review'
        : assignment.stage.kind === 'mastery'
          ? 'mastered'
          : assignment.stage.kind,
    ]),
  ))
})

test('Grade 2 compatibility wrapper rejects an unresolved mixed scope', () => {
  const grade5 = importWeeklyDatasets({
    presentationId: grade5DeckProfile.sourceDeckId,
    slides: [{ objectId: 'grade-5-mixed-scope', text: 'Week 6 (9/21-25)\nMandarin\nTier 1: 需要、部分、重要' }],
  }, [], grade5DeckProfile).datasets[0]
  assert.throws(
    () => resolveDatasetLifecycles([week0921, grade5], new Date(2026, 8, 28)),
    /one grade and school-year collection/,
  )
})

test('lifecycle registry requires the exact grade and normalized school year', () => {
  const grade2 = lifecycleStrategyForGradeAndSchoolYear('Grade 2', '2026–2027')
  assert.equal(grade2?.profileId, 'grade-2-replacement-2026-27')
  assert.equal(grade2?.version, 1)
  assert.strictEqual(lifecycleStrategyForGradeAndSchoolYear('Grade 2', '2026-2027'), grade2)
  assert.equal(lifecycleStrategyForGradeAndSchoolYear('Grade 2', '2025–2026'), null)
  assert.equal(lifecycleStrategyForGradeAndSchoolYear('Grade 5', '2026–2027'), null)
  assert.throws(() => resolveLifecycle({
    scope: { grade: 'Grade 5', schoolYearKey: '2026-27', currentDateKey: '2026-09-28' },
    sets: [],
    progressionEvents: [],
  }), /not configured for Grade 5 in 2026-27/)
})

test('strategy resolution excludes mixed-grade and mixed-year inputs from the requested scope', () => {
  const validSets = [...baseSets, week0928].map(lifecycleSet)
  const mixedSets: LifecycleSet[] = [
    ...validSets,
    { ...lifecycleSet(week0928), datasetId: 'grade-5-foreign', grade: 'Grade 5' },
    { ...lifecycleSet(week0928), datasetId: 'prior-year-foreign', schoolYearKey: '2025-26' },
  ]
  const resolution = resolveLifecycle({
    scope: { grade: 'Grade 2', schoolYearKey: '2026-27', currentDateKey: '2026-09-28' },
    sets: mixedSets,
    progressionEvents: [],
  })

  assert.deepEqual(Object.keys(resolution.assignmentByDatasetId).sort(), validSets.map((set) => set.datasetId).sort())
  assert.equal(resolution.assignmentByDatasetId['grade-5-foreign'], undefined)
  assert.equal(resolution.assignmentByDatasetId['prior-year-foreign'], undefined)
})

test('Grade 2 explicitly preserves replacement behavior when progression events are present', () => {
  const sourceDatasets = [...baseSets, week0928]
  const event: LifecycleProgressionEvent = {
    eventId: 'future-grade-5-style-event',
    grade: 'Grade 2',
    schoolYearKey: '2026-27',
    effectiveDate: '2026-09-28',
    introducedDatasetId: week0928.id,
    confirmedDatasetId: week0921.id,
  }
  assert.deepEqual(
    resolveLifecycle(lifecycleContext(sourceDatasets, '2026-09-28', [event])),
    resolveLifecycle(lifecycleContext(sourceDatasets, '2026-09-28')),
  )
})

test('curriculum stages map both review cycles to the existing Test Review practice behavior', () => {
  assert.equal(practicePhaseForStage({ kind: 'acquisition' }), 'acquisition')
  assert.equal(practicePhaseForStage({ kind: 'test-review', cycle: 1 }), 'test-review')
  assert.equal(practicePhaseForStage({ kind: 'test-review', cycle: 2 }), 'test-review')
  assert.equal(practicePhaseForStage({ kind: 'mastery' }), null)
  assert.equal(curriculumStageLabel({ kind: 'test-review', cycle: 1 }), 'Test Review 1')
  assert.equal(curriculumStageLabel({ kind: 'test-review', cycle: 2 }), 'Test Review 2')
})

test('canonical dataset lifecycle assignments are required instead of inferred from dates', () => {
  const resolution = resolveDatasetLifecycles([...baseSets, week0928], new Date(2026, 8, 28))
  assert.equal(requireDatasetLifecycle(resolution, week0928.id), 'acquisition')
  assert.throws(() => requireDatasetLifecycle(resolution, 'missing-canonical-dataset'), /has no lifecycle assignment/)
})

test('the lifecycle profile can be discovered without a writing practice profile lookup', () => {
  assert.equal(lifecycleStrategyForScope({ grade: 'Grade 2', schoolYearKey: '2026-27' })?.profileId, 'grade-2-replacement-2026-27')
})
