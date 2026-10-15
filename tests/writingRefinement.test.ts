import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createWritingProgress,
  advanceWritingProgress,
  teachingPosition,
  validateWritingProgress,
} from '../src/application/writingAcquisition/progress.ts'
import {
  writingPreviewLesson,
  REFINEMENT_PREVIEW_POLICY,
  WRITING_PREVIEW_POLICY,
} from '../src/writingAcquisition/previewLesson.ts'
import { grade2AcquisitionStrategy } from '../src/acquisition/strategies/grade2.ts'

const now = '2026-10-15T00:00:00.000Z'
function fresh() {
  return createWritingProgress(writingPreviewLesson(REFINEMENT_PREVIEW_POLICY), 'v7-test', 'v7-attempt', now, {
    random: () => 0.25,
  })
}
function teach(p: ReturnType<typeof fresh>) {
  while (teachingPosition(p))
    p = advanceWritingProgress(
      p,
      {
        id: `teach-${p.revision}`,
        kind: 'complete-teaching-step',
        expectedRevision: p.revision,
        position: teachingPosition(p)!,
      },
      now,
    )
  return p
}
function answer(p: ReturnType<typeof fresh>, correct = true) {
  return advanceWritingProgress(
    p,
    {
      id: `answer-${p.revision}`,
      kind: 'answer',
      expectedRevision: p.revision,
      promptId: p.acquisition.flow.prompt!.id,
      correct,
      revealMethod: 'skip_timer',
    },
    now,
    () => 0.25,
  )
}
test('v7: all characters then one trace, one independent, expanding distractors; repeat at next word', () => {
  let p = fresh()
  assert.throws(() => answer(p), /every character/)
  p = teach(p)
  assert.equal(p.completedTeachingSteps[0], 10)
  assert.equal(p.assessments.length, 0)
  const expected = [
    'show-copy',
    'target',
    'familiar-dt',
    'target',
    'familiar-dt',
    'familiar-dt',
    'target',
    'familiar-dt',
    'familiar-dt',
    'familiar-dt',
    'target',
  ]
  for (const kind of expected) {
    assert.equal(p.acquisition.flow.targetIndex, 0)
    assert.equal(p.acquisition.flow.prompt!.kind, kind)
    validateWritingProgress(JSON.parse(JSON.stringify(p)), p.owner)
    p = answer(p)
  }
  assert.equal(p.acquisition.flow.targetIndex, 1)
  assert.equal(teachingPosition(p)?.step, 0)
  assert.equal(p.assessments.filter((a) => a.countsTowardWeeklyScore).length, 4)
  p = teach(p)
  assert.equal(p.acquisition.flow.prompt!.kind, 'show-copy')
  p = answer(p)
  assert.equal(p.acquisition.flow.prompt!.kind, 'target')
  p = answer(p)
  assert.ok(['familiar-dt', 'earned-dt'].includes(p.acquisition.flow.prompt!.kind))
})
test('v7 wrong independent response enters existing correction rather than bypassing it', () => {
  let p = answer(teach(fresh()))
  p = answer(p, false)
  assert.equal(p.acquisition.flow.phase, 'correction')
  assert.equal(teachingPosition(p), null)
  for (let i = 0; p.acquisition.flow.phase === 'correction' && i < 15; i++) p = answer(p)
  assert.equal(p.acquisition.flow.phase, 'expanded-trials')
  assert.equal(p.acquisition.flow.prompt!.kind, 'familiar-dt')
})
test('v7 never reinterprets or mutates prior five/six-step lessons', () => {
  for (const policy of [undefined, WRITING_PREVIEW_POLICY]) {
    const p = createWritingProgress(writingPreviewLesson(policy), 'old-owner', 'old-attempt', now)
    const bytes = JSON.stringify(p)
    assert.equal(p.acquisition.flow.prompt!.kind, 'familiar-dt')
    teach(fresh())
    validateWritingProgress(p, p.owner)
    assert.equal(JSON.stringify(p), bytes)
  }
  assert.deepEqual(grade2AcquisitionStrategy.introductionSequence, [
    'familiar-dt',
    'familiar-dt',
    'show-copy',
    'target',
  ])
  assert.equal(grade2AcquisitionStrategy.expandedSequence[0], 'target')
})
