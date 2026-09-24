import assert from 'node:assert/strict'
import test from 'node:test'
import { cloudDataToAppState, type CloudAttempt, type CloudSession } from '../src/firestoreClient.ts'
import { grade2DeckProfile, importWeeklyDatasets } from '../src/slidesImporter.ts'

const dataset = importWeeklyDatasets({
  presentationId: grade2DeckProfile.sourceDeckId,
  slides: [{ objectId: 'cloud-slide', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' }],
}, [], grade2DeckProfile).datasets[0]

test('cloud hydration accepts only canonical datasets and restores adaptive state', () => {
  const placeholder = { ...dataset, id: '2026-09-21__2026-09-25', words: [{ ...dataset.words[0], id: '2026-09-21__2026-09-25-1', datasetId: '2026-09-21__2026-09-25' }] }
  const session: CloudSession = { id: 'cloud-session', childId: 'maya', familyId: 'family-maya', sessionDate: '2026-09-23T12:00:00.000Z', localDate: '2026-09-23', startedAt: '2026-09-23T12:00:00.000Z', primaryPhase: 'acquisition', datasetId: dataset.id, status: 'completed', warmupStatus: 'completed', applicationVersion: 'test' }
  const attempt: CloudAttempt = { id: 'attempt-1', sessionId: session.id, wordId: dataset.words[0].id, sourceDatasetId: dataset.id, phase: 'warmup', correct: true, reviewedAt: '2026-09-23T12:01:00.000Z', completionStatus: 'complete' }
  const state = cloudDataToAppState([placeholder, dataset, dataset], [], [session], [attempt], 'maya', {
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
  const state = cloudDataToAppState([dataset], [], [session], [valid, invalid], 'maya')
  assert.deepEqual(state.results.map((result) => result.id), ['valid'])
})
