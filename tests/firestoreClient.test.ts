import assert from 'node:assert/strict'
import test from 'node:test'
import { cloudAdaptiveStateForSave, cloudDataToAppState, type CloudAttempt, type CloudSession } from '../src/firestoreClient.ts'
import { grade2DeckProfile, grade5DeckProfile, importWeeklyDatasets } from '../src/slidesImporter.ts'

const dataset = importWeeklyDatasets({
  presentationId: grade2DeckProfile.sourceDeckId,
  slides: [{ objectId: 'cloud-slide', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' }],
}, [], grade2DeckProfile).datasets[0]
const grade5Dataset = importWeeklyDatasets({
  presentationId: grade5DeckProfile.sourceDeckId,
  slides: [{ objectId: 'grade-five-cloud-slide', text: 'Week 6 (9/21-25)\nMandarin\nTier 1: 需要、部分、重要' }],
}, [], grade5DeckProfile).datasets[0]

const grade2State = { id: `maya::${dataset.words[0].id}`, childId: 'maya', wordId: dataset.words[0].id, datasetId: dataset.id, category: 'recent-review' as const, correctStreak: 2 }
const grade5State = { id: `maya::${grade5Dataset.words[0].id}`, childId: 'maya', wordId: grade5Dataset.words[0].id, datasetId: grade5Dataset.id, category: 'recent-review' as const, correctStreak: 1 }

test('cloud hydration accepts only canonical datasets and restores adaptive state', () => {
  const placeholder = { ...dataset, id: '2026-09-21__2026-09-25', words: [{ ...dataset.words[0], id: '2026-09-21__2026-09-25-1', datasetId: '2026-09-21__2026-09-25' }] }
  const session: CloudSession = { id: 'cloud-session', childId: 'maya', familyId: 'family-maya', sessionDate: '2026-09-23T12:00:00.000Z', localDate: '2026-09-23', startedAt: '2026-09-23T12:00:00.000Z', primaryPhase: 'acquisition', datasetId: dataset.id, status: 'completed', warmupStatus: 'completed', applicationVersion: 'test' }
  const attempt: CloudAttempt = { id: 'attempt-1', sessionId: session.id, wordId: dataset.words[0].id, sourceDatasetId: dataset.id, phase: 'warmup', correct: true, reviewedAt: '2026-09-23T12:01:00.000Z', completionStatus: 'complete' }
  const state = cloudDataToAppState([placeholder, dataset, dataset], [], [session], [attempt], 'maya', 'Grade 2', {
    childId: 'maya', childWordStates: [{ id: `maya::${dataset.words[0].id}`, childId: 'maya', wordId: dataset.words[0].id, datasetId: dataset.id, category: 'recent-review', correctStreak: 2 }], monthlyRotationScores: [], rotationCycleId: 4, updatedAt: '2026-09-23T12:02:00.000Z',
  })
  assert.deepEqual(state.datasets.map((item) => item.id), [dataset.id])
  assert.equal(state.results.length, 1)
  assert.equal(state.childWordStates[0].category, 'recent-review')
  assert.equal(state.rotationCycles.maya, 4)
})

test('cloud hydration drops attempts that point outside canonical datasets or sessions', () => {
  const session: CloudSession = { id: 'cloud-session', childId: 'maya', familyId: 'family-maya', sessionDate: '2026-09-23T12:00:00.000Z', localDate: '2026-09-23', startedAt: '2026-09-23T12:00:00.000Z', primaryPhase: 'test-review', datasetId: dataset.id, status: 'completed', warmupStatus: 'completed', applicationVersion: 'test' }
  const valid: CloudAttempt = { id: 'valid', sessionId: session.id, wordId: dataset.words[0].id, sourceDatasetId: dataset.id, phase: 'test-review', correct: true, reviewedAt: '2026-09-23T12:01:00.000Z', completionStatus: 'complete' }
  const invalid: CloudAttempt = { ...valid, id: 'invalid', wordId: 'old-word', sourceDatasetId: '2026-09-21__2026-09-25' }
  const state = cloudDataToAppState([dataset], [], [session], [valid, invalid], 'maya', 'Grade 2')
  assert.deepEqual(state.results.map((result) => result.id), ['valid'])
})

test('mixed-grade cloud adaptive state survives Grade 2 hydration', () => {
  const state = cloudDataToAppState([dataset, grade5Dataset], [], [], [], 'maya', 'Grade 2', {
    childId: 'maya', childWordStates: [grade2State, grade5State], monthlyRotationScores: [], rotationCycleId: 3, updatedAt: '2026-09-26T12:00:00.000Z',
  })

  assert.ok(state.childWordStates.some((item) => item.id === grade2State.id))
  assert.deepEqual(state.childWordStates.find((item) => item.id === grade5State.id), grade5State)
})

test('one malformed cloud word state does not discard unrelated valid states', () => {
  const mismatchedWordAndDataset = { ...grade5State, id: 'maya::mismatched-state', wordId: dataset.words[0].id }
  const state = cloudDataToAppState([dataset, grade5Dataset], [], [], [], 'maya', 'Grade 2', {
    childId: 'maya', childWordStates: [grade2State, grade5State, mismatchedWordAndDataset], monthlyRotationScores: [], rotationCycleId: 1, updatedAt: '2026-09-26T12:00:00.000Z',
  })

  assert.ok(state.childWordStates.some((item) => item.id === grade2State.id))
  assert.ok(state.childWordStates.some((item) => item.id === grade5State.id))
  assert.ok(!state.childWordStates.some((item) => item.id === mismatchedWordAndDataset.id))
})

test('the next cloud save includes preserved adaptive states from other grades', () => {
  const hydrated = cloudDataToAppState([dataset, grade5Dataset], [], [], [], 'maya', 'Grade 2', {
    childId: 'maya', childWordStates: [grade2State, grade5State], monthlyRotationScores: [], rotationCycleId: 2, updatedAt: '2026-09-26T12:00:00.000Z',
  })
  const saveState = cloudAdaptiveStateForSave(hydrated, 'maya', '2026-09-26T12:05:00.000Z')

  assert.ok(saveState.childWordStates.some((item) => item.id === grade2State.id))
  assert.ok(saveState.childWordStates.some((item) => item.id === grade5State.id))
})

test('cloud hydration preserves history data for a grade whose practice profile is not configured', () => {
  const state = cloudDataToAppState([grade5Dataset], [], [], [], 'older-child', 'Grade 5', {
    childId: 'older-child',
    childWordStates: [{ id: `older-child::${grade5Dataset.words[0].id}`, childId: 'older-child', wordId: grade5Dataset.words[0].id, datasetId: grade5Dataset.id, category: 'recent-review', correctStreak: 1 }],
    monthlyRotationScores: [],
    rotationCycleId: 1,
    updatedAt: '2026-09-26T12:00:00.000Z',
  })

  assert.deepEqual(state.datasets.map((item) => item.id), [grade5Dataset.id])
  assert.deepEqual(state.childWordStates, [{ id: `older-child::${grade5Dataset.words[0].id}`, childId: 'older-child', wordId: grade5Dataset.words[0].id, datasetId: grade5Dataset.id, category: 'recent-review', correctStreak: 1 }])
})
