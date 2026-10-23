import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import { packWritingWorkspace, unpackWritingWorkspace } from '../src/familyBeta/writingWorkspaceCodec.ts'

test('writing transport is byte-exact for empty, repeated, Unicode and dictionary-reset histories', () => {
  for (const raw of [
    '',
    'AAAAA'.repeat(1000),
    JSON.stringify({ words: ['英雄', '一二三四', '🖌️'], note: '\n\\"' }).repeat(500),
    randomBytes(180_000).toString('base64'),
  ]) {
    assert.equal(unpackWritingWorkspace(packWritingWorkspace(raw)), raw)
  }
  const raw = JSON.stringify(
    Array.from({ length: 1200 }, (_, revision) => ({
      revision,
      owner: 'synthetic-long-writing',
      word: '英雄',
      correct: false,
    })),
  )
  assert.ok(packWritingWorkspace(raw).length < raw.length / 3)
})

test('writing transport refuses malformed, oversized and expansion-bomb payloads', () => {
  for (const payload of [null, {}, '!', btoa('a'), btoa(String.fromCharCode(255, 255)), 'a'.repeat(700_001)])
    assert.throws(() => unpackWritingWorkspace(payload))
  assert.throws(() => packWritingWorkspace('x'.repeat(5_000_001)), /safely/)
  const codes = [256, 65, ...Array.from({ length: 4000 }, (_, i) => 257 + i)]
  const bomb = btoa(codes.map((code) => String.fromCharCode(code >>> 8, code & 255)).join(''))
  assert.throws(() => unpackWritingWorkspace(bomb), /safely/)
})
