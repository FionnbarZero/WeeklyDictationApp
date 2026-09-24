import assert from 'node:assert/strict'
import test from 'node:test'
import { createInitialState } from '../src/domain.ts'
import { hydrateLocalStateFromJson, parsePresentationJson } from '../src/localHydration.ts'
import { grade2DeckProfile } from '../src/slidesImporter.ts'

const payload = JSON.stringify({
  presentationId: grade2DeckProfile.sourceDeckId,
  slides: [{ objectId: 'trusted-slide', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分、更、方便、美好' }],
})

test('fresh local state stays empty until an explicit trusted import', () => {
  const fresh = createInitialState()
  assert.equal(fresh.datasets.length, 0)
  const hydrated = hydrateLocalStateFromJson(fresh, payload, grade2DeckProfile)
  assert.equal(hydrated.state.datasets.length, 1)
  assert.equal(hydrated.state.datasets[0].sourceDeckId, grade2DeckProfile.sourceDeckId)
})

test('trusted JSON payload hydrates through the canonical importer', () => {
  const hydrated = hydrateLocalStateFromJson(createInitialState(), payload, grade2DeckProfile)
  assert.equal(hydrated.batch.status, 'ok')
  assert.equal(hydrated.state.datasets.length, 1)
  assert.equal(hydrated.state.datasets[0].sourceSlideId, 'trusted-slide')
  assert.ok(hydrated.state.datasets[0].words.every((word) => word.datasetId === hydrated.state.datasets[0].id))
})

test('re-hydration classifies an existing canonical dataset as a duplicate', () => {
  const first = hydrateLocalStateFromJson(createInitialState(), payload, grade2DeckProfile)
  const second = hydrateLocalStateFromJson(first.state, payload, grade2DeckProfile)
  assert.equal(second.batch.outcomes[0].status, 'duplicate')
  assert.equal(second.state.datasets.length, 1)
})

test('trusted JSON parsing rejects malformed payloads before import', () => {
  assert.throws(() => parsePresentationJson('{not json'), /not valid JSON/i)
  assert.throws(() => parsePresentationJson(JSON.stringify({ slides: ['not a slide'] })), /valid PresentationLike/i)
})

test('a trusted payload with no valid slides leaves local state empty', () => {
  const hydrated = hydrateLocalStateFromJson(createInitialState(), JSON.stringify({ presentationId: grade2DeckProfile.sourceDeckId, slides: [{ objectId: 'bad', text: 'No weekly heading' }] }), grade2DeckProfile)
  assert.equal(hydrated.batch.status, 'error')
  assert.equal(hydrated.state.datasets.length, 0)
})
