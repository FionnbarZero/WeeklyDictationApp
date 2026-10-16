import assert from 'node:assert/strict'
import test from 'node:test'
import { revealAcquisition, startAcquisition } from '../src/acquisition/engine.ts'
import { grade5AcquisitionStrategy } from '../src/acquisition/strategies/grade5.ts'
import { kindergartenAcquisitionStrategy } from '../src/acquisition/strategies/kindergarten.ts'
import { transitionAcquisition } from '../src/acquisition/transition.ts'
import {
  createWritingLesson,
  FIVE_STEP_WRITING_POLICY,
  GRADE5_WRITING_POLICY,
  KINDERGARTEN_WRITING_POLICY,
} from '../src/application/writingAcquisition/lesson.ts'
import {
  advanceWritingProgress,
  createWritingProgress,
  teachingPosition,
  validateWritingProgress,
  type WritingProgress,
  writingContext,
} from '../src/application/writingAcquisition/progress.ts'
import { openWritingStore } from '../src/infrastructure/writingProgressStore.ts'
import { teacherGradeProfiles, teacherProfileForGrade } from '../src/strokeTeacherPrototype/gradeProfiles.ts'
import { strokeFeedback, strokeMatchesGuide } from '../src/strokeTeacherPrototype/model.ts'
import { crossGradeLessons, crossGradePreviewKey } from '../src/writingAcquisition/crossGradeLessons.ts'
import { writingPreviewLesson } from '../src/writingAcquisition/previewLesson.ts'

