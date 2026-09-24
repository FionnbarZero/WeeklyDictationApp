import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { hydrateFromGoogleSlidesReadOnly, type ReadOnlyHydrationDependencies } from '../backend/readOnlyHydration.ts'
import { presentationLikeFromGoogleResponse } from '../backend/googleSlides.ts'
import { createInitialState } from '../src/domain.ts'
import { grade2DeckProfile, isCanonicalDataset } from '../src/slidesImporter.ts'

const sourcePath = (relativePath: string) => fileURLToPath(new URL(`../${relativePath}`, import.meta.url))

function dependencies(calls: string[], slides = [
  { objectId: 'valid-slide', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分、更' },
]) : ReadOnlyHydrationDependencies {
  return {
    googleAccessToken: async () => { calls.push('slides-auth'); return 'slides-token' },
    fetchGooglePresentation: async (deckId, token) => {
      calls.push('slides-read')
      assert.equal(deckId, grade2DeckProfile.sourceDeckId)
      assert.equal(token, 'slides-token')
      return presentationLikeFromGoogleResponse({
        presentationId: deckId,
        slides: slides.map(({ objectId, text }) => ({ objectId, pageElements: [{ shape: { text: { textElements: [{ textRun: { content: text } }] } } }] })),
      })
    },
  }
}

const config = {
  deckId: grade2DeckProfile.sourceDeckId,
  googleOAuth: { clientId: 'client', clientSecret: 'secret', refreshToken: 'refresh' },
}

test('trusted read-only Slides fetch hydrates canonical local state without global network access', async () => {
  const originalFetch = globalThis.fetch
  let unexpectedFetches = 0
  globalThis.fetch = (async () => { unexpectedFetches += 1; throw new Error('Only injected Slides dependencies may run in this test.') }) as typeof fetch
  try {
    const calls: string[] = []
    const state = createInitialState()
    state.results = [{ id: 'saved-result', childId: 'maya', datasetId: 'historical', datasetDateRange: 'historical', wordId: 'historical-word', grade: 'Grade 2', phase: 'warmup', sessionId: 'saved-session', sessionDate: '2026-09-20', completedAt: '2026-09-20T12:00:00.000Z', correct: true, revealMethod: 'timer', scored: true, completeSourceDatasetReviewed: false }]
    const hydrated = await hydrateFromGoogleSlidesReadOnly(state, config, dependencies(calls))
    assert.deepEqual(calls, ['slides-auth', 'slides-read'])
    assert.equal(unexpectedFetches, 0)
    assert.equal(hydrated.state.results[0].id, 'saved-result')
    assert.equal(hydrated.state.datasets.length, 1)
    assert.ok(hydrated.state.datasets.every(isCanonicalDataset))
    assert.ok(hydrated.state.datasets[0].words.every((word) => word.datasetId === hydrated.state.datasets[0].id))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('read-only Slides hydration skips malformed slides and stays idempotent', async () => {
  const slides = [
    { objectId: 'valid-slide', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分、更' },
    { objectId: 'malformed-slide', text: 'Week 9/28-10/2\nMandarin\nWriting ideas only' },
  ]
  const first = await hydrateFromGoogleSlidesReadOnly(createInitialState(), config, dependencies([], slides))
  const second = await hydrateFromGoogleSlidesReadOnly(first.state, config, dependencies([], slides))
  assert.equal(first.state.datasets.length, 1)
  assert.equal(first.batch.outcomes.find((outcome) => outcome.sourceSlideId === 'malformed-slide')?.status, 'error')
  assert.equal(second.state.datasets.length, 1)
  assert.equal(second.batch.outcomes.find((outcome) => outcome.sourceSlideId === 'valid-slide')?.status, 'duplicate')
  assert.deepEqual(second.state.datasets.map((dataset) => dataset.id), first.state.datasets.map((dataset) => dataset.id))
})

test('read-only Slides hydration has no Firestore dependency', () => {
  const adapterSource = readFileSync(sourcePath('backend/readOnlyHydration.ts'), 'utf8')
  const cliSource = readFileSync(sourcePath('scripts/hydrate-google-slides.ts'), 'utf8')
  assert.doesNotMatch(`${adapterSource}\n${cliSource}`, /backend\/firestore|\.\/firestore|FIRESTORE_|listDatasetIds|writeImportBatch/)
})
