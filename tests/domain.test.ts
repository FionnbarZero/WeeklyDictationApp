import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AUDIO_PAUSE_MS,
  FAMILIAR_DT_WORDS,
  acquisitionTimerConfigFor,
  activePracticeWord,
  audioPartsForWord,
  answerAcquisitionPrompt,
  acquisitionProgressFor,
  buildWarmupSelection,
  commitCompletedSession,
  commitPartialSession,
  commitSkippedTestReview,
  checkpointAcquisitionSession,
  createInitialState,
  createPracticeSessionForTarget,
  createSessionId,
  datasetLifecycle,
  deriveChildWordStates,
  filterDatasetsForChild,
  getActiveLifecycleDatasets,
  hydrateLocalState,
  localDateKey,
  loadState,
  latestScore,
  revealAcquisitionPrompt,
  resumeAcquisitionFlow,
  startAcquisitionFlow,
  shouldSuggestGradePromotion,
  shouldRecordAcquisitionAnswer,
  sortDatasetsNewestFirst,
  timerSecondsFor,
  type AppState,
  type AcquisitionFlow,
  type ChildWordState,
  type PracticeSession,
  type WordResult,
} from '../src/domain.ts'
import { datasetIdFor, grade2DeckProfile, grade5DeckProfile, importWeeklyDatasets } from '../src/slidesImporter.ts'
import { grade2PracticeProfile } from '../src/practice/profiles/grade2.ts'

const today = new Date(2026, 8, 18)
const hydrationPresentation = { presentationId: grade2DeckProfile.sourceDeckId, slides: [
  { objectId: 'oldest', text: 'Week 8/31-9/4\nMandarin\nTier 1: 甲、乙、丙、丁、戊' },
  { objectId: 'prior', text: 'Week 9/8-9/11\nMandarin\nTier 1: 己、庚、辛、壬、癸' },
  { objectId: 'current', text: 'Week 9/14-9/18\nMandarin\nTier 1: 子、丑、寅、卯、辰' },
  { objectId: 'future', text: 'Week 9/21-9/25\nMandarin\nTier 1: 巳、午、未、申、酉' },
]}
const importedDatasets = importWeeklyDatasets(hydrationPresentation, [], grade2DeckProfile).datasets
const oldestDataset = importedDatasets.find((dataset) => dataset.sourceSlideId === 'oldest')!
const priorDataset = importedDatasets.find((dataset) => dataset.sourceSlideId === 'prior')!
const currentDataset = importedDatasets.find((dataset) => dataset.sourceSlideId === 'current')!
const futureDataset = importedDatasets.find((dataset) => dataset.sourceSlideId === 'future')!
const grade5Dataset = importWeeklyDatasets({
  presentationId: grade5DeckProfile.sourceDeckId,
  slides: [{ objectId: 'grade-five-history', text: 'Week 9/14-9/18\nMandarin\nTier 1: 需要、部分、重要' }],
}, [], grade5DeckProfile).datasets[0]
const replacementDataset = importWeeklyDatasets({
  presentationId: grade2DeckProfile.sourceDeckId,
  slides: [{ objectId: 'replacement', text: 'Week 9/28-10/2\nMandarin\nTier 1: 天、地、玄、黄、宇' }],
}, [], grade2DeckProfile).datasets[0]
const delayedReplacementDataset = importWeeklyDatasets({
  presentationId: grade2DeckProfile.sourceDeckId,
  slides: [{ objectId: 'delayed-replacement', text: 'Week 10/12-10/16\nMandarin\nTier 1: 金、木、水、火、土' }],
}, [], grade2DeckProfile).datasets[0]
const initialState = () => createInitialState(importedDatasets)

function result(overrides: Partial<WordResult>): WordResult {
  return {
    id: `result-${Math.random()}`, childId: 'maya', datasetId: currentDataset.id, datasetDateRange: currentDataset.dateRange,
    wordId: currentDataset.words[0].id, grade: 'Grade 2', phase: 'acquisition', sessionId: 'old-session', sessionDate: '2026-09-17', completedAt: '2026-09-17T12:00:00.000Z', correct: false, revealMethod: 'timer', scored: true, completeSourceDatasetReviewed: false,
    ...overrides,
  }
}

test('dataset lifecycle uses ordered valid replacements instead of Friday expiration', () => {
  assert.equal(datasetLifecycle(currentDataset, importedDatasets, today), 'acquisition')
  assert.equal(datasetLifecycle(priorDataset, importedDatasets, today), 'test-review')
  assert.equal(datasetLifecycle(oldestDataset, importedDatasets, today), 'mastered')
  assert.equal(datasetLifecycle(futureDataset, importedDatasets, today), 'future')
})

test('Acquisition and Test Review are independently active on the same date', () => {
  const active = getActiveLifecycleDatasets(importedDatasets, new Date(2026, 8, 23))
  assert.equal(active.acquisition?.id, futureDataset.id)
  assert.equal(active.testReview?.id, currentDataset.id)
})

test('lifecycle selection assigns the newest arrived dataset and its immediate predecessor', () => {
  const lifecycleDate = new Date(2026, 8, 23)
  assert.deepEqual(getActiveLifecycleDatasets([futureDataset], lifecycleDate), { acquisition: futureDataset, testReview: null })
  assert.deepEqual(getActiveLifecycleDatasets([currentDataset], lifecycleDate), { acquisition: currentDataset, testReview: null })
  assert.deepEqual(getActiveLifecycleDatasets([oldestDataset, priorDataset], lifecycleDate), { acquisition: priorDataset, testReview: oldestDataset })
  assert.deepEqual(getActiveLifecycleDatasets([], lifecycleDate), { acquisition: null, testReview: null })
})

test('weekends and missing replacements preserve Acquisition and Test Review assignments', () => {
  for (const lifecycleDate of [new Date(2026, 8, 18), new Date(2026, 8, 19), new Date(2026, 8, 20)]) {
    const active = getActiveLifecycleDatasets(importedDatasets, lifecycleDate)
    assert.equal(active.acquisition?.id, currentDataset.id)
    assert.equal(active.testReview?.id, priorDataset.id)
  }

  const withoutReplacement = getActiveLifecycleDatasets(importedDatasets, new Date(2026, 8, 28))
  assert.equal(withoutReplacement.acquisition?.id, futureDataset.id)
  assert.equal(withoutReplacement.testReview?.id, currentDataset.id)

  const duplicateOnly = getActiveLifecycleDatasets([...importedDatasets, futureDataset], new Date(2026, 8, 28))
  assert.equal(duplicateOnly.acquisition?.id, futureDataset.id)
  assert.equal(duplicateOnly.testReview?.id, currentDataset.id)

  const withReplacement = getActiveLifecycleDatasets([...importedDatasets, replacementDataset], new Date(2026, 8, 28))
  assert.equal(withReplacement.acquisition?.id, replacementDataset.id)
  assert.equal(withReplacement.testReview?.id, futureDataset.id)
  assert.equal(datasetLifecycle(currentDataset, [...importedDatasets, replacementDataset], new Date(2026, 8, 28)), 'mastered')
})