const now = '2026-10-15T22:00:00.000Z'
const random = () => 0.25
function teach(progress: WritingProgress) {
  let p = progress
  while (teachingPosition(p))
    p = advanceWritingProgress(
      p,
      {
        id: `step-${p.revision}`,
        kind: 'complete-teaching-step',
        expectedRevision: p.revision,
        position: teachingPosition(p)!,
      },
      now,
      random,
    )
  return p
}
function answer(p: WritingProgress, correct = true) {
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
for (const grade of ['Kindergarten', 'Grade 5'] as const) {
  test(`${grade}: every retained teacher-source target has guides, and every character gates native acquisition`, () => {
    const strategy = grade === 'Kindergarten' ? kindergartenAcquisitionStrategy : grade5AcquisitionStrategy
    const lessons = crossGradeLessons(grade)
    assert.equal(lessons.length, 5)
    for (const lesson of lessons) {
      let p = createWritingProgress(lesson, 'cross-grade-owner', 'cross-grade-attempt', now, { random })
      assert.equal(p.contract, 'cross-grade-writing-progress-v1')
      assert.deepEqual(writingContext(lesson, p.owner).strategy, strategy)
      let baseline = startAcquisition({ id: lesson.dataset.id, targets: lesson.dataset.words }, strategy, random)
      for (let targetIndex = 0; targetIndex < lesson.targets.length; targetIndex++) {
        assert.equal(teachingPosition(p)?.targetIndex, targetIndex)
        assert.throws(() => answer(p), /every character/)
        const before = JSON.stringify(p.acquisition)
        const assessments = JSON.stringify(p.assessments)
        p = teach(p)
        assert.equal(p.completedTeachingSteps[targetIndex], [...lesson.targets[targetIndex].text].length * 5)
        assert.equal(JSON.stringify(p.acquisition), before)
        assert.equal(JSON.stringify(p.assessments), assessments)
        for (
          let i = 0;
          p.acquisition.flow.targetIndex === targetIndex && !p.acquisition.flow.teachingComplete && i < 40;
          i++
        ) {
          baseline = transitionAcquisition(
            revealAcquisition(baseline),
            { id: lesson.dataset.id, targets: lesson.dataset.words },
            strategy,
            { correct: true, revealMethod: 'skip_timer' },
            random,
          ).nextFlow
          p = answer(p)
          assert.deepEqual(p.acquisition.flow, baseline)
          validateWritingProgress(JSON.parse(JSON.stringify(p)), p.owner)
        }
      }
      assert.equal(p.acquisition.flow.teachingComplete, true)
    }
  })
  test(`${grade}: wrong answers use native correction without repeating the teacher; legacy target finishes first`, () => {
    const lesson = crossGradeLessons(grade)[0]
    let p = teach(createWritingProgress(lesson, 'cross-grade-owner', 'cross-grade-attempt', now, { random }))
    while (p.acquisition.flow.prompt?.kind !== 'target') p = answer(p)
    p = answer(p, false)
    assert.equal(p.acquisition.flow.phase, 'correction')
    assert.equal(teachingPosition(p), null)
    const legacy = createWritingProgress(lesson, p.owner, 'legacy-attempt', now, { legacy: p.acquisition })
    assert.equal(teachingPosition(legacy), null)
    let resumed = legacy
    for (let i = 0; resumed.acquisition.flow.targetIndex === 0 && i < 60; i++) resumed = answer(resumed)
    assert.equal(teachingPosition(resumed)?.targetIndex, 1)
    assert.equal(teachingPosition(resumed)?.step, 0)
    assert.deepEqual(
      resumed.completedTeachingSteps,
      lesson.targets.map(() => 0),
    )
  })
  test(`${grade}: readback failure retries the exact step and rejects stale or wrong-owner saves`, () => {
    const lesson = crossGradeLessons(grade)[0]
    const data = new Map<string, string>()
    let failRead = false
    const storage = {
      getItem(key: string) {
        if (failRead) {
          failRead = false
          throw new Error('readback failed')
        }
        return data.get(key) || null
      },
      setItem(key: string, value: string) {
        data.set(key, value)
      },
    }
    const key = crossGradePreviewKey(grade, lesson.dataset.id)
    const fresh = () => createWritingProgress(lesson, 'cross-grade-owner', 'saved-attempt', now)
    const store = openWritingStore(storage, key, 'cross-grade-owner', fresh)
    const stale = openWritingStore(storage, key, 'cross-grade-owner', fresh)
    const originalSet = storage.setItem
    storage.setItem = (key, value) => {
      originalSet(key, value)
      failRead = true
    }
    const command = {
      id: 'first-step',
      kind: 'complete-teaching-step' as const,
      expectedRevision: 0,
      position: teachingPosition(store.current)!,
    }
    assert.throws(() => store.apply(command, now), /readback failed/)
    assert.equal(store.current.revision, 0)
    storage.setItem = originalSet
    const bytes = data.get(key)
    assert.equal(store.apply(command, now).revision, 1)
    assert.equal(data.get(key), bytes)
    assert.throws(() => stale.apply({ ...command, id: 'other-step' }, now), /another window/)
    assert.throws(() => openWritingStore(storage, key, 'wrong-owner', fresh), /preserved/)
  })
}
test('old Grade 2 policies and contracts cannot be reinterpreted as another grade', () => {
  const lesson = writingPreviewLesson(FIVE_STEP_WRITING_POLICY)
  const p = createWritingProgress(lesson, 'old-owner', 'old-attempt', now)
  const bytes = JSON.stringify(p)
  assert.throws(
    () => createWritingLesson({ ...lesson.dataset, grade: 'Grade 5' }, FIVE_STEP_WRITING_POLICY),
    /matching/,
  )
  assert.throws(() => createWritingLesson(lesson.dataset, GRADE5_WRITING_POLICY), /matching/)
  assert.throws(() => createWritingLesson(lesson.dataset, KINDERGARTEN_WRITING_POLICY), /matching/)
  validateWritingProgress(p, p.owner)
  assert.equal(JSON.stringify(p), bytes)
  assert.equal(p.contract, 'grade2-writing-progress-v1')
})
test('grade tracing profiles preserve Kinder support, Grade 2 behavior and Grade 5 precision', () => {
  assert.throws(() => teacherProfileForGrade('toString'), /not configured/)
  const guide = [
    [10, 20],
    [80, 20],
  ] as const
  const offset13 = [
    [10, 33],
    [80, 33],
  ] as const
  const offset9 = [
    [10, 29],
    [80, 29],
  ] as const
  assert.equal(strokeMatchesGuide(offset13, guide, teacherGradeProfiles.Kindergarten.assessment), true)
  assert.equal(strokeMatchesGuide(offset13, guide), false)
  assert.equal(strokeMatchesGuide(offset9, guide), true)
  assert.equal(strokeMatchesGuide(offset9, guide, teacherGradeProfiles['Grade 5'].assessment), false)
  for (const profile of Object.values(teacherGradeProfiles))
    assert.match(strokeFeedback([...guide].reverse(), [guide], 0, profile.assessment)!, /other way/)
  assert.equal(teacherGradeProfiles.Kindergarten.memoryGuideVisible, true)
  assert.equal(teacherGradeProfiles['Grade 5'].memoryGuideVisible, false)
})
