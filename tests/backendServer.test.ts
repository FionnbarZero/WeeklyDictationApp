import assert from 'node:assert/strict'
import test from 'node:test'
import { authorized } from '../backend/server.ts'

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
