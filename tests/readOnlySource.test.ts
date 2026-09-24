import assert from 'node:assert/strict'
import test from 'node:test'
import { presentationLikeFromGoogleResponse } from '../backend/googleSlides.ts'
import { createInitialState, hydrateLocalState } from '../src/domain.ts'
import { hydrateLocalStateFromReadOnlySource, type ReadOnlyPresentationSource } from '../src/localHydration.ts'
import { grade2DeckProfile } from '../src/slidesImporter.ts'

const trustedJson = JSON.stringify({
  presentationId: grade2DeckProfile.sourceDeckId,
  slides: [{ objectId: 'trusted-json-slide', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分、更' }],
})

test('trusted JSON and normalized read-only presentation sources share local hydration', () => {
  const jsonResult = hydrateLocalStateFromReadOnlySource(createInitialState(), trustedJson, grade2DeckProfile)
  const presentationResult = hydrateLocalStateFromReadOnlySource(createInitialState(), {
    presentationId: grade2DeckProfile.sourceDeckId,
    slides: [{ objectId: 'trusted-json-slide', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分、更' }],
  }, grade2DeckProfile)
  assert.equal(jsonResult.state.datasets[0].id, presentationResult.state.datasets[0].id)
  assert.deepEqual(jsonResult.state.datasets[0].words.map((word) => word.id), presentationResult.state.datasets[0].words.map((word) => word.id))
})

test('mocked Google Slides response is normalized before local hydration', () => {
  const source: ReadOnlyPresentationSource = presentationLikeFromGoogleResponse({
    presentationId: grade2DeckProfile.sourceDeckId,
    slides: [{ objectId: 'mocked-api-slide', pageElements: [{ shape: { text: { textElements: [{ textRun: { content: 'Week 9/14-9/18\nMandarin\nTier 1: 出生、但是、运动' } }] } } }] }],
  })
  const hydrated = hydrateLocalStateFromReadOnlySource(createInitialState(), source, grade2DeckProfile)
  assert.equal(hydrated.batch.status, 'ok')
  assert.equal(hydrated.state.datasets[0].sourceSlideId, 'mocked-api-slide')
  assert.ok(hydrated.state.datasets[0].words.every((word) => word.datasetId === hydrated.state.datasets[0].id))
})

test('read-only source hydration preserves valid data when the source also contains malformed input', () => {
  const source = {
    presentationId: grade2DeckProfile.sourceDeckId,
    slides: [
      { objectId: 'valid-source-slide', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' },
      { objectId: 'malformed-source-slide', text: 'Week 9/28-10/2\nMandarin\nWriting ideas only' },
    ],
  }
  const hydrated = hydrateLocalStateFromReadOnlySource(createInitialState(), source, grade2DeckProfile)
  assert.equal(hydrated.state.datasets.length, 1)
  assert.equal(hydrated.state.datasets[0].sourceSlideId, 'valid-source-slide')
  assert.equal(hydrated.batch.outcomes.find((outcome) => outcome.sourceSlideId === 'malformed-source-slide')?.status, 'error')
})

test('read-only source hydration keeps existing progress and performs no fetch', () => {
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = (async () => {
    fetchCalls += 1
    throw new Error('Read-only local hydration must not fetch.')
  }) as typeof fetch
  try {
    const state = createInitialState()
    state.results = [{ id: 'saved', childId: 'maya', datasetId: 'old-dataset', datasetDateRange: 'old', wordId: 'old-word', grade: 'Grade 2', phase: 'warmup', sessionId: 'saved-session', sessionDate: '2026-09-22', completedAt: '2026-09-22T12:00:00.000Z', correct: true, revealMethod: 'timer', scored: true, completeSourceDatasetReviewed: false }]
    const hydrated = hydrateLocalStateFromReadOnlySource(state, trustedJson, grade2DeckProfile)
    assert.equal(hydrated.state.results[0].id, 'saved')
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.equal(fetchCalls, 0)
})
