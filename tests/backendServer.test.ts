import assert from 'node:assert/strict'
import test from 'node:test'
import { authorized, importHttpStatus } from '../backend/server.ts'
import { grade2DeckProfile, importWeeklyDatasets } from '../src/slidesImporter.ts'

test('import server authorization fails closed when the token is absent or wrong', () => {
  const previous = process.env.IMPORT_RUN_TOKEN
  try {
    process.env.IMPORT_RUN_TOKEN = 'correct-token'
    assert.equal(authorized({ headers: { authorization: 'Bearer correct-token' } }), true)
    assert.equal(authorized({ headers: { authorization: 'Bearer wrong-token' } }), false)
    delete process.env.IMPORT_RUN_TOKEN
    assert.equal(authorized({ headers: { authorization: 'Bearer correct-token' } }), false)
  } finally {
    if (previous === undefined) delete process.env.IMPORT_RUN_TOKEN
    else process.env.IMPORT_RUN_TOKEN = previous
  }
})

test('an unchanged duplicate-only import is an acknowledged no-change run', () => {
  const presentation = { presentationId: grade2DeckProfile.sourceDeckId, slides: [{ objectId: 'existing', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' }] }
  const first = importWeeklyDatasets(presentation, [], grade2DeckProfile)
  const duplicate = importWeeklyDatasets(presentation, first.datasets.map((dataset) => dataset.id), grade2DeckProfile)

  assert.equal(duplicate.status, 'ok')
  assert.equal(importHttpStatus(duplicate), 200)
})
