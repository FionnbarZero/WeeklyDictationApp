import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('game policy preserves the published baseline except the explicit legacy Warmup rotation repair', () => {
  const candidate = readFileSync(new URL('../deployment/firestore-family-sync.rules', import.meta.url), 'utf8')
  const functions = candidate.indexOf('    function validGamePayload()')
  const users = candidate.indexOf('\n    match /users/')
  const games = candidate.indexOf('        // Candidate Stage B game contract.')
  const scores = candidate.indexOf('        match /scores/')
  assert.ok(functions > 0 && users > functions && games > users && scores > games)
  const withoutGames = candidate.slice(0, functions) + candidate.slice(users, games) + candidate.slice(scores)
  const repairedRotation = "        // Legacy migration preserves rotation placement without inventing correctness evidence.\n        && (request.resource.data.state.bucket != 'mastery-rotation'\n          || request.resource.data.state.consecutiveCorrect == 0)"
  const originalRotation = "        && (request.resource.data.state.bucket != 'mastery-rotation'\n          || (request.resource.data.state.evidence == 'demonstrated' && request.resource.data.state.consecutiveCorrect == 0))"
  // Permit exactly this independently regression-tested correction, not an
  // arbitrary replacement of the published-policy hash.
  assert.equal(withoutGames.split(repairedRotation).length, 2)
  const baseline = withoutGames.replace(repairedRotation, originalRotation)
  // Exact published rules from the approved A3.3 repair, recorded in its
  // release report. Root firestore.rules is a different hardening candidate.
  assert.equal(
    createHash('sha256').update(baseline).digest('hex'),
    '335b19cf431bb726ac9dcd74c9fa5fc11a8fbcb709f5fed4b3482cce1f4d1ded',
  )
})
