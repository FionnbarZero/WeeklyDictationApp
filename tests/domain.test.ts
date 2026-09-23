import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AUDIO_PAUSE_MS,
  audioPartsForWord,
  buildWarmupSelection,
  commitCompletedSession,
  createInitialState,
  createSessionId,
  datasetLifecycle,
  localDateKey,
  loadState,
  sampleDatasets,
  sortDatasetsNewestFirst,
  timerSecondsFor,
  type AppState,
  type PracticeSession,
  type WordResult,
} from '../src/domain.ts'

const today = new Date(2026, 8, 18)
const priorDataset = sampleDatasets.find((dataset) => dataset.id === '2026-09-07__2026-09-11')!
const currentDataset = sampleDatasets.find((dataset) => dataset.id === '2026-09-14__2026-09-18')!

function result(overrides: Partial<WordResult>): WordResult {
  return {
    id: `result-${Math.random()}`, childId: 'maya', datasetId: currentDataset.id, datasetDateRange: currentDataset.dateRange,
    wordId: currentDataset.words[0].id, grade: 'Kindergarten', phase: 'acquisition', sessionId: 'old-session', sessionDate: '2026-09-17', completedAt: '2026-09-17T12:00:00.000Z', correct: false, revealMethod: 'timer', scored: true, completeSourceDatasetReviewed: false,
    ...overrides,
  }
}

test('dataset lifecycle uses permanent date ranges', () => {
  assert.equal(datasetLifecycle(currentDataset, new Date(2026, 8, 18)), 'acquisition')
  assert.equal(datasetLifecycle(priorDataset, today), 'test-review')
  assert.equal(datasetLifecycle(sampleDatasets[0], today), 'archived')
})

test('dataset graphs order newest learned date range first', () => {
  assert.deepEqual(sortDatasetsNewestFirst(sampleDatasets).map((dataset) => dataset.dateRange), ['9/14–9/18', '9/7–9/11', '8/31–9/4', '8/24–8/28', '8/17–8/21', '8/10–8/14'])
})

test('sample data covers six weeks with flexible word counts', () => {
  assert.equal(sampleDatasets.length, 6)
  assert.deepEqual(sampleDatasets.map((dataset) => dataset.words.length), [5, 4, 7, 4, 6, 6])
})

test('audio sequence and warmup rate are stable', () => {
  const normal = audioPartsForWord(currentDataset.words[0])
  const warmup = audioPartsForWord(currentDataset.words[0], true)
  assert.deepEqual(normal.map((part) => part.text), [currentDataset.words[0].text, currentDataset.words[0].sentence, currentDataset.words[0].text, currentDataset.words[0].text])
  assert.equal(AUDIO_PAUSE_MS, 1000)
  assert.equal(warmup[0].rate, normal[0].rate * 1.5)
  assert.equal(warmup[1].rate, normal[1].rate * 1.5)
})

test('phase timers remain configurable by lifecycle', () => {
  assert.equal(timerSecondsFor('warmup', 'acquisition'), 5)
  assert.equal(timerSecondsFor('primary', 'acquisition'), 20)
  assert.equal(timerSecondsFor('primary', 'test-review'), 10)
})

test('warmup includes category A, category B, and rounded category C without duplicates', () => {
  const selection = buildWarmupSelection({ datasets: sampleDatasets, results: [], warmupSessions: [], childId: 'maya', today })
  assert.equal(selection.categoryAWordIds.length, priorDataset.words.length)
  assert.equal(selection.additionalCount, Math.ceil(priorDataset.words.length * 0.25))
  assert.equal(selection.categoryCWordIds.length, selection.additionalCount)
  assert.equal(new Set(selection.words.map((word) => word.id)).size, selection.words.length)
  assert.equal(selection.words.length, priorDataset.words.length + selection.additionalCount)
})

test('category B adds a complete dataset when any word has a recent error', () => {
  const selection = buildWarmupSelection({ datasets: sampleDatasets, results: [result({ wordId: currentDataset.words[2].id })], warmupSessions: [], childId: 'maya', today })
  assert.equal(selection.categoryBWordIds.length, currentDataset.words.length)
  assert.ok(currentDataset.words.every((word) => selection.words.some((selected) => selected.id === word.id)))
})