test('writing-workshop and malformed datasets never create or advance primary lifecycle options', () => {
  const workshop = importWeeklyDatasets({
    presentationId: grade2DeckProfile.sourceDeckId,
    slides: [{ objectId: 'workshop-week', text: 'Week 9/28-10/2\nMandarin\nWriting Workshop\nNo new Tier 1 targets' }],
  }, [], grade2DeckProfile).datasets[0]
  assert.ok(workshop?.isWritingWorkshop)
  assert.deepEqual(getActiveLifecycleDatasets([workshop], new Date(2026, 8, 23)), { acquisition: null, testReview: null })
  assert.equal(datasetLifecycle(workshop, [...importedDatasets, workshop], new Date(2026, 8, 28)), 'no-instruction')
  assert.deepEqual(getActiveLifecycleDatasets([...importedDatasets, workshop], new Date(2026, 8, 28)), { acquisition: futureDataset, testReview: currentDataset })

  const malformed = { ...futureDataset, id: '2026-09-21__2026-09-25' }
  assert.deepEqual(getActiveLifecycleDatasets([malformed], new Date(2026, 8, 23)), { acquisition: null, testReview: null })
  assert.deepEqual(getActiveLifecycleDatasets([...importedDatasets, malformed], new Date(2026, 8, 28)), { acquisition: futureDataset, testReview: currentDataset })
})

test('grade and school-year filtering occurs before lifecycle selection', () => {
  const gradeFive = importWeeklyDatasets({
    presentationId: grade5DeckProfile.sourceDeckId,
    slides: [{ objectId: 'grade-five-current', text: 'Week 6 (9/21-25)\nMandarin\nTier 1: 天、地、人' }],
  }, [], grade5DeckProfile).datasets[0]
  const filtered = filterDatasetsForChild([...importedDatasets, gradeFive], 'Grade 2', '2026–2027')
  const active = getActiveLifecycleDatasets(filtered, new Date(2026, 8, 23))
  assert.equal(active.acquisition?.id, futureDataset.id)
  assert.equal(active.testReview?.id, currentDataset.id)
  assert.ok(filtered.every((dataset) => dataset.grade === 'Grade 2' && dataset.schoolYear === '2026–2027'))
})

test('each primary activity starts by offering the same adaptive Warmup', () => {
  const lifecycleDate = new Date(2026, 8, 23)
  const warmup = buildWarmupSelection({ grade: 'Grade 2', datasets: importedDatasets, results: [], childId: 'maya', today: lifecycleDate, targetSize: grade2PracticeProfile.lifecycle.primaryWarmupTrials, random: () => 0.25 })
  assert.equal(warmup.words.length, 6)
  assert.ok(warmup.words.every((word) => word.datasetId !== futureDataset.id))

  const acquisition = createPracticeSessionForTarget({ id: 'acquisition-session', childId: 'maya', grade: 'Grade 2', target: { dataset: futureDataset, phase: 'acquisition' }, warmup, startedAt: lifecycleDate.toISOString(), random: () => 0 })
  assert.equal(acquisition.segment, 'warmup')
  assert.equal(acquisition.stage, 'warmup-intro')
  assert.equal(acquisition.primaryDatasetId, futureDataset.id)
  assert.equal(acquisition.primaryPhase, 'acquisition')
  assert.equal(acquisition.warmupQueue.length, 6)
  assert.deepEqual(acquisition.primaryQueue.map((word) => word.id), futureDataset.words.map((word) => word.id))
  assert.ok(acquisition.acquisition)
  assert.equal(acquisition.warmupOnly, false)

  const testReview = createPracticeSessionForTarget({ id: 'test-review-session', childId: 'maya', grade: 'Grade 2', target: { dataset: currentDataset, phase: 'test-review' }, warmup, startedAt: lifecycleDate.toISOString(), random: () => 0 })
  assert.equal(testReview.segment, 'warmup')
  assert.equal(testReview.stage, 'warmup-intro')
  assert.equal(testReview.primaryDatasetId, currentDataset.id)
  assert.equal(testReview.primaryPhase, 'test-review')
  assert.equal(testReview.warmupQueue.length, 6)
  assert.deepEqual(testReview.primaryQueue.map((word) => word.id), currentDataset.words.map((word) => word.id))
  assert.equal(testReview.acquisition, undefined)
  assert.equal(testReview.warmupOnly, false)
})

test('Acquisition and Test Review completion records and scores remain independent', () => {
  const lifecycleDate = new Date(2026, 8, 23, 12, 0)
  const warmup = buildWarmupSelection({ grade: 'Grade 2', datasets: importedDatasets, results: [], childId: 'maya', today: lifecycleDate, random: () => 0.25 })
  const acquisitionStarted = createPracticeSessionForTarget({ id: 'independent-acquisition', childId: 'maya', grade: 'Grade 2', target: { dataset: futureDataset, phase: 'acquisition' }, warmup, startedAt: lifecycleDate.toISOString(), random: () => 0 })
  const acquisitionComplete: PracticeSession = {
    ...acquisitionStarted,
    segment: 'primary',
    stage: 'complete',
    warmupAnswers: acquisitionStarted.warmupQueue.map((word) => ({ word, correct: true, revealMethod: 'timer' })),
    primaryAnswers: acquisitionStarted.primaryQueue.map((word, index) => ({ word, correct: index !== 0, revealMethod: 'timer' })),
    acquisition: acquisitionStarted.acquisition ? { ...acquisitionStarted.acquisition, currentTarget: null, prompt: null, complete: true } : undefined,
  }
  const afterAcquisition = commitCompletedSession(initialState(), acquisitionComplete, lifecycleDate)
  assert.deepEqual(afterAcquisition.completedSessions.map(({ id, primaryDatasetId, primaryPhase }) => ({ id, primaryDatasetId, primaryPhase })), [
    { id: 'independent-acquisition', primaryDatasetId: futureDataset.id, primaryPhase: 'acquisition' },
  ])
  assert.deepEqual(afterAcquisition.scores.map(({ sessionId, datasetId, phase, percent }) => ({ sessionId, datasetId, phase, percent })), [
    { sessionId: 'independent-acquisition', datasetId: futureDataset.id, phase: 'acquisition', percent: 80 },
  ])
  const stillAvailable = getActiveLifecycleDatasets(afterAcquisition.datasets, lifecycleDate)
  assert.equal(stillAvailable.acquisition?.id, futureDataset.id)
  assert.equal(stillAvailable.testReview?.id, currentDataset.id)

  const testReviewStarted = createPracticeSessionForTarget({ id: 'independent-test-review', childId: 'maya', grade: 'Grade 2', target: { dataset: currentDataset, phase: 'test-review' }, warmup, startedAt: lifecycleDate.toISOString(), random: () => 0 })
  const testReviewComplete: PracticeSession = {
    ...testReviewStarted,
    segment: 'primary',
    stage: 'complete',
    warmupAnswers: testReviewStarted.warmupQueue.map((word) => ({ word, correct: true, revealMethod: 'timer' })),
    primaryAnswers: testReviewStarted.primaryQueue.map((word) => ({ word, correct: true, revealMethod: 'timer' })),
  }
  const afterBoth = commitCompletedSession(afterAcquisition, testReviewComplete, lifecycleDate)
  assert.deepEqual(afterBoth.completedSessions.map(({ id, primaryDatasetId, primaryPhase }) => ({ id, primaryDatasetId, primaryPhase })), [
    { id: 'independent-acquisition', primaryDatasetId: futureDataset.id, primaryPhase: 'acquisition' },
    { id: 'independent-test-review', primaryDatasetId: currentDataset.id, primaryPhase: 'test-review' },
  ])
  assert.deepEqual(afterBoth.scores.map(({ sessionId, datasetId, phase, percent }) => ({ sessionId, datasetId, phase, percent })), [
    { sessionId: 'independent-acquisition', datasetId: futureDataset.id, phase: 'acquisition', percent: 80 },
    { sessionId: 'independent-test-review', datasetId: currentDataset.id, phase: 'test-review', percent: 100 },
  ])
  assert.deepEqual(afterBoth.scores[0], afterAcquisition.scores[0])
})

