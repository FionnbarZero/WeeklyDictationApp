import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildWarmupSelection,
  deriveChildWordStates,
  type ChildWordState,
  type Dataset,
  type DatasetLifecycleResolution,
  type Word,
  type WordResult,
} from '../src/domain.ts'

function datasetWithWords(wordIds: string[]): Dataset {
  const id = 'grade2-2026-mastered'
  return {
    id,
    dateRange: '8/17-8/21',
    startDate: '2026-08-17',
    endDate: '2026-08-21',
    grade: 'Grade 2',
    schoolYear: '2026-27',
    description: 'Warmup boundary compatibility fixture',
    words: wordIds.map((wordId): Word => ({
      id: wordId,
      text: wordId,
      sentence: `${wordId} sentence`,
      datasetId: id,
    })),
  }
}

function masteredResolution(dataset: Dataset, masteredAt = '2026-01-01'): DatasetLifecycleResolution {
  return {
    acquisition: null,
    testReview: null,
    mastered: [dataset],
    masteredAtByDatasetId: { [dataset.id]: masteredAt },
    future: [],
    noInstruction: [],
    lifecycleByDatasetId: { [dataset.id]: 'mastered' },
  }
}

function state(word: Word, category: ChildWordState['category'], overrides: Partial<ChildWordState> = {}): ChildWordState {
  return {
    id: `maya::${word.id}`,
    childId: 'maya',
    wordId: word.id,
    datasetId: word.datasetId,
    category,
    correctStreak: 0,
    ...overrides,
  }
}

function result(word: Word, id: string, completedAt: string, correct: boolean): WordResult {
  return {
    id,
    childId: 'maya',
    datasetId: word.datasetId,
    datasetDateRange: '8/17-8/21',
    wordId: word.id,
    grade: 'Grade 2',
    phase: 'warmup',
    sessionId: 'compatibility-session',
    sessionDate: completedAt.slice(0, 10),
    completedAt,
    correct,
    revealMethod: 'timer',
    scored: true,
    completeSourceDatasetReviewed: false,
  }
}

test('Warmup boundary preserves the current 8/4/4 and 3/2/1 allocations', () => {
  const dataset = datasetWithWords(Array.from({ length: 16 }, (_, index) => `word-${index + 1}`))
  const states = [
    ...dataset.words.slice(0, 8).map((word) => state(word, 'random-rotation', { randomCycleId: 1, randomCycleReviewed: false })),
    ...dataset.words.slice(8, 12).map((word) => state(word, 'recent-review')),
    ...dataset.words.slice(12, 16).map((word) => state(word, 'errored-word')),
  ]
  const common = {
    grade: 'Grade 2',
    datasets: [dataset],
    results: [],
    childId: 'maya',
    today: new Date(2026, 8, 28),
    childWordStates: states,
    lifecycleResolution: masteredResolution(dataset),
    random: () => 0.999,
  }

  const standalone = buildWarmupSelection({ ...common, targetSize: 16 })
  assert.deepEqual(standalone.words.map((word) => word.id), dataset.words.map((word) => word.id))
  assert.deepEqual(standalone.randomRotationWordIds, dataset.words.slice(0, 8).map((word) => word.id))
  assert.deepEqual(standalone.recentReviewWordIds, dataset.words.slice(8, 12).map((word) => word.id))
  assert.deepEqual(standalone.erroredWordIds, dataset.words.slice(12, 16).map((word) => word.id))

  const preActivity = buildWarmupSelection({ ...common, targetSize: 6 })
  assert.deepEqual(preActivity.words.map((word) => word.id), ['word-1', 'word-2', 'word-3', 'word-9', 'word-10', 'word-13'])
  assert.deepEqual(preActivity.randomRotationWordIds, ['word-1', 'word-2', 'word-3'])
  assert.deepEqual(preActivity.recentReviewWordIds, ['word-9', 'word-10'])
  assert.deepEqual(preActivity.erroredWordIds, ['word-13'])
})

