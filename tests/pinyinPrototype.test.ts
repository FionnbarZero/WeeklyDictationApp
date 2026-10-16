import assert from 'node:assert/strict'
import test from 'node:test'
import { PERSON_PINYIN_CANDIDATES, personPinyinCandidates } from '../src/skywriting/pinyinPrototype.ts'

test('one-word Pinyin prototype offers choices only for complete ren', () => {
  assert.deepEqual(personPinyinCandidates('re', false), [])
  assert.deepEqual(personPinyinCandidates('ren', false), PERSON_PINYIN_CANDIDATES)
  assert.deepEqual(personPinyinCandidates('RÉN', false), PERSON_PINYIN_CANDIDATES)
  assert.deepEqual(personPinyinCandidates('ren2', false), PERSON_PINYIN_CANDIDATES)
  assert.deepEqual(personPinyinCandidates('ren', true), [])
  assert.deepEqual(personPinyinCandidates('人', false), [])
})