test('Warmup-only fallback starts safely without a primary lifecycle target', () => {
  const warmup = buildWarmupSelection({ grade: 'Grade 2', datasets: importedDatasets, results: [], childId: 'maya', today: new Date(2026, 9, 20), random: () => 0.25 })
  const session = createPracticeSessionForTarget({ id: 'warmup-only-session', childId: 'maya', grade: 'Grade 2', target: null, warmup, startedAt: '2026-10-20T12:00:00.000Z', random: () => 0 })
  assert.equal(session.segment, 'warmup')
  assert.equal(session.stage, 'warmup-intro')
  assert.equal(session.warmupQueue.length, warmup.words.length)
  assert.equal(session.warmupQueue.length, 16)
  assert.equal(session.primaryQueue.length, 0)
  assert.equal(session.acquisition, undefined)
  assert.equal(session.warmupOnly, true)
})

test('dataset graphs order newest learned date range first', () => {
  assert.deepEqual(sortDatasetsNewestFirst(importedDatasets).map((dataset) => dataset.dateRange), ['9/21–9/25', '9/14–9/18', '9/8–9/11', '8/31–9/4'])
})

test('local data uses importer-shaped canonical datasets and matching word IDs', () => {
  assert.equal(importedDatasets.length, 4)
  assert.ok(importedDatasets.every((dataset) => dataset.id === datasetIdFor(grade2DeckProfile, dataset)))
  assert.ok(importedDatasets.every((dataset) => dataset.words.every((word) => word.datasetId === dataset.id && word.id.startsWith(`${dataset.id}-`))))
})

test('read-only presentation data hydrates local state through the importer', () => {
  const hydrated = hydrateLocalState(createInitialState(), hydrationPresentation, grade2DeckProfile)
  assert.equal(hydrated.batch.status, 'ok')
  assert.equal(hydrated.state.datasets.length, 4)
  assert.ok(hydrated.state.datasets.every((dataset) => dataset.sourceDeckId === grade2DeckProfile.sourceDeckId && dataset.sourceSlideId))
  assert.ok(hydrated.state.datasets.every((dataset) => dataset.words.every((word) => word.datasetId === dataset.id)))
})

test('malformed slides do not replace an existing valid dataset', () => {
  const valid = hydrateLocalState(createInitialState(), { presentationId: grade2DeckProfile.sourceDeckId, slides: [hydrationPresentation.slides[2]] }, grade2DeckProfile).state
  const refreshed = hydrateLocalState(valid, { presentationId: grade2DeckProfile.sourceDeckId, slides: [{ objectId: 'broken', text: 'Week 9/14-9/18\nMandarin\nWriting ideas only' }] }, grade2DeckProfile)
  assert.equal(refreshed.batch.status, 'error')
  assert.deepEqual(refreshed.state.datasets, valid.datasets)
})

test('repeated hydration remains idempotent by canonical dataset ID', () => {
  const once = hydrateLocalState(createInitialState(), hydrationPresentation, grade2DeckProfile).state
  const twice = hydrateLocalState(once, hydrationPresentation, grade2DeckProfile).state
  assert.equal(twice.datasets.length, once.datasets.length)
  assert.equal(new Set(twice.datasets.map((dataset) => dataset.id)).size, twice.datasets.length)
})

test('hydration preserves local progress while refreshing datasets', () => {
  const state = initialState()
  state.results = [result({ id: 'saved-result', correct: true })]
  state.scores = [{ id: 'saved-score', childId: 'maya', datasetId: currentDataset.id, datasetDateRange: currentDataset.dateRange, phase: 'acquisition', sessionId: 'saved-session', sessionDate: '2026-09-18', percent: 100, correct: 5, wordCount: 5 }]
  state.warmupSessions = [{ id: 'saved-warmup', childId: 'maya', sessionId: 'saved-session', sessionDate: '2026-09-18', wordIds: [priorDataset.words[0].id], datasetIds: [priorDataset.id], completeDatasetIds: [], complete: true }]
  state.completedSessions = [{ id: 'saved-session', childId: 'maya', sessionDate: '2026-09-18', primaryDatasetId: currentDataset.id, primaryPhase: 'acquisition', complete: true }]
  state.legacyRecords = [{ id: 'saved-legacy', childId: 'maya', legacySet: 'current', termId: 'old-word', sessionId: 'old-session', completedAt: '2026-09-10T12:00:00.000Z', correct: true, revealMethod: 'timer', note: 'legacy-date-range-unknown' }]
  const hydrated = hydrateLocalState(state, hydrationPresentation, grade2DeckProfile).state
  assert.deepEqual(hydrated.results, state.results)
  assert.deepEqual(hydrated.scores, state.scores)
  assert.deepEqual(hydrated.warmupSessions, state.warmupSessions)
  assert.deepEqual(hydrated.completedSessions, state.completedSessions)
  assert.deepEqual(hydrated.legacyRecords, state.legacyRecords)
})

test('hydration does not reintroduce old placeholders or fabricate no-data fallbacks', () => {
  const placeholderState = createInitialState()
  placeholderState.datasets = [{
    ...importedDatasets[0],
    id: '2026-09-21__2026-09-25',
    words: [{ ...importedDatasets[0].words[0], id: '2026-09-21__2026-09-25-1', datasetId: '2026-09-21__2026-09-25', text: 'placeholder' }],
  }]
  const emptyHydration = hydrateLocalState(placeholderState, { presentationId: grade2DeckProfile.sourceDeckId, slides: [{ objectId: 'malformed', text: 'Not a weekly dataset' }] }, grade2DeckProfile)
  assert.equal(emptyHydration.batch.status, 'error')
  assert.equal(emptyHydration.state.datasets.length, 0)
})

test('audio sequence and warmup rate are stable', () => {
  const audioWord = { ...currentDataset.words[0], sentence: '这是一个短句。' }
  const normal = audioPartsForWord(audioWord)
  const warmup = audioPartsForWord(audioWord, true)
  assert.deepEqual(normal.map((part) => part.text), [audioWord.text, audioWord.sentence, audioWord.text, audioWord.text])
  assert.equal(AUDIO_PAUSE_MS, 1000)
  assert.equal(warmup[0].rate, normal[0].rate * 1.5)
  assert.equal(warmup[1].rate, normal[1].rate * 1.5)
})

test('Acquisition audio follows the active prompt instead of the flat primary queue', () => {
  const flow = startAcquisitionFlow(currentDataset, 'Grade 2', () => 0)
  const promptWord = activePracticeWord({ segment: 'primary', acquisition: flow, queue: currentDataset.words, index: 0 })
  assert.equal(promptWord?.datasetId, '__familiar-dt__')
  assert.equal(promptWord?.sentence, '')
  assert.equal(activePracticeWord({ segment: 'warmup', acquisition: flow, queue: currentDataset.words, index: 0 })?.id, currentDataset.words[0].id)
})

