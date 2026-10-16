import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FAMILIAR_WRITING_RESPONSE_SECONDS,
  TARGET_WRITING_RESPONSE_SECONDS,
  writingResponseSecondsFor,
} from '../src/practice/writingTimer.ts'

test('writing response windows distinguish targets and Earned DTs from Familiar DTs and Warmup', () => {
  assert.equal(TARGET_WRITING_RESPONSE_SECONDS, 25)
  assert.equal(FAMILIAR_WRITING_RESPONSE_SECONDS, 10)
  assert.equal(writingResponseSecondsFor('target', 'acquisition'), 25)
  assert.equal(writingResponseSecondsFor('show-copy', 'acquisition'), 25)
  assert.equal(writingResponseSecondsFor('earned-dt', 'acquisition'), 25)
  assert.equal(writingResponseSecondsFor('familiar-dt', 'acquisition'), 10)
  assert.equal(writingResponseSecondsFor(undefined, 'acquisition'), 10)
  assert.equal(writingResponseSecondsFor(undefined, 'test-review'), 25)
})
