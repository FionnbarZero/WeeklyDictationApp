import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  buildWarmupSelection,
  commitCompletedSession,
  createInitialState,
  hydrateLocalState,
  loadState,
  type PracticeSession,
} from '../src/domain.ts'
import { hydrateLocalStateFromJson, parsePresentationJson } from '../src/localHydration.ts'
import { datasetIdFor, grade2DeckProfile, importWeeklyDatasets, isCanonicalDataset } from '../src/slidesImporter.ts'

const fixturePath = fileURLToPath(new URL('./fixtures/grade2-presentation.json', import.meta.url))
const fixtureJson = readFileSync(fixturePath, 'utf8')
const fixture = parsePresentationJson(fixtureJson)
const malformedFixturePath = fileURLToPath(new URL('./fixtures/grade2-malformed-synthetic.json', import.meta.url))
const malformedFixture = parsePresentationJson(readFileSync(malformedFixturePath, 'utf8'))

test('canonical Grade 2 fixture traces through import, local state, practice, and reload', () => {
  const batch = importWeeklyDatasets(fixture, [], grade2DeckProfile)
  assert.equal(batch.status, 'ok')
  assert.equal(batch.datasets.length, 4)
  assert.equal(batch.outcomes.filter((outcome) => outcome.status === 'writing-workshop').length, 0)
  assert.equal(batch.outcomes.filter((outcome) => outcome.status === 'error').length, 0)
  assert.ok(batch.datasets.every((dataset) => isCanonicalDataset(dataset)))
  assert.ok(batch.datasets.every((dataset) => dataset.sourceDeckId === grade2DeckProfile.sourceDeckId && dataset.sourceSlideId))
  assert.ok(batch.datasets.every((dataset) => dataset.id === datasetIdFor(grade2DeckProfile, dataset)))
  assert.ok(batch.datasets.every((dataset) => dataset.words.every((word) => word.datasetId === dataset.id && word.id.startsWith(`${dataset.id}-`) && word.sentence === '')))

  const initial = createInitialState()
  initial.results = [{
    id: 'existing-progress', childId: 'maya', datasetId: 'legacy-dataset', datasetDateRange: 'unknown', wordId: 'legacy-word',
    grade: 'Grade 2', phase: 'warmup', sessionId: 'legacy-session', sessionDate: '2026-09-20', completedAt: '2026-09-20T12:00:00.000Z',
    correct: true, revealMethod: 'timer', scored: true, completeSourceDatasetReviewed: false,
  }]

  const hydrated = hydrateLocalState(initial, fixture, grade2DeckProfile)
  assert.equal(hydrated.state.datasets.length, 4)
  assert.equal(hydrated.state.results[0].id, 'existing-progress')

  const warmup = buildWarmupSelection({ grade: 'Grade 2', datasets: hydrated.state.datasets, results: hydrated.state.results, childId: 'maya', today: new Date(2026, 8, 23), random: () => 0 })
  const primaryDataset = hydrated.state.datasets.find((dataset) => dataset.dateRange === '9/14–9/18')!
  const warmupWords = warmup.words.slice(0, 2)
  assert.equal(warmupWords.length, 2)

  const session: PracticeSession = {
    id: 'tracer-session', childId: 'maya', grade: 'Grade 2', primaryDatasetId: primaryDataset.id, primaryPhase: 'test-review',
    segment: 'primary', stage: 'review', queue: [...warmupWords, ...primaryDataset.words], warmupQueue: warmupWords, primaryQueue: primaryDataset.words,
    index: primaryDataset.words.length - 1, startedAt: '2026-09-23T12:00:00.000Z',
    warmupAnswers: warmupWords.map((word) => ({ word, correct: true, revealMethod: 'timer' })),
    primaryAnswers: primaryDataset.words.map((word) => ({ word, correct: true, revealMethod: 'timer' })),
    warmupCategoryByWordId: Object.fromEntries(warmupWords.map((word) => [word.id, 'recent-review'])),
    warmupRandomRotationWordIds: [], warmupRotationCycleId: warmup.rotationCycleId,
  }

  const committed = commitCompletedSession(hydrated.state, session, new Date(2026, 8, 23, 12, 0))
  assert.equal(committed.scores.length, 1)
  assert.equal(committed.scores[0].datasetId, primaryDataset.id)
  assert.equal(committed.results.length, 1 + warmupWords.length + primaryDataset.words.length)

  const reloaded = loadState(JSON.stringify(committed))
  assert.deepEqual(reloaded.datasets.map((dataset) => dataset.id), committed.datasets.map((dataset) => dataset.id))
  assert.deepEqual(JSON.parse(JSON.stringify(reloaded.scores)), JSON.parse(JSON.stringify(committed.scores)))
  assert.deepEqual(reloaded.results, committed.results)
})

test('re-importing the canonical fixture remains idempotent', () => {
  const first = hydrateLocalStateFromJson(createInitialState(), fixtureJson, grade2DeckProfile).state
  const second = hydrateLocalStateFromJson(first, fixtureJson, grade2DeckProfile).state
  assert.equal(second.datasets.length, first.datasets.length)
  assert.equal(new Set(second.datasets.map((dataset) => dataset.id)).size, second.datasets.length)
  assert.deepEqual(second.datasets.map((dataset) => dataset.id), first.datasets.map((dataset) => dataset.id))
})

test('separate synthetic malformed input cannot replace the observed canonical fixture', () => {
  const canonical = hydrateLocalState(createInitialState(), fixture, grade2DeckProfile).state
  const hydrated = hydrateLocalState(canonical, malformedFixture, grade2DeckProfile)
  assert.equal(hydrated.batch.status, 'error')
  assert.equal(hydrated.batch.outcomes[0]?.sourceSlideId, 'synthetic-malformed-slide')
  assert.equal(hydrated.batch.outcomes[0]?.status, 'error')
  assert.deepEqual(hydrated.state.datasets.map((dataset) => dataset.id), canonical.datasets.map((dataset) => dataset.id))
})