test('phase timers remain configurable by lifecycle', () => {
  assert.equal(timerSecondsFor('Grade 2', 'warmup', 'acquisition'), 10)
  assert.equal(timerSecondsFor('Grade 2', 'primary', 'acquisition'), 10)
  assert.equal(timerSecondsFor('Grade 2', 'primary', 'test-review'), 10)
  assert.throws(() => timerSecondsFor('Kindergarten', 'primary', 'acquisition'), /not configured/i)
  assert.throws(() => startAcquisitionFlow({ ...currentDataset, grade: 'Grade 5' }, 'Grade 5'), /not configured/i)
  assert.throws(() => buildWarmupSelection({ grade: 'Grade 5', datasets: [], results: [], childId: 'maya' }), /not configured/i)
})

test('adaptive warmup uses only Mastered datasets and excludes active Acquisition and Test Review', () => {
  const lifecycleDate = new Date(2026, 8, 23)
  const selection = buildWarmupSelection({ grade: 'Grade 2', datasets: importedDatasets, results: [], childId: 'maya', today: lifecycleDate, targetSize: grade2PracticeProfile.lifecycle.primaryWarmupTrials, random: () => 0.25 })
  const eligibleDatasetIds = new Set([oldestDataset.id, priorDataset.id])
  assert.equal(selection.words.length, 6)
  assert.ok(selection.words.every((word) => eligibleDatasetIds.has(word.datasetId)))
  assert.ok(selection.words.every((word) => word.datasetId !== futureDataset.id && word.datasetId !== currentDataset.id))
  assert.ok(selection.recentReviewWordIds.every((id) => priorDataset.words.some((word) => word.id === id)))
  assert.ok(selection.randomRotationWordIds.every((id) => oldestDataset.words.some((word) => word.id === id)))
})

test('errors from active Acquisition and Test Review datasets cannot bypass warmup eligibility', () => {
  const lifecycleDate = new Date(2026, 8, 23)
  const acquisitionError = futureDataset.words[2]
  const testReviewError = currentDataset.words[2]
  const selection = buildWarmupSelection({ grade: 'Grade 2', datasets: importedDatasets, results: [
    result({ id: 'acquisition-error', datasetId: futureDataset.id, datasetDateRange: futureDataset.dateRange, wordId: acquisitionError.id, correct: false }),
    result({ id: 'test-review-error', datasetId: currentDataset.id, datasetDateRange: currentDataset.dateRange, wordId: testReviewError.id, correct: false }),
  ], childId: 'maya', today: lifecycleDate, targetSize: grade2PracticeProfile.lifecycle.primaryWarmupTrials, random: () => 0.25 })
  assert.ok(!selection.erroredWordIds.includes(acquisitionError.id))
  assert.ok(!selection.erroredWordIds.includes(testReviewError.id))
  assert.ok(selection.words.every((word) => word.id !== acquisitionError.id && word.id !== testReviewError.id))
})

test('persisted adaptive categories cannot bypass active lifecycle exclusion', () => {
  const lifecycleDate = new Date(2026, 8, 23)
  const acquisitionWord = futureDataset.words[0]
  const testReviewWord = currentDataset.words[0]
  const selection = buildWarmupSelection({ grade: 'Grade 2', datasets: importedDatasets, results: [], childId: 'maya', today: lifecycleDate, targetSize: grade2PracticeProfile.lifecycle.primaryWarmupTrials, childWordStates: [
    { id: `maya::${acquisitionWord.id}`, childId: 'maya', wordId: acquisitionWord.id, datasetId: futureDataset.id, category: 'errored-word', correctStreak: 0 },
    { id: `maya::${testReviewWord.id}`, childId: 'maya', wordId: testReviewWord.id, datasetId: currentDataset.id, category: 'recent-review', correctStreak: 1 },
  ], random: () => 0.25 })
  assert.ok(selection.words.every((word) => word.id !== acquisitionWord.id && word.id !== testReviewWord.id))
  assert.ok(!selection.erroredWordIds.includes(acquisitionWord.id))
  assert.ok(!selection.recentReviewWordIds.includes(testReviewWord.id))
})

test('a Test Review dataset becomes Recent Review only after a valid replacement moves it to Mastered', () => {
  const duringTestReview = buildWarmupSelection({ grade: 'Grade 2', datasets: importedDatasets, results: [], childId: 'maya', today: new Date(2026, 8, 23), random: () => 0.25 })
  assert.ok(duringTestReview.words.every((word) => word.datasetId !== currentDataset.id))

  const afterTestReview = buildWarmupSelection({ grade: 'Grade 2', datasets: [...importedDatasets, replacementDataset], results: [], childId: 'maya', today: new Date(2026, 8, 28), random: () => 0.25 })
  assert.ok(afterTestReview.words.some((word) => word.datasetId === currentDataset.id))
  assert.ok(afterTestReview.recentReviewWordIds.some((id) => currentDataset.words.some((word) => word.id === id)))
})

test('newly Mastered datasets replace stale active-lifecycle categories with Recent Review', () => {
  const word = currentDataset.words[0]
  const selection = buildWarmupSelection({ grade: 'Grade 2', datasets: [...importedDatasets, replacementDataset], results: [], childId: 'maya', today: new Date(2026, 8, 28), childWordStates: [
    { id: `maya::${word.id}`, childId: 'maya', wordId: word.id, datasetId: currentDataset.id, category: 'errored-word', correctStreak: 0, lastReviewedAt: '2026-09-23T12:00:00.000Z', lastIncorrectAt: '2026-09-23T12:00:00.000Z' },
  ], random: () => 0.25 })
  assert.ok(selection.words.some((candidate) => candidate.id === word.id))
  assert.ok(selection.recentReviewWordIds.includes(word.id))
  assert.ok(!selection.erroredWordIds.includes(word.id))
})

test('a delayed valid replacement starts Recent Review when the prior Test Review becomes Mastered', () => {
  const lifecycleDate = new Date(2026, 9, 12)
  const datasets = [...importedDatasets, delayedReplacementDataset]
  const active = getActiveLifecycleDatasets(datasets, lifecycleDate)
  assert.equal(active.acquisition?.id, delayedReplacementDataset.id)
  assert.equal(active.testReview?.id, futureDataset.id)

  const states = deriveChildWordStates({ grade: 'Grade 2', datasets, results: [], childId: 'maya', today: lifecycleDate })
  const newlyMasteredIds = new Set(currentDataset.words.map((word) => word.id))
  const newlyMasteredStates = states.filter((state) => newlyMasteredIds.has(state.wordId))
  assert.equal(newlyMasteredStates.length, currentDataset.words.length)
  assert.ok(newlyMasteredStates.every((state) => state.category === 'recent-review'))
})

test('adaptive warmup promotes Recent Review after two correct responses', () => {
  const word = priorDataset.words[0]
  const selection = buildWarmupSelection({ grade: 'Grade 2', datasets: importedDatasets, results: [result({ id: 'recent-correct-1', datasetId: word.datasetId, datasetDateRange: priorDataset.dateRange, wordId: word.id, correct: true, completedAt: '2026-09-21T12:00:00.000Z' }), result({ id: 'recent-correct-2', datasetId: word.datasetId, datasetDateRange: priorDataset.dateRange, wordId: word.id, correct: true, completedAt: '2026-09-22T12:00:00.000Z' })], childId: 'maya', today: new Date(2026, 8, 23), random: () => 0.25 })
  assert.ok(!selection.recentReviewWordIds.includes(word.id))
})

