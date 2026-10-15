import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FIVE_STEP_SEQUENCE,
  SIX_STEP_SEQUENCE,
  TEACHER_STEPS,
  strokeFeedback,
  suppliedStrokes,
} from '../src/strokeTeacherPrototype/model.ts'

test('five-step preview removes only the extra tracing trial and retains the six-step reference', () => {
  assert.deepEqual(
    FIVE_STEP_SEQUENCE.map((stage) => TEACHER_STEPS[stage]),
    ['Watch and trace', 'Trace again', 'Finish the last third', 'Finish the last two-thirds', 'Write and compare'],
  )
  assert.deepEqual(
    SIX_STEP_SEQUENCE.map((stage) => TEACHER_STEPS[stage]),
    [...TEACHER_STEPS],
  )
  assert.deepEqual(
    FIVE_STEP_SEQUENCE.map((stage) => suppliedStrokes(stage, 8)),
    [0, 0, 5, 2, 0],
  )
})

test('backward chaining uses complete strokes even when the character is not divisible by three', () => {
  assert.equal(suppliedStrokes(3, 8), 5)
  assert.equal(suppliedStrokes(4, 8), 2)
  assert.equal(suppliedStrokes(5, 8), 0)
  assert.equal(suppliedStrokes(3, 3), 2)
  assert.equal(suppliedStrokes(4, 3), 1)
  assert.equal(suppliedStrokes(3, 1), 0)
})
test('tracing feedback identifies wrong direction and wrong order without accepting the stroke', () => {
  const guides = [
    [
      [10, 10],
      [80, 10],
    ],
    [
      [10, 50],
      [80, 50],
    ],
  ] as const
  assert.equal(strokeFeedback(guides[0], guides, 0), null)
  assert.match(strokeFeedback([...guides[0]].reverse(), guides, 0)!, /other way/)
  assert.match(strokeFeedback(guides[1], guides, 0)!, /That is stroke 2/)
  assert.match(
    strokeFeedback(
      [
        [90, 90],
        [90, 80],
      ],
      guides,
      0,
    )!,
    /Try stroke 1 again/,
  )
})
