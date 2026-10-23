import assert from 'node:assert/strict'
import test from 'node:test'
import { answerAcquisition, revealAcquisition, startAcquisition, resumeAcquisition } from '../src/acquisition/engine.ts'
import { acquisitionPersistenceContext } from '../src/application/acquisitionPersistence.ts'
import * as pilot from '../src/application/writingAcquisition/pilot.ts'
import {
  advanceWritingProgress,
  createWritingProgress,
  teachingPosition,
  validateWritingProgress,
} from '../src/application/writingAcquisition/progress.ts'
import { createInitialState } from '../src/domain.ts'
import { validateAcquisitionProgressEnvelope } from '../src/acquisition/persistence/validation.ts'
import { resolveAcquisitionLesson } from '../src/acquisition/persistence/lessonSnapshot.ts'
import { acquisitionDigest } from '../src/acquisition/persistence/identity.ts'
import { writingContext } from '../src/application/writingAcquisition/progress.ts'
import { COPY_MEMORY_WRITING_POLICY, writingCorrectionStrategy } from '../src/writingAcquisition/correctionStrategy.ts'
import {
  writingPreviewLesson,
  REFINEMENT_PREVIEW_POLICY,
  WRITING_PREVIEW_POLICY,
} from '../src/writingAcquisition/previewLesson.ts'
import { writingRefinementStrategy } from '../src/writingAcquisition/refinementStrategy.ts'

const now = '2026-10-23T18:00:00.000Z'
const random = () => 0.25
const fresh = (policy = COPY_MEMORY_WRITING_POLICY as Parameters<typeof writingPreviewLesson>[0]) =>
  createWritingProgress(writingPreviewLesson(policy), 'correction-test', 'correction-attempt', now, { random })
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
      random,
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
    random,
  )
}
function roundTrip(p: ReturnType<typeof fresh>) {
  const copy = JSON.parse(JSON.stringify(p))
  validateWritingProgress(copy, p.owner)
  assert.equal(JSON.stringify(copy), JSON.stringify(p))
  return copy as typeof p
}

test('v8 preserves all-character teaching, trace/independent introduction and timers', () => {
  assert.throws(() => answer(fresh()), /every character/)
  let p = teach(fresh())
  assert.equal(p.completedTeachingSteps[0], 10)
  assert.equal(p.assessments.length, 0)
  assert.equal(p.acquisition.flow.prompt!.kind, 'show-copy')
  p = answer(p)
  assert.equal(p.acquisition.flow.prompt!.kind, 'target')
  p = answer(p)
  assert.equal(p.acquisition.flow.prompt!.kind, 'familiar-dt')
  assert.deepEqual(writingCorrectionStrategy.timers, writingRefinementStrategy.timers)
  assert.deepEqual(writingCorrectionStrategy.expandedSequence, writingRefinementStrategy.expandedSequence)
})

test('five repeated failures stay in copy/memory pairs, survive reload and never reintroduce teaching or distractors', () => {
  let p = answer(answer(teach(fresh())), false)
  const steps = [...p.completedTeachingSteps]
  for (let i = 0; i < 5; i++) {
    p = roundTrip(p)
    assert.equal(p.acquisition.flow.phase, 'correction')
    assert.equal(p.acquisition.flow.prompt!.kind, 'show-copy')
    assert.equal(p.acquisition.flow.prompt!.word.text, '英雄')
    assert.equal(p.acquisition.flow.prompt!.scored, false)
    assert.equal(teachingPosition(p), null)
    p = roundTrip(answer(p))
    assert.equal(p.acquisition.flow.prompt!.kind, 'target')
    assert.equal(p.acquisition.flow.prompt!.scored, true)
    assert.equal(p.acquisition.flow.prompt!.revealed, false)
    p = answer(p, false)
  }
  assert.deepEqual(p.completedTeachingSteps, steps)
  assert.equal(p.acquisition.flow.targetIndex, 0)
  assert.equal(p.assessments.filter((a) => !a.correct && a.kind === 'target').length, 6)
  p = answer(answer(p))
  assert.equal(p.acquisition.flow.phase, 'expanded-trials')
  assert.equal(p.acquisition.flow.prompt!.kind, 'familiar-dt')
})

test('middle expanded failure resumes its precise next distractor position', () => {
  let p = answer(answer(teach(fresh())))
  p = answer(p) // first distractor
  assert.equal(p.acquisition.flow.step, 1)
  p = answer(p, false)
  assert.equal(p.acquisition.flow.resumePosition!.step, 2)
  p = answer(answer(p))
  assert.equal(p.acquisition.flow.phase, 'expanded-trials')
  assert.equal(p.acquisition.flow.step, 2)
  assert.equal(p.acquisition.flow.prompt!.kind, 'familiar-dt')
})

test('last expanded failure stays on this word until memory succeeds, then teaches the next word', () => {
  let p = answer(answer(teach(fresh())))
  while (p.acquisition.flow.step < 8) p = answer(p)
  p = answer(p, false)
  for (let i = 0; i < 4; i++) {
    p = answer(answer(p), false)
    assert.equal(p.acquisition.flow.targetIndex, 0)
    assert.equal(teachingPosition(p), null)
  }
  p = answer(answer(p))
  assert.equal(p.acquisition.flow.targetIndex, 1)
  assert.equal(teachingPosition(p)?.step, 0)
  assert.equal(teachingPosition(p)?.characterIndex, 0)
  roundTrip(p)
})

