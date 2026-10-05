import assert from 'node:assert/strict'
import test from 'node:test'
import { authorized, importHttpStatus } from '../backend/server.ts'
import { grade2DeckProfile, importWeeklyDatasets } from '../src/slidesImporter.ts'

test('import server authorization fails closed when the token is absent or wrong', () => {
  const previous = process.env.IMPORT_RUN_TOKEN
  const previousMode = process.env.IMPORT_AUTH_MODE
  const previousService = process.env.K_SERVICE
  try {
    delete process.env.IMPORT_AUTH_MODE
    delete process.env.K_SERVICE
    process.env.IMPORT_RUN_TOKEN = 'correct-token'
    assert.equal(authorized({ headers: { authorization: 'Bearer correct-token' } }), true)
    assert.equal(authorized({ headers: { authorization: 'Bearer wrong-token' } }), false)
    delete process.env.IMPORT_RUN_TOKEN
    assert.equal(authorized({ headers: { authorization: 'Bearer correct-token' } }), false)
  } finally {
    if (previous === undefined) delete process.env.IMPORT_RUN_TOKEN
    else process.env.IMPORT_RUN_TOKEN = previous
    if (previousMode === undefined) delete process.env.IMPORT_AUTH_MODE
    else process.env.IMPORT_AUTH_MODE = previousMode
    if (previousService === undefined) delete process.env.K_SERVICE
    else process.env.K_SERVICE = previousService
  }
})

test('Cloud Run IAM mode is accepted only inside a Cloud Run service', () => {
  const previousToken = process.env.IMPORT_RUN_TOKEN
  const previousMode = process.env.IMPORT_AUTH_MODE
  const previousService = process.env.K_SERVICE
  try {
    delete process.env.IMPORT_RUN_TOKEN
    process.env.IMPORT_AUTH_MODE = 'cloud-run-iam'
    delete process.env.K_SERVICE
    assert.equal(authorized({ headers: {} }), false)
    process.env.K_SERVICE = 'weekly-dictation-importer'
    assert.equal(authorized({ headers: {} }), true)
  } finally {
    if (previousToken === undefined) delete process.env.IMPORT_RUN_TOKEN
    else process.env.IMPORT_RUN_TOKEN = previousToken
    if (previousMode === undefined) delete process.env.IMPORT_AUTH_MODE
    else process.env.IMPORT_AUTH_MODE = previousMode
    if (previousService === undefined) delete process.env.K_SERVICE
    else process.env.K_SERVICE = previousService
  }
})

test('an unchanged duplicate-only import is an acknowledged no-change run', () => {
  const presentation = {
    presentationId: grade2DeckProfile.sourceDeckId,
    slides: [{ objectId: 'existing', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' }],
  }
  const first = importWeeklyDatasets(presentation, [], grade2DeckProfile)
  const duplicate = importWeeklyDatasets(
    presentation,
    first.datasets.map((dataset) => dataset.id),
    grade2DeckProfile,
  )

  assert.equal(duplicate.status, 'ok')
  assert.equal(importHttpStatus(duplicate), 200)
})
