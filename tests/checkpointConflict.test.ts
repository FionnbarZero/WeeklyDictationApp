import assert from 'node:assert/strict'
import test from 'node:test'
import { chooseCheckpointWinner } from '../src/familyBeta/checkpointConflict.ts'

const policy = { referenceNow: '2026-10-08T04:00:00.000Z' }

test('chooses the checkpoint with the newest trusted reviewed answer', () => {
  const result = chooseCheckpointWinner([
    { id: 'older', reviewedAt: '2026-10-08T03:58:00.000Z' },
    { id: 'newer', reviewedAt: '2026-10-08T03:59:00.000Z' },
  ], policy)
  assert.deepEqual(result, { winner: { id: 'newer', reviewedAt: '2026-10-08T03:59:00.000Z' }, reason: 'reviewed-answer' })
})

test('a teaching-only checkpoint cannot beat a reviewed checkpoint', () => {
  const result = chooseCheckpointWinner([
    { id: 'reviewed', reviewedAt: '2026-10-08T03:59:00.000Z' },
    { id: 'teaching-only' },
  ], policy)
  assert.equal(result?.winner.id, 'reviewed')
  assert.equal(result?.reason, 'only-reviewed-answer')
})

test('rejects an implausibly future clock instead of letting it supersede reviewed work', () => {
  const result = chooseCheckpointWinner([
    { id: 'reviewed', reviewedAt: '2026-10-08T03:59:00.000Z' },
    { id: 'future-clock', reviewedAt: '2026-10-08T12:00:00.000Z' },
  ], policy)
  assert.equal(result?.winner.id, 'reviewed')
})

test('breaks exact reviewed-time ties by stable identity', () => {
  const candidates = [
    { id: 'device-b', reviewedAt: '2026-10-08T03:59:00.000Z' },
    { id: 'device-a', reviewedAt: '2026-10-08T03:59:00.000Z' },
  ]
  const result = chooseCheckpointWinner(candidates, policy)
  assert.equal(result?.winner.id, 'device-b')
  assert.equal(result?.reason, 'tie-break')
  assert.deepEqual(chooseCheckpointWinner([...candidates].reverse(), policy), result)
})

test('does not invent a winner when neither checkpoint has a reviewed answer', () => {
  const result = chooseCheckpointWinner([{ id: 'b' }, { id: 'a' }], policy)
  assert.equal(result?.winner, null)
  assert.equal(result?.reason, 'no-reviewed-answer')
})