function answerPrompt(flow: ReturnType<typeof startAcquisitionFlow>, dataset: typeof currentDataset, correct = true, random: () => number = () => 0) {
  return answerAcquisitionPrompt(revealAcquisitionPrompt(flow), dataset, 'Grade 2', correct, random)
}

function enterExpandedTrials(dataset: typeof currentDataset, random: () => number = () => 0) {
  let flow = startAcquisitionFlow(dataset, 'Grade 2', random)
  for (let index = 0; index < 4; index += 1) flow = answerPrompt(flow, dataset, true, random)
  return flow
}

test('Acquisition uses the approved Familiar DT pool and Introduction sequence', () => {
  assert.deepEqual(FAMILIAR_DT_WORDS.map((word) => word.text), ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '大', '小', '上', '下', '人', '水'])
  const config = acquisitionTimerConfigFor('Grade 2')
  assert.equal(config.familiarDtSeconds, 5)
  assert.equal(config.introductionShowCopySeconds, 10)
  assert.equal(config.introductionHiddenTargetSeconds, 10)
  assert.equal(config.correctionHiddenSeconds, 10)

  const dataset = { ...currentDataset, words: currentDataset.words.slice(0, 2) }
  let flow = startAcquisitionFlow(dataset, 'Grade 2', () => 0)
  assert.equal(flow.phase, 'introduction')
  assert.equal(flow.prompt?.kind, 'familiar-dt')
  assert.equal(flow.prompt?.timerSeconds, 5)
  const firstDt = flow.prompt?.word.id
  flow = answerPrompt(flow, dataset)
  assert.equal(flow.prompt?.kind, 'familiar-dt')
  assert.notEqual(flow.prompt?.word.id, firstDt)
  flow = answerPrompt(flow, dataset)
  assert.equal(flow.prompt?.kind, 'show-copy')
  assert.equal(flow.prompt?.word.id, dataset.words[0].id)
  assert.equal(flow.prompt?.timerSeconds, 10)
  flow = answerPrompt(flow, dataset, false)
  assert.equal(flow.prompt?.kind, 'target')
  assert.equal(flow.prompt?.timerSeconds, 10)
  flow = answerPrompt(flow, dataset, true)
  assert.equal(flow.phase, 'expanded-trials')
  assert.equal(flow.step, 0)
})

test('Expanded Trials use the approved 10-position sequence and four target timers', () => {
  const dataset = { ...currentDataset, words: currentDataset.words.slice(0, 2) }
  let flow = enterExpandedTrials(dataset)
  const expectedKinds = ['target', 'familiar-dt', 'target', 'familiar-dt', 'familiar-dt', 'target', 'familiar-dt', 'familiar-dt', 'familiar-dt', 'target']
  const targetTimers: number[] = []
  for (const expectedKind of expectedKinds) {
    assert.equal(flow.prompt?.kind, expectedKind)
    if (flow.prompt?.kind === 'target') targetTimers.push(flow.prompt.timerSeconds)
    flow = answerPrompt(flow, dataset)
  }
  assert.deepEqual(targetTimers, [10, 9, 8, 7])
  assert.equal(flow.targetIndex, 1)
  assert.equal(flow.phase, 'introduction')
  assert.deepEqual(flow.earnedDtPool.map((word) => word.id), [dataset.words[0].id])
})

test('DT positions use Familiar DTs until an Earned DT exists, then honor the 50/50 choice', () => {
  const dataset = { ...currentDataset, words: currentDataset.words.slice(0, 2) }
  let flow = enterExpandedTrials(dataset)
  flow = answerPrompt(flow, dataset, true, () => 0.75)
  assert.equal(flow.step, 1)
  assert.equal(flow.prompt?.kind, 'familiar-dt')

  while (flow.targetIndex === 0) flow = answerPrompt(flow, dataset)
  while (flow.phase === 'introduction') flow = answerPrompt(flow, dataset)
  flow = answerPrompt(flow, dataset, true, () => 0.75)
  assert.equal(flow.step, 1)
  assert.equal(flow.prompt?.kind, 'earned-dt')
  assert.equal(flow.prompt?.word.id, dataset.words[0].id)
  assert.equal(flow.prompt?.timerSeconds, 5)
})

test('Familiar DT shuffle bags exhaust the approved pool before reuse and avoid consecutive repeats', () => {
  const dataset = { ...currentDataset, words: currentDataset.words.slice(0, 3) }
  let flow = startAcquisitionFlow(dataset, 'Grade 2', () => 0)
  const presented: string[] = []
  while (!flow.complete && flow.targetIndex < 2) {
    if (flow.prompt?.kind === 'familiar-dt') presented.push(flow.prompt.word.id)
    flow = answerPrompt(flow, dataset)
  }
  assert.equal(new Set(presented.slice(0, FAMILIAR_DT_WORDS.length)).size, FAMILIAR_DT_WORDS.length)
  assert.ok(presented.every((wordId, index) => index === 0 || wordId !== presented[index - 1]))
})

test('Correction uses three copies, hidden target, new Familiar DT, and final hidden target', () => {
  const dataset = { ...currentDataset, words: currentDataset.words.slice(0, 2) }
  let flow = startAcquisitionFlow(dataset, 'Grade 2', () => 0)
  for (let index = 0; index < 3; index += 1) flow = answerPrompt(flow, dataset)
  flow = answerPrompt(flow, dataset, false)
  assert.equal(flow.phase, 'correction')
  for (let index = 0; index < 3; index += 1) {
    assert.equal(flow.prompt?.kind, 'show-copy')
    assert.equal(flow.prompt?.timerSeconds, 10)
    flow = answerPrompt(flow, dataset, false)
  }
  assert.equal(flow.prompt?.kind, 'target')
  assert.equal(flow.prompt?.timerSeconds, 10)
  flow = answerPrompt(flow, dataset, true)
  assert.equal(flow.prompt?.kind, 'familiar-dt')
  flow = answerPrompt(flow, dataset, false)
  assert.equal(flow.prompt?.kind, 'target')
  assert.equal(flow.prompt?.timerSeconds, 10)
  flow = answerPrompt(flow, dataset, true)
  assert.equal(flow.phase, 'expanded-trials')
  assert.equal(flow.step, 0)
  assert.equal(flow.prompt?.timerSeconds, 10)
})

test('three consecutive hidden-target errors restart the affected word from Introduction', () => {
  const dataset = { ...currentDataset, words: currentDataset.words.slice(0, 2) }
  let flow = startAcquisitionFlow(dataset, 'Grade 2', () => 0)
  for (let index = 0; index < 3; index += 1) flow = answerPrompt(flow, dataset)
  flow = answerPrompt(flow, dataset, false)
  for (let index = 0; index < 3; index += 1) flow = answerPrompt(flow, dataset)
  flow = answerPrompt(flow, dataset, false)
  flow = answerPrompt(flow, dataset)
  flow = answerPrompt(flow, dataset, false)
  assert.equal(flow.phase, 'introduction')
  assert.equal(flow.step, 0)
  assert.equal(flow.currentTarget?.id, dataset.words[0].id)
})