for (const mode of ['teaching', 'dt-practice'] as const)
  test(`earned distractor repeats correction without losing ${mode} return position`, () => {
    const targetSet = { id: 'earned-test', targets: writingPreviewLesson().dataset.words }
    let flow = startAcquisition(targetSet, writingCorrectionStrategy, random)
    const next = (correct = true) => {
      flow = answerAcquisition(revealAcquisition(flow), targetSet, writingCorrectionStrategy, correct, () => 0.75)
    }
    // Use only real transitions to earn the first word (or complete teaching).
    for (let i = 0; i < 300 && (mode === 'teaching' ? flow.targetIndex < 1 : !flow.teachingComplete); i++) next()
    if (mode === 'dt-practice') flow = resumeAcquisition(flow, targetSet, writingCorrectionStrategy, () => 0.75)
    for (let i = 0; i < 40 && flow.prompt?.kind !== 'earned-dt'; i++) next()
    assert.equal(flow.prompt?.kind, 'earned-dt')
    assert.equal(flow.mode, mode)
    const resume = structuredClone(flow.resumePosition)
    const targetIndex = flow.targetIndex
    next(false)
    for (let i = 0; i < 5; i++) {
      assert.equal(flow.phase, 'correction')
      assert.equal(flow.prompt!.kind, 'show-copy')
      assert.equal(flow.correctionRole, 'earned-dt')
      assert.deepEqual(flow.resumePosition, resume)
      next()
      assert.equal(flow.prompt!.kind, 'target')
      next(false)
    }
    next()
    next()
    assert.equal(flow.targetIndex, targetIndex)
    assert.equal(flow.mode, mode)
    assert.equal(flow.correctionRole, undefined)
    if (mode === 'teaching') assert.equal(flow.phase, 'expanded-trials')
    else assert.equal(flow.currentTarget, null)
  })

test('policy is selected only for fresh Grade 2 attempts, leaving old pinned lessons byte-identical', () => {
  const state = createInitialState()
  const context = acquisitionPersistenceContext('correction-test', writingPreviewLesson().dataset)
  assert.equal(pilot.prepareContext(state, context, true).strategy, writingCorrectionStrategy)
  assert.equal(pilot.prepareContext(state, context, false).strategy, writingRefinementStrategy)
  for (const grade of ['Kindergarten', 'Grade 5']) {
    const other = { ...context, identity: { ...context.identity, grade } }
    assert.equal(pilot.prepareContext(state, other, true), other)
  }
  for (const policy of [undefined, WRITING_PREVIEW_POLICY, REFINEMENT_PREVIEW_POLICY]) {
    const p = createWritingProgress(writingPreviewLesson(policy), 'correction-test', 'old-attempt', now, { random })
    const bytes = JSON.stringify(p)
    const oldState = { ...state, acquisitionProgressEnvelopes: [p.acquisition] }
    assert.equal(pilot.prepareContext(oldState, context, true), context)
    roundTrip(p)
    assert.equal(JSON.stringify(p), bytes)
  }
})

test('correction command replay is idempotent and stale answers cannot skip a memory trial', () => {
  const p = answer(answer(teach(fresh())), false)
  const command = {
    id: 'copy-once',
    kind: 'answer' as const,
    expectedRevision: p.revision,
    promptId: p.acquisition.flow.prompt!.id,
    correct: true,
    revealMethod: 'skip_timer',
  }
  const next = advanceWritingProgress(p, command, now, random)
  assert.deepEqual(advanceWritingProgress(next, command, now, random), next)
  assert.throws(() => advanceWritingProgress(next, { ...command, id: 'stale-copy' }, now, random))
  assert.equal(next.acquisition.flow.prompt!.kind, 'target')
})

test('invalid repeat policy is refused without changing either saved copy', () => {
  const p = fresh()
  const context = writingContext(p.lesson, p.owner)
  const bytes = JSON.stringify(p)
  const malformed = {
    ...context,
    strategy: {
      ...context.strategy,
      correctionPolicy: {
        ...writingCorrectionStrategy.correctionPolicy,
        repeatUntilCorrect: 'yes' as unknown as boolean,
      },
    },
  }
  const result = validateAcquisitionProgressEnvelope(p.acquisition, malformed)
  assert.equal(result.valid, false)
  assert.equal(JSON.stringify(p), bytes)
})

test('repeat correction pins a new engine contract, preserving v1 legacy snapshots and refusing downgrade', () => {
  const p = fresh()
  assert.equal(p.acquisition.lessonSnapshot!.engineContract, 'acquisition-engine-v2')
  assert.equal(fresh(REFINEMENT_PREVIEW_POLICY).acquisition.lessonSnapshot!.engineContract, 'acquisition-engine-v1')
  const forged = structuredClone(p.acquisition)
  const { fingerprint: _fingerprint, ...payload } = forged.lessonSnapshot!
  const downgraded = { ...payload, engineContract: 'acquisition-engine-v1' as const }
  forged.lessonSnapshot = { ...downgraded, fingerprint: acquisitionDigest(downgraded) }
  assert.throws(() => resolveAcquisitionLesson(forged, writingContext(p.lesson, p.owner)), /safely restored/)
})
