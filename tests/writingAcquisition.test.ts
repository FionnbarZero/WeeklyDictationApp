import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advanceWritingProgress,
  createWritingProgress,
  teachingPosition,
  validateWritingProgress,
  writingContext,
  type WritingProgress,
} from '../src/application/writingAcquisition/progress.ts'
import { createWritingLesson } from '../src/application/writingAcquisition/lesson.ts'
import { openWritingStore } from '../src/infrastructure/writingProgressStore.ts'
import { writingPreviewLesson } from '../src/writingAcquisition/previewLesson.ts'
import { buildAcquisitionCheckpoint, applyAcquisitionCheckpoint } from '../src/acquisition/persistence/reducer.ts'

const now = '2026-10-15T00:00:00.000Z'
const lesson = writingPreviewLesson()
const owner = 'test-owner'
const fresh = () => createWritingProgress(lesson, owner, 'test-attempt', now, { random: () => 0.25 })
function step(p: WritingProgress) {
  return {
    id: `step-${p.revision}`,
    expectedRevision: p.revision,
    kind: 'complete-teaching-step' as const,
    position: teachingPosition(p)!,
  }
}
function teach(p: WritingProgress) {
  while (teachingPosition(p)) p = advanceWritingProgress(p, step(p), now)
  return p
}
function answer(p: WritingProgress, correct = true) {
  return advanceWritingProgress(
    p,
    {
      id: `answer-${p.revision}`,
      expectedRevision: p.revision,
      kind: 'answer',
      promptId: p.acquisition.flow.prompt!.id,
      correct,
      revealMethod: 'skip_timer',
    },
    now,
    () => 0.25,
  )
}
function memory() {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
}

test('the integration uses the complete original Grade 2 curriculum order and supported metadata', () => {
  assert.deepEqual(
    lesson.targets.map((t) => t.text),
    ['英雄', '每个', '勇敢', '保护', '动物', '让', '因为', '帮助', '有爱心'],
  )
  assert.equal(lesson.targets[1].pinyin, 'měi gè')
  assert.equal(lesson.targets[1].meaning, 'each')
  assert.throws(
    () => createWritingLesson({ ...lesson.dataset, words: [{ ...lesson.dataset.words[0], text: 'strokeorder' }] }),
    /one to four Chinese/,
  )
  assert.throws(
    () => createWritingLesson({ ...lesson.dataset, words: [{ ...lesson.dataset.words[0], text: '龘' }] }),
    /guide.*unavailable/,
  )
})

test('all characters finish six steps before acquisition; teaching produces no scores or acquisition revision', () => {
  let p = fresh()
  assert.throws(() => answer(p), /every character/)
  const original = structuredClone(p.acquisition)
  for (let i = 0; i < 12; i++) {
    assert.deepEqual(teachingPosition(p), {
      targetIndex: 0,
      targetId: lesson.targets[0].id,
      characterIndex: Math.floor(i / 6),
      step: i % 6,
    })
    p = advanceWritingProgress(p, step(p), now)
    assert.deepEqual(p.acquisition, original)
    assert.deepEqual(p.assessments, [])
  }
  assert.equal(teachingPosition(p), null)
  assert.equal(p.completedTeachingSteps[0], 12)
})

test('one through four characters, including repeated characters, require separate ordered steps', () => {
  for (const text of ['一', '一一', '有爱心', '一二三四']) {
    const source = { ...lesson.dataset, words: [{ ...lesson.dataset.words[0], text }] }
    let p = createWritingProgress(createWritingLesson(source), owner, 'count-test', now, { random: () => 0.25 })
    for (let count = 0; count < [...text].length * 6; count++) {
      assert.equal(teachingPosition(p)?.characterIndex, Math.floor(count / 6))
      p = advanceWritingProgress(p, step(p), now)
    }
    assert.equal(teachingPosition(p), null)
    assert.equal(p.assessments.length, 0)
  }
})

test('normal acquisition retains its exact engine output and next new word opens a fresh teacher', () => {
  let p = teach(fresh())
  for (let i = 0; p.acquisition.flow.targetIndex === 0 && i < 50; i++) {
    const context = writingContext(p.lesson, owner)
    const expected = buildAcquisitionCheckpoint({
      envelope: p.acquisition,
      context,
      sessionId: p.attemptId,
      answeredPromptId: p.acquisition.flow.prompt!.id,
      occurredAt: now,
      response: { correct: true, revealMethod: 'skip_timer' },
      random: () => 0.25,
    })
    const applied = applyAcquisitionCheckpoint(p.acquisition, expected, context)
    assert.notEqual(applied.status, 'conflict')
    p = answer(p)
    if (applied.status !== 'conflict') assert.deepEqual(p.acquisition, applied.envelope)
  }
  assert.equal(p.acquisition.flow.targetIndex, 1)
  assert.deepEqual(teachingPosition(p), { targetIndex: 1, targetId: lesson.targets[1].id, characterIndex: 0, step: 0 })
  assert.throws(() => answer(p), /every character/)
})