test('Earned DT checks are recorded separately and resume the interrupted target at the next exact step', () => {
  const dataset = { ...currentDataset, words: currentDataset.words.slice(0, 2) }
  let flow = enterExpandedTrials(dataset)
  while (flow.targetIndex === 0) flow = answerPrompt(flow, dataset)
  while (flow.phase === 'introduction') flow = answerPrompt(flow, dataset)
  flow = answerPrompt(flow, dataset, true, () => 0.75)
  assert.equal(flow.prompt?.kind, 'earned-dt')
  assert.equal(shouldRecordAcquisitionAnswer(flow.prompt!), true)
  assert.equal(flow.prompt?.countsTowardWeeklyScore, true)
  flow = answerPrompt(flow, dataset, true)
  assert.equal(flow.currentTarget?.id, dataset.words[1].id)
  assert.equal(flow.phase, 'expanded-trials')
  assert.equal(flow.step, 2)
  assert.equal(flow.prompt?.kind, 'target')
})

test('incorrect Earned DT checks complete Correction, return to the pool, and resume interrupted work', () => {
  const dataset = { ...currentDataset, words: currentDataset.words.slice(0, 2) }
  let flow = enterExpandedTrials(dataset)
  while (flow.targetIndex === 0) flow = answerPrompt(flow, dataset)
  while (flow.phase === 'introduction') flow = answerPrompt(flow, dataset)
  flow = answerPrompt(flow, dataset, true, () => 0.75)
  const earnedWordId = flow.prompt?.word.id
  flow = answerPrompt(flow, dataset, false)
  assert.equal(flow.phase, 'correction')
  assert.equal(flow.currentTarget?.id, earnedWordId)
  for (let index = 0; index < 3; index += 1) flow = answerPrompt(flow, dataset)
  flow = answerPrompt(flow, dataset, true)
  flow = answerPrompt(flow, dataset)
  flow = answerPrompt(flow, dataset, true)
  assert.ok(flow.earnedDtPool.some((word) => word.id === earnedWordId))
  assert.equal(flow.currentTarget?.id, dataset.words[1].id)
  assert.equal(flow.phase, 'expanded-trials')
  assert.equal(flow.step, 2)
})

test('three Earned DT errors remove earned status and restart that word from Introduction', () => {
  const dataset = { ...currentDataset, words: currentDataset.words.slice(0, 2) }
  let flow = enterExpandedTrials(dataset)
  while (flow.targetIndex === 0) flow = answerPrompt(flow, dataset)
  while (flow.phase === 'introduction') flow = answerPrompt(flow, dataset)
  flow = answerPrompt(flow, dataset, true, () => 0.75)
  const earnedWordId = flow.prompt?.word.id
  flow = answerPrompt(flow, dataset, false)
  for (let index = 0; index < 3; index += 1) flow = answerPrompt(flow, dataset)
  flow = answerPrompt(flow, dataset, false)
  flow = answerPrompt(flow, dataset)
  flow = answerPrompt(flow, dataset, false)
  assert.equal(flow.phase, 'introduction')
  assert.equal(flow.step, 0)
  assert.equal(flow.currentTarget?.id, earnedWordId)
  assert.ok(!flow.earnedDtPool.some((word) => word.id === earnedWordId))
  assert.ok(flow.resumePosition)
})

test('DT responses are recorded while show-copy responses are discarded', () => {
  assert.equal(shouldRecordAcquisitionAnswer({ kind: 'familiar-dt' }), true)
  assert.equal(shouldRecordAcquisitionAnswer({ kind: 'earned-dt' }), true)
  assert.equal(shouldRecordAcquisitionAnswer({ kind: 'show-copy' }), false)
})

test('Done for today includes Earned-DT trials in the official score and excludes Familiar-DT responses', () => {
  const warmup = { words: [], randomRotationWordIds: [], recentReviewWordIds: [], erroredWordIds: [], rotationCycleId: 1 }
  const started = createPracticeSessionForTarget({ id: 'trial-score-session', childId: 'maya', grade: 'Grade 2', target: { dataset: currentDataset, phase: 'acquisition' }, warmup, startedAt: '2026-09-18T12:00:00.000Z', random: () => 0 })
  const answers = [
    { word: currentDataset.words[0], correct: false, revealMethod: 'timer' as const, countsTowardWeeklyScore: true },
    { word: currentDataset.words[0], correct: true, revealMethod: 'timer' as const, countsTowardWeeklyScore: true },
    { word: FAMILIAR_DT_WORDS[0], correct: true, revealMethod: 'timer' as const, countsTowardWeeklyScore: false, dtPoolType: 'familiar' as const },
    { word: currentDataset.words[0], correct: true, revealMethod: 'timer' as const, acquisitionKind: 'earned-dt' as const, countsTowardWeeklyScore: true, dtPoolType: 'earned' as const },
    { word: currentDataset.words[1], correct: true, revealMethod: 'timer' as const, countsTowardWeeklyScore: true },
  ]
  const finished: PracticeSession = { ...started, segment: 'primary', stage: 'dictation', primaryAnswers: answers }
  const committed = commitPartialSession(initialState(), finished, today)
  assert.equal(committed.scores.length, 1)
  assert.equal(committed.scores[0].phase, 'acquisition')
  assert.equal(committed.scores[0].wordCount, 4)
  assert.equal(committed.scores[0].correct, 3)
  assert.equal(committed.scores[0].percent, 75)
})

test('reviewed DTs and the exact next Acquisition position persist idempotently through reload', () => {
  const warmup = { words: [], randomRotationWordIds: [], recentReviewWordIds: [], erroredWordIds: [], rotationCycleId: 1 }
  const started = createPracticeSessionForTarget({ id: 'checkpoint-session', childId: 'maya', grade: 'Grade 2', target: { dataset: currentDataset, phase: 'acquisition' }, warmup, startedAt: '2026-09-18T12:00:00.000Z', random: () => 0 })
  const prompt = started.acquisition!.prompt!
  const nextFlow = answerPrompt(started.acquisition!, currentDataset, true, () => 0)
  const response = { word: prompt.word, correct: true, revealMethod: 'skip_timer' as const, acquisitionKind: prompt.kind, promptId: prompt.id, countsTowardWeeklyScore: false, dtPoolType: 'familiar' as const }
  const nextSession = { ...started, segment: 'primary' as const, stage: 'dictation' as const, acquisition: nextFlow, primaryAnswers: [response] }
  const checkpointed = checkpointAcquisitionSession(initialState(), nextSession, response, new Date('2026-09-18T12:01:00.000Z'))
  const idempotent = checkpointAcquisitionSession(checkpointed, nextSession, response, new Date('2026-09-18T12:01:01.000Z'))
  assert.equal(idempotent.distractorTargetObservations.length, 1)
  assert.equal(idempotent.distractorTargetObservations[0].revealMethod, 'skip_timer')
  assert.equal(acquisitionProgressFor(idempotent, 'maya', currentDataset.id)?.flow.prompt?.id, nextFlow.prompt?.id)
  const reloaded = loadState(JSON.stringify(idempotent))
  assert.equal(acquisitionProgressFor(reloaded, 'maya', currentDataset.id)?.flow.prompt?.id, nextFlow.prompt?.id)
  assert.equal(reloaded.distractorTargetObservations.length, 1)
})

