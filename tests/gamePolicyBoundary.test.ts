import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('Stage B adds only game collections to the verified production policy', () => {
  const candidate = readFileSync(new URL('../deployment/firestore-family-sync.rules', import.meta.url), 'utf8')
  const functions = candidate.indexOf('    function validGamePayload()')
  const users = candidate.indexOf('\n    match /users/')
  const games = candidate.indexOf('        // Candidate Stage B game contract.')
  const scores = candidate.indexOf('        match /scores/')
  assert.ok(functions > 0 && users > functions && games > users && scores > games)
  const baseline = candidate.slice(0, functions) + candidate.slice(users, games) + candidate.slice(scores)
  // Exact published rules from the approved A3.3 repair, recorded in its
  // release report. Root firestore.rules is a different hardening candidate.
  assert.equal(
    createHash('sha256').update(baseline).digest('hex'),
    '335b19cf431bb726ac9dcd74c9fa5fc11a8fbcb709f5fed4b3482cce1f4d1ded',
  )
})