test('correction does not relaunch the teacher and teaching does not count toward whole-word scoring', () => {
  let p = teach(fresh())
  p = answer(answer(answer(p))) // familiar, familiar, show/copy
  p = answer(p, false)
  assert.equal(teachingPosition(p), null)
  assert.equal(p.assessments.filter((a) => a.countsTowardWeeklyScore).length, 1)
  assert.equal(p.completedTeachingSteps[0], 12)
})

test('legacy target finishes under its existing rules and the next new target receives teaching', () => {
  let p = createWritingProgress(lesson, owner, 'legacy-attempt', now, { legacy: fresh().acquisition })
  assert.equal(p.firstTeacherTargetIndex, 1)
  assert.equal(teachingPosition(p), null)
  for (let i = 0; p.acquisition.flow.targetIndex === 0 && i < 50; i++) p = answer(p)
  assert.equal(teachingPosition(p)?.targetIndex, 1)
  assert.equal(p.completedTeachingSteps[0], 0) // not falsely marked as taught
})

test('reload and transfer restore the exact unfinished step without learner ink', () => {
  const storage = memory()
  let store = openWritingStore(storage, 'preview', owner, fresh)
  for (let i = 0; i < 8; i++) store.apply(step(store.current), now)
  const saved = storage.getItem('preview')!
  assert.equal(/drawing|handwriting|recording|strokePath/.test(saved), false)
  store = openWritingStore(storage, 'preview', owner, () => {
    throw new Error('must not restart')
  })
  assert.equal(teachingPosition(store.current)?.characterIndex, 1)
  assert.equal(teachingPosition(store.current)?.step, 2)
  const secondDevice = memory()
  secondDevice.setItem('preview', saved)
  assert.deepEqual(openWritingStore(secondDevice, 'preview', owner, fresh).current, store.current)
  assert.throws(() => openWritingStore(secondDevice, 'preview', 'different-owner', fresh), /preserved/)
})

test('duplicate callbacks are idempotent and stale or changed callbacks cannot skip teaching', () => {
  const p = fresh()
  const command = step(p)
  const next = advanceWritingProgress(p, command, now)
  assert.deepEqual(advanceWritingProgress(next, command, now), next)
  assert.throws(
    () => advanceWritingProgress(next, { ...command, position: { ...command.position, step: 2 } }, now),
    /different content/,
  )
  assert.throws(() => advanceWritingProgress(next, { ...command, id: 'another-command' }, now), /another window/)
})

test('failed local saves keep the same step and retry safely', () => {
  const storage = memory()
  let fail = false
  const adapter = {
    ...storage,
    setItem: (key: string, value: string) => {
      if (fail) throw new Error('quota')
      storage.setItem(key, value)
    },
  }
  const store = openWritingStore(adapter, 'preview', owner, fresh)
  const command = step(store.current)
  fail = true
  assert.throws(() => store.apply(command, now), /quota/)
  assert.equal(teachingPosition(store.current)?.step, 0)
  fail = false
  store.apply(command, now)
  assert.equal(teachingPosition(store.current)?.step, 1)
})

test('a lost readback confirms the same write on retry without regenerating the checkpoint', () => {
  const storage = memory()
  let failRead = false
  const adapter = {
    getItem: (key: string) => {
      if (failRead) {
        failRead = false
        throw new Error('read interrupted')
      }
      return storage.getItem(key)
    },
    setItem: (key: string, value: string) => {
      storage.setItem(key, value)
      if (JSON.parse(value).revision > 0) failRead = true
    },
  }
  const store = openWritingStore(adapter, 'preview', owner, fresh)
  const command = step(store.current)
  assert.throws(() => store.apply(command, now), /read interrupted/)
  const written = storage.getItem('preview')
  store.apply(command, '2026-10-15T00:00:01.000Z')
  assert.equal(storage.getItem('preview'), written)
  assert.equal(store.current.revision, 1)
})

test('two open views cannot overwrite a newer saved step', () => {
  const storage = memory()
  const first = openWritingStore(storage, 'preview', owner, fresh)
  const second = openWritingStore(storage, 'preview', owner, fresh)
  first.apply(step(first.current), now)
  assert.throws(() => second.apply({ ...step(second.current), id: 'second-tab' }, now), /another window/)
  assert.equal(JSON.parse(storage.getItem('preview')!).revision, 1)
})

test('corrupt, bypassed and foreign records fail closed while the original bytes stay preserved', () => {
  const storage = memory()
  for (const changed of [
    { ...fresh(), completedTeachingSteps: [99, ...lesson.targets.slice(1).map(() => 0)] },
    { ...fresh(), owner: 'someone-else' },
    { ...fresh(), learnerInk: [[1, 2]] },
    { ...fresh(), completedTeachingSteps: [0] },
    { ...fresh(), completedTeachingSteps: [12, ...lesson.targets.slice(1).map(() => 0)] },
  ]) {
    const raw = JSON.stringify(changed)
    storage.setItem('preview', raw)
    assert.throws(() => openWritingStore(storage, 'preview', owner, fresh))
    assert.equal(storage.getItem('preview'), raw)
  }
  assert.throws(() => validateWritingProgress({ ...fresh(), revision: Number.NaN }, owner))
})