test('legacy Established-DT local state hydrates and resumes with Familiar-DT fields without losing position', () => {
  const started = startAcquisitionFlow(currentDataset, 'Grade 2', () => 0)
  const legacyTarget = (word: typeof FAMILIAR_DT_WORDS[number]) => ({
    ...word,
    id: word.id.replace('familiar-dt-', 'established-dt-'),
    datasetId: '__established-dt__',
  })
  const { familiarDtBag, strategyId: _strategyId, strategyVersion: _strategyVersion, ...legacyFields } = started
  const legacyFlow = {
    ...legacyFields,
    establishedDtBag: familiarDtBag.map(legacyTarget),
    lastDtWordId: started.lastDtWordId?.replace('familiar-dt-', 'established-dt-'),
    prompt: started.prompt ? {
      ...started.prompt,
      kind: 'established-dt',
      dtPoolType: 'established',
      word: legacyTarget(started.prompt.word),
    } : null,
  } as unknown as AcquisitionFlow

  const legacyState: AppState = {
    ...initialState(),
    acquisitionProgressions: [{ id: `maya::${currentDataset.id}::tier-1-writing`, childId: 'maya', datasetId: currentDataset.id, grade: 'Grade 2', flow: legacyFlow, updatedAt: '2026-09-18T12:00:00.000Z' }],
    distractorTargetObservations: [{ id: 'legacy-local-dt', childId: 'maya', sessionId: 'legacy-session', datasetId: currentDataset.id, wordId: 'established-dt-1', text: '一', poolType: 'established' as never, correct: true, revealMethod: 'timer', reviewedAt: '2026-09-18T12:00:00.000Z' }],
  }
  const reloaded = loadState(JSON.stringify(legacyState))
  const resumed = resumeAcquisitionFlow(acquisitionProgressFor(reloaded, 'maya', currentDataset.id)?.flow, currentDataset, 'Grade 2', () => 0)
  assert.equal(reloaded.distractorTargetObservations[0].poolType, 'familiar')
  assert.equal(resumed.strategyId, 'grade2-acquisition-v3')
  assert.equal(resumed.strategyVersion, 3)
  assert.equal(resumed.targetIndex, started.targetIndex)
  assert.equal(resumed.phase, started.phase)
  assert.equal(resumed.step, started.step)
  assert.equal(resumed.prompt?.kind, 'familiar-dt')
  assert.equal(resumed.prompt?.dtPoolType, 'familiar')
  assert.equal(resumed.prompt?.word.datasetId, '__familiar-dt__')
  assert.equal('establishedDtBag' in resumed, false)
})

test('a completed teaching progression reopens as ongoing 50/50 DT practice', () => {
  const completed = { ...startAcquisitionFlow(currentDataset, 'Grade 2', () => 0), currentTarget: null, earnedDtPool: currentDataset.words.slice(0, 2), prompt: null, complete: true }
  const resumed = resumeAcquisitionFlow(completed, currentDataset, 'Grade 2', () => 0.75)
  assert.equal(resumed.mode, 'dt-practice')
  assert.equal(resumed.complete, false)
  assert.equal(resumed.prompt?.kind, 'earned-dt')
  assert.ok(currentDataset.words.slice(0, 2).some((word) => word.id === resumed.prompt?.word.id))
})

test('skipping the entire Test Review saves Warmup only and records a skipped outcome', () => {
  const warmup = { words: priorDataset.words.slice(0, 2), randomRotationWordIds: priorDataset.words.slice(0, 2).map((word) => word.id), recentReviewWordIds: [], erroredWordIds: [], rotationCycleId: 1 }
  const started = createPracticeSessionForTarget({ id: 'skip-review', childId: 'maya', grade: 'Grade 2', target: { dataset: currentDataset, phase: 'test-review' }, warmup, startedAt: '2026-09-18T12:00:00.000Z', random: () => 0 })
  const skipped = { ...started, warmupAnswers: warmup.words.map((word) => ({ word, correct: true, revealMethod: 'timer' as const })), primaryAnswers: [{ word: currentDataset.words[0], correct: false, revealMethod: 'timer' as const }] }
  const committed = commitSkippedTestReview(initialState(), skipped, today)
  assert.equal(committed.results.filter((result) => result.phase === 'warmup').length, 2)
  assert.equal(committed.results.filter((result) => result.phase === 'test-review').length, 0)
  assert.equal(committed.scores.length, 0)
  assert.equal(committed.completedSessions[0].outcome, 'skipped')
})

function completeSession(state: AppState): PracticeSession {
  return {
    id: createSessionId(), childId: 'maya', grade: 'Grade 2', primaryDatasetId: currentDataset.id, primaryPhase: 'acquisition', segment: 'primary', stage: 'review',
    queue: currentDataset.words, warmupQueue: priorDataset.words, primaryQueue: currentDataset.words, index: currentDataset.words.length - 1, startedAt: '2026-09-18T12:00:00.000Z',
    warmupAnswers: priorDataset.words.map((word) => ({ word, correct: true, revealMethod: 'timer' })),
    primaryAnswers: currentDataset.words.map((word, index) => ({ word, correct: index !== 1, revealMethod: 'timer' })),
  }
}

test('complete sessions create a primary score once and preserve adaptive warmup state', () => {
  const state = initialState()
  const session = completeSession(state)
  const committed = commitCompletedSession(state, session, today)
  assert.equal(committed.results.length, priorDataset.words.length + currentDataset.words.length)
  assert.equal(committed.scores.length, 1)
  assert.equal(committed.scores.find((score) => score.datasetId === currentDataset.id)?.percent, 80)
  assert.ok(committed.results.every((item) => item.revealMethod === 'timer'))
  assert.ok(committed.results.filter((item) => item.datasetId === priorDataset.id).every((item) => !item.completeSourceDatasetReviewed))
  const duplicateCommit = commitCompletedSession(committed, session, today)
  assert.equal(duplicateCommit.scores.length, 1)
  assert.equal(duplicateCommit.results.length, committed.results.length)
})