test('category C excludes words with errors in the last three completed warmups', () => {
  const sessions = [1, 2, 3].map((number) => ({ id: `warmup-${number}`, childId: 'maya', sessionId: `session-${number}`, sessionDate: `2026-09-${String(15 - number).padStart(2, '0')}`, wordIds: [], datasetIds: [], completeDatasetIds: [], complete: true }))
  const excludedWord = sampleDatasets[0].words[0]
  const selection = buildWarmupSelection({ datasets: sampleDatasets, results: sessions.map((session) => result({ id: `${session.id}-result`, datasetId: excludedWord.datasetId, datasetDateRange: sampleDatasets[0].dateRange, wordId: excludedWord.id, phase: 'warmup', warmupSessionId: session.id })), warmupSessions: sessions, childId: 'maya', today })
  assert.ok(!selection.categoryCWordIds.includes(excludedWord.id))
})

function completeSession(state: AppState): PracticeSession {
  return {
    id: createSessionId(), childId: 'maya', grade: 'Kindergarten', primaryDatasetId: currentDataset.id, primaryPhase: 'acquisition', segment: 'primary', stage: 'review',
    queue: currentDataset.words, warmupQueue: priorDataset.words, primaryQueue: currentDataset.words, index: currentDataset.words.length - 1, startedAt: '2026-09-18T12:00:00.000Z',
    warmupAnswers: priorDataset.words.map((word) => ({ word, correct: true, revealMethod: 'timer' })),
    primaryAnswers: currentDataset.words.map((word, index) => ({ word, correct: index !== 1, revealMethod: 'timer' })),
  }
}

test('complete sessions create primary and full-dataset warmup scores once', () => {
  const state = createInitialState()
  const session = completeSession(state)
  const committed = commitCompletedSession(state, session, today)
  assert.equal(committed.results.length, priorDataset.words.length + currentDataset.words.length)
  assert.equal(committed.scores.length, 2)
  assert.equal(committed.scores.find((score) => score.datasetId === currentDataset.id)?.percent, 83)
  assert.ok(committed.results.every((item) => item.revealMethod === 'timer'))
  assert.ok(committed.results.filter((item) => item.datasetId === priorDataset.id).every((item) => item.completeSourceDatasetReviewed))
  const duplicateCommit = commitCompletedSession(committed, session, today)
  assert.equal(duplicateCommit.scores.length, 2)
  assert.equal(duplicateCommit.results.length, committed.results.length)
})

test('partial sessions create no results or graph points', () => {
  const state = createInitialState()
  const session = completeSession(state)
  session.primaryAnswers = session.primaryAnswers.slice(0, -1)
  const resultState = commitCompletedSession(state, session, today)
  assert.equal(resultState.results.length, 0)
  assert.equal(resultState.scores.length, 0)
})

test('legacy data is preserved without inventing dataset dates', () => {
  const state = createInitialState(JSON.stringify([{ childId: 'maya', weeklySetId: 'current', termId: 'old-word', sessionId: 'old-session', completedAt: '2026-09-10T12:00:00.000Z', correct: true }]))
  assert.equal(state.legacyRecords.length, 1)
  assert.equal(state.legacyRecords[0].note, 'legacy-date-range-unknown')
})

test('malformed state falls back safely without corrupting sample datasets', () => {
  const state = loadState('{not valid json', 'not valid json')
  assert.equal(state.version, 2)
  assert.equal(state.datasets.length, sampleDatasets.length)
  assert.equal(state.legacyRecords.length, 0)
})

test('valid older sample state receives missing datasets without losing history', () => {
  const olderState = createInitialState()
  olderState.datasets = sampleDatasets.slice(3)
  olderState.legacyRecords = [{
    id: 'legacy-preserved', childId: 'maya', legacySet: 'current', termId: 'old-word', sessionId: 'old-session',
    completedAt: '2026-09-10T12:00:00.000Z', correct: true, revealMethod: 'timer', note: 'legacy-date-range-unknown',
  }]
  const migrated = loadState(JSON.stringify(olderState))
  assert.equal(migrated.datasets.length, 6)
  assert.equal(migrated.legacyRecords.length, 1)
  assert.ok(migrated.datasets.some((dataset) => dataset.id === '2026-08-10__2026-08-14'))
})

test('local date keys use the local calendar rather than UTC slicing', () => {
  assert.equal(localDateKey(new Date(2026, 8, 18, 23, 59)), '2026-09-18')
})

test('session IDs are unique', () => {
  const ids = new Set(Array.from({ length: 20 }, () => createSessionId()))
  assert.equal(ids.size, 20)
})