test('Warmup boundary preserves legacy shortage filling and Rotation repetition as extraction evidence', () => {
  const dataset = datasetWithWords(['rotation', 'recent', 'errored'])
  const selection = buildWarmupSelection({
    grade: 'Grade 2',
    datasets: [dataset],
    results: [],
    childId: 'maya',
    today: new Date(2026, 8, 28),
    childWordStates: [
      state(dataset.words[0], 'random-rotation', { randomCycleId: 1, randomCycleReviewed: false }),
      state(dataset.words[1], 'recent-review'),
      state(dataset.words[2], 'errored-word'),
    ],
    lifecycleResolution: masteredResolution(dataset),
    targetSize: 6,
    random: () => 0.999,
  })

  // These are current-code compatibility rules, not approval of the future
  // Adaptive Warmup design. The later feature phase intentionally replaces them.
  assert.deepEqual(selection.words.map((word) => word.id), ['rotation', 'recent', 'errored', 'rotation', 'rotation', 'rotation'])
  assert.deepEqual(selection.randomRotationWordIds, ['rotation', 'rotation', 'rotation', 'rotation'])
  assert.deepEqual(selection.recentReviewWordIds, ['recent'])
  assert.deepEqual(selection.erroredWordIds, ['errored'])
})

test('Warmup boundary preserves current promotion, recovery, and response ordering', () => {
  const dataset = datasetWithWords(['recent-word', 'recovery-word'])
  const lifecycleResolution = masteredResolution(dataset, '2026-09-21')
  const results = [
    result(dataset.words[0], 'recent-2', '2026-09-22T12:00:00.000Z', true),
    result(dataset.words[0], 'recent-1', '2026-09-21T12:00:00.000Z', true),
    result(dataset.words[1], 'recovery-1', '2026-09-21T12:00:00.000Z', false),
    result(dataset.words[1], 'recovery-2', '2026-09-22T12:00:00.000Z', true),
    result(dataset.words[1], 'recovery-3', '2026-09-23T12:00:00.000Z', true),
    result(dataset.words[1], 'recovery-4', '2026-09-24T12:00:00.000Z', true),
  ]

  const states = deriveChildWordStates({
    grade: 'Grade 2',
    datasets: [dataset],
    results,
    childId: 'maya',
    today: new Date(2026, 8, 25),
    rotationCycleId: 1,
    lifecycleResolution,
  })

  assert.deepEqual(states, [
    {
      id: 'maya::recent-word',
      childId: 'maya',
      wordId: 'recent-word',
      datasetId: dataset.id,
      category: 'random-rotation',
      correctStreak: 0,
      lastReviewedAt: '2026-09-22T12:00:00.000Z',
      randomCycleId: 2,
      randomCycleReviewed: false,
    },
    {
      id: 'maya::recovery-word',
      childId: 'maya',
      wordId: 'recovery-word',
      datasetId: dataset.id,
      category: 'random-rotation',
      correctStreak: 0,
      lastReviewedAt: '2026-09-24T12:00:00.000Z',
      lastIncorrectAt: '2026-09-21T12:00:00.000Z',
      randomCycleId: 2,
      randomCycleReviewed: false,
    },
  ])
})

test('Warmup boundary preserves rotation exhaustion and delays newly promoted words', () => {
  const dataset = datasetWithWords(['reviewed', 'current-unreviewed', 'promoted-next-cycle'])
  const lifecycleResolution = masteredResolution(dataset)
  const common = {
    grade: 'Grade 2',
    datasets: [dataset],
    results: [],
    childId: 'maya',
    today: new Date(2026, 8, 28),
    rotationCycleId: 1,
    lifecycleResolution,
    random: () => 0.999,
  }
  const duringCurrentCycle = buildWarmupSelection({
    ...common,
    childWordStates: [
      state(dataset.words[0], 'random-rotation', { randomCycleId: 1, randomCycleReviewed: true }),
      state(dataset.words[1], 'random-rotation', { randomCycleId: 1, randomCycleReviewed: false }),
      state(dataset.words[2], 'random-rotation', { randomCycleId: 2, randomCycleReviewed: false }),
    ],
    targetSize: 1,
  })

  assert.equal(duringCurrentCycle.rotationCycleId, 1)
  assert.deepEqual(duringCurrentCycle.words.map((word) => word.id), ['current-unreviewed'])
  assert.ok(!duringCurrentCycle.words.some((word) => word.id === 'promoted-next-cycle'))

  const afterCurrentCycle = buildWarmupSelection({
    ...common,
    childWordStates: [
      state(dataset.words[0], 'random-rotation', { randomCycleId: 1, randomCycleReviewed: true }),
      state(dataset.words[1], 'random-rotation', { randomCycleId: 1, randomCycleReviewed: true }),
      state(dataset.words[2], 'random-rotation', { randomCycleId: 2, randomCycleReviewed: false }),
    ],
    targetSize: 3,
  })

  assert.equal(afterCurrentCycle.rotationCycleId, 2)
  assert.ok(afterCurrentCycle.words.some((word) => word.id === 'promoted-next-cycle'))
})