test('completing Grade 2 practice preserves other-grade, orphaned, and other-child adaptive states', () => {
  const grade5State: ChildWordState = { id: `maya::${grade5Dataset.words[0].id}`, childId: 'maya', wordId: grade5Dataset.words[0].id, datasetId: grade5Dataset.id, category: 'recent-review', correctStreak: 1 }
  const historicalDataset: Dataset = { ...currentDataset, id: 'historical-grade-2-dataset', schoolYear: '2025–2026', words: currentDataset.words.map((word, index) => ({ ...word, id: `historical-grade-2-word-${index + 1}`, datasetId: 'historical-grade-2-dataset' })) }
  const historicalState: ChildWordState = { id: `maya::${historicalDataset.words[0].id}`, childId: 'maya', wordId: historicalDataset.words[0].id, datasetId: historicalDataset.id, category: 'random-rotation', correctStreak: 0 }
  const orphanedState: ChildWordState = { id: 'maya::orphaned-word', childId: 'maya', wordId: 'orphaned-word', datasetId: 'temporarily-unloaded-dataset', category: 'random-rotation', correctStreak: 0 }
  const otherChildState: ChildWordState = { id: `eli::${currentDataset.words[0].id}`, childId: 'eli', wordId: currentDataset.words[0].id, datasetId: currentDataset.id, category: 'errored-word', correctStreak: 0 }
  const state: AppState = { ...initialState(), datasets: [...importedDatasets, grade5Dataset, historicalDataset], childWordStates: [grade5State, historicalState, orphanedState, otherChildState] }
  const committed = commitCompletedSession(state, completeSession(state), today)

  assert.deepEqual(committed.childWordStates.find((item) => item.id === grade5State.id), grade5State)
  assert.deepEqual(committed.childWordStates.find((item) => item.id === historicalState.id), historicalState)
  assert.deepEqual(committed.childWordStates.find((item) => item.id === orphanedState.id), orphanedState)
  assert.deepEqual(committed.childWordStates.find((item) => item.id === otherChildState.id), otherChildState)
  assert.ok(committed.childWordStates.some((item) => item.childId === 'maya' && item.datasetId === currentDataset.id))
  const activeGrade2States = deriveChildWordStates({ grade: 'Grade 2', datasets: committed.datasets, results: committed.results, childId: 'maya', existingStates: committed.childWordStates, today })
  assert.ok(!activeGrade2States.some((item) => item.id === orphanedState.id))
})

test('warmup-only sessions preserve mastery results without creating a primary score', () => {
  const state = initialState()
  const session: PracticeSession = {
    id: createSessionId(), childId: 'maya', grade: 'Grade 2', primaryDatasetId: '', primaryPhase: 'acquisition', segment: 'warmup', stage: 'review', warmupOnly: true,
    queue: priorDataset.words, warmupQueue: priorDataset.words, primaryQueue: [], index: priorDataset.words.length - 1, startedAt: '2026-09-22T12:00:00.000Z',
    warmupAnswers: priorDataset.words.map((word) => ({ word, correct: true, revealMethod: 'timer' })), primaryAnswers: [],
  }
  const committed = commitCompletedSession(state, session, new Date(2026, 8, 22))
  assert.equal(committed.results.length, priorDataset.words.length)
  assert.equal(committed.scores.length, 0)
  assert.equal(committed.completedSessions.length, 0)
  assert.equal(commitCompletedSession(committed, session, new Date(2026, 8, 22)), committed)
})

test('partial sessions create no results or graph points', () => {
  const state = initialState()
  const session = completeSession(state)
  session.primaryAnswers = session.primaryAnswers.slice(0, -1)
  const resultState = commitCompletedSession(state, session, today)
  assert.equal(resultState.results.length, 0)
  assert.equal(resultState.scores.length, 0)
})

test('repeated target answers produce one score per dataset word', () => {
  const state = initialState()
  const session = completeSession(state)
  session.primaryPhase = 'test-review'
  session.primaryAnswers = [
    { word: currentDataset.words[0], correct: false, revealMethod: 'timer' },
    { word: currentDataset.words[0], correct: true, revealMethod: 'timer' },
    ...currentDataset.words.slice(1).map((word) => ({ word, correct: true, revealMethod: 'timer' as const })),
  ]
  const committed = commitCompletedSession(state, session, today)
  assert.equal(committed.scores.length, 1)
  assert.equal(committed.scores[0].wordCount, currentDataset.words.length)
  assert.equal(committed.scores[0].percent, 100)
})

test('legacy data is preserved without inventing dataset dates', () => {
  const state = createInitialState([], JSON.stringify([{ childId: 'maya', weeklySetId: 'current', termId: 'old-word', sessionId: 'old-session', completedAt: '2026-09-10T12:00:00.000Z', correct: true }]))
  assert.equal(state.legacyRecords.length, 1)
  assert.equal(state.legacyRecords[0].note, 'legacy-date-range-unknown')
})

test('malformed state falls back safely without inventing a dataset', () => {
  const state = loadState('{not valid json', 'not valid json')
  assert.equal(state.version, 2)
  assert.equal(state.datasets.length, 0)
  assert.equal(state.legacyRecords.length, 0)
})

test('migration removes old placeholder datasets without replacing valid imported data', () => {
  const olderState = initialState()
  olderState.datasets = [importedDatasets[1], {
    ...importedDatasets[0],
    id: '2026-09-21__2026-09-25',
    words: [{ ...importedDatasets[0].words[0], id: '2026-09-21__2026-09-25-1', datasetId: '2026-09-21__2026-09-25', text: 'placeholder' }],
  }]
  olderState.legacyRecords = [{
    id: 'legacy-preserved', childId: 'maya', legacySet: 'current', termId: 'old-word', sessionId: 'old-session',
    completedAt: '2026-09-10T12:00:00.000Z', correct: true, revealMethod: 'timer', note: 'legacy-date-range-unknown',
  }]
  const migrated = loadState(JSON.stringify(olderState))
  assert.equal(migrated.datasets.length, 1)
  assert.equal(migrated.legacyRecords.length, 1)
  assert.equal(migrated.datasets[0].id, importedDatasets[1].id)
  assert.ok(!migrated.datasets.some((dataset) => dataset.words.some((word) => word.text === 'placeholder')))
})

test('local date keys use the local calendar rather than UTC slicing', () => {
  assert.equal(localDateKey(new Date(2026, 8, 18, 23, 59)), '2026-09-18')
})

test('session IDs are unique', () => {
  const ids = new Set(Array.from({ length: 20 }, () => createSessionId()))
  assert.equal(ids.size, 20)
})

test('latest score prefers the most recently recorded score on the same date', () => {
  const scores = [
    { id: 'older', childId: 'maya', datasetId: currentDataset.id, datasetDateRange: currentDataset.dateRange, phase: 'acquisition' as const, sessionId: 'session-older', sessionDate: '2026-09-18', percent: 20, correct: 1, wordCount: 5 },
    { id: 'newer', childId: 'maya', datasetId: currentDataset.id, datasetDateRange: currentDataset.dateRange, phase: 'acquisition' as const, sessionId: 'session-newer', sessionDate: '2026-09-18', percent: 80, correct: 4, wordCount: 5 },
  ]
  assert.equal(latestScore(scores, 'maya', currentDataset.id)?.id, 'newer')
})

test('dataset filtering respects grade and school year without relabeling history', () => {
  const gradeFive = importWeeklyDatasets({ presentationId: grade5DeckProfile.sourceDeckId, slides: [{ objectId: 'g5', text: 'Week 6 (9/14-18)\nMandarin\nTier 1: 甲、乙、丙' }] }, [], grade5DeckProfile).datasets[0]
  assert.deepEqual(filterDatasetsForChild([...importedDatasets, gradeFive], 'Grade 5', '2026–27').map((dataset) => dataset.id), [gradeFive.id])
  assert.equal(currentDataset.grade, 'Grade 2')
})

test('grade promotion is suggested after August 1 in the configured timezone', () => {
  assert.equal(shouldSuggestGradePromotion({ grade: 'Grade 4', gradeEffectiveDate: '2025-08-01' }, new Date('2026-08-01T08:00:00.000Z'), 'America/Los_Angeles'), true)
  assert.equal(shouldSuggestGradePromotion({ grade: 'Grade 4', gradeEffectiveDate: '2026-08-01' }, new Date('2026-08-02T08:00:00.000Z'), 'America/Los_Angeles'), false)
})
