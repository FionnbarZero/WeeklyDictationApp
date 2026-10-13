import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { revealAcquisition } from '../src/acquisition/engine.ts'
import type { AcquisitionPersistenceContext } from '../src/acquisition/persistence/contracts.ts'
import { transitionAcquisition } from '../src/acquisition/transition.ts'
import { openAcquisitionStore } from '../src/familyBeta/acquisitionStore.ts'
import { type CurriculumSnapshot, inspectSnapshot } from '../src/familyBeta/curriculum.ts'
import {
  discardSavedLesson,
  listSavedLessons,
  readSavedLesson,
  rememberLessonLaunch,
} from '../src/familyBeta/lessonLaunch.ts'
import { STROKE_ORDER_MODULE, strokeOrderGuide, strokeOrderLesson } from '../src/familyBeta/strokeOrderSlay.ts'
import { strokeAssetIsAvailable } from '../src/learningGames/strokeOrder/rounds.ts'

function fixture(slug: string) {
  const source = JSON.parse(readFileSync(`public/curriculum/beta/${slug}.json`, 'utf8')) as CurriculumSnapshot
  const datasets = inspectSnapshot(source).datasets
  const dataset = datasets[0]
  const lesson = strokeOrderLesson([dataset])
  const context: AcquisitionPersistenceContext = {
    identity: {
      childId: 'stroke-child',
      grade: dataset.grade,
      schoolYear: '2026-27',
      datasetId: dataset.id,
      activityModule: STROKE_ORDER_MODULE,
      tier: 'tier-1',
    },
    targetSet: lesson.targetSet,
    strategy: lesson.strategy,
    lifecycleStage: { kind: 'acquisition' },
    applicationVersion: 'test-d2',
  }
  const records = new Map<string, string>()
  const storage = {
    get length() {
      return records.size
    },
    key: (index: number) => [...records.keys()][index] || null,
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value)
    },
  }
  return { source, datasets, dataset, lesson, context, storage, records }
}

test('the distributed stroke-guide license is an unmodified copy of its source license', () => {
  assert.equal(
    readFileSync('public/licenses/stroke-guides/ARPHICPL.TXT', 'utf8'),
    readFileSync('src/learningGames/strokeOrder/ARPHICPL.TXT', 'utf8'),
  )
})

for (const slug of ['kindergarten', 'grade2', 'grade5']) {
  test(`${slug} every bundled Tier 1 target and familiar seed has finite ordered stroke geometry`, () => {
    const { datasets } = fixture(slug)
    for (const dataset of datasets) {
      const lesson = strokeOrderLesson([dataset])
      assert.equal(lesson.targetSet.targets.length, dataset.words.length)
      assert.deepEqual(lesson.unsupported, [])
      for (const target of [...lesson.targetSet.targets, ...lesson.strategy.familiarDtTargets]) {
        const guide = strokeOrderGuide(target)
        assert.equal(guide.targetId, target.id)
        assert.ok(guide.strokes.length)
        assert.equal(guide.strokeLabels.filter((n) => n === 1).length, [...target.text].length)
        assert.ok(
          guide.strokes.every(
            (stroke) => stroke.length >= 2 && stroke.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)),
          ),
        )
      }
    }
  })
  test(`${slug} writing sequence, timers and scores match the grade engine through teaching and earned DT; ordinary writing is separate`, () => {
    const { context, storage } = fixture(slug)
    const ordinary = openAcquisitionStore(storage, {
      ...context,
      identity: { ...context.identity, activityModule: 'writing-dojo' },
    })
    const ordinaryRaw = storage.getItem(ordinary.key)
    const store = openAcquisitionStore(storage, context, { random: () => 0 })
    const sequence: string[] = []
    const timers: number[] = []
    let guard = 0
    while (!store.current.envelope.flow.complete && guard++ < 450) {
      const flow = store.current.envelope.flow
      if (flow.targetIndex === 0) {
        sequence.push(flow.prompt!.kind)
        if (flow.phase === 'expanded-trials' && flow.prompt!.kind === 'target') timers.push(flow.prompt!.timerSeconds)
        if (flow.prompt!.kind === 'familiar-dt') assert.equal(flow.prompt!.timerSeconds, 5)
      }
      const expected = transitionAcquisition(
        revealAcquisition(flow),
        context.targetSet,
        context.strategy,
        { correct: true, revealMethod: 'timer' },
        () => 0,
      )
      store.answer(true, 'timer')
      assert.deepEqual(store.current.envelope.flow, expected.nextFlow)
      if (expected.assessment) assert.deepEqual(store.current.assessments.at(-1), expected.assessment)
      assert.deepEqual(openAcquisitionStore(storage, context).current, JSON.parse(JSON.stringify(store.current)))
    }
    assert.equal(store.current.envelope.flow.teachingComplete, true)
    assert.deepEqual(sequence, [
      'familiar-dt',
      'familiar-dt',
      'show-copy',
      'target',
      'target',
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
    ])
    assert.deepEqual(timers, [10, 9, 8, 7, 6])
    assert.equal(
      store.current.assessments.filter((a) => a.countsTowardWeeklyScore).length,
      context.targetSet.targets.length * 6,
    )
    const history = store.current.reviewedTrials
    store.finishSession()
    assert.equal(store.current.envelope.flow.mode, 'dt-practice')
    assert.deepEqual(store.current.reviewedTrials, history)
    assert.equal(storage.getItem(ordinary.key), ordinaryRaw)
  })
  test(`${slug} correction follows the writing rule and restores the interrupted expanded position`, () => {
    const { context, storage } = fixture(slug)
    const store = openAcquisitionStore(storage, context, { random: () => 0 })
    for (let i = 0; i < 4; i++) store.answer(true, 'skip_timer')
    store.answer(false, 'timer')
    assert.equal(store.current.envelope.flow.phase, 'correction')
    const kinds: string[] = []
    for (let i = 0; i < 6; i++) {
      const prompt = store.current.envelope.flow.prompt!
      kinds.push(prompt.kind)
      assert.equal(prompt.timerSeconds, prompt.kind === 'familiar-dt' ? 5 : 10)
      store.answer(true, 'timer')
    }
    assert.deepEqual(kinds, ['show-copy', 'show-copy', 'show-copy', 'target', 'familiar-dt', 'target'])
    assert.equal(store.current.envelope.flow.phase, 'expanded-trials')
    assert.equal(store.current.envelope.flow.step, 1)
    assert.equal(store.current.envelope.flow.prompt!.timerSeconds, 9)
    assert.equal(store.current.assessments.filter((a) => a.countsTowardWeeklyScore).length, 4)
  })
  test(`${slug} pinned route resumes Stroke Order and explicit discard preserves reviewed history`, async () => {
    const { source, dataset, context, storage } = fixture(slug)
    const profile = { id: context.identity.childId, grade: source.grade, nickname: 'Synthetic', active: true }
    const store = openAcquisitionStore(storage, context, { random: () => 0 })
    store.answer(true, 'timer')
    rememberLessonLaunch(storage, profile, store.current.envelope, source, dataset.startDate)
    const { lessons, warnings } = await listSavedLessons(storage, profile)
    assert.deepEqual(warnings, [])
    assert.equal(lessons.length, 1)
    assert.equal(lessons[0].experience, STROKE_ORDER_MODULE)
    assert.equal(lessons[0].channel, 'writing')
    await assert.rejects(readSavedLesson(storage, { ...profile, id: 'different' }, lessons[0]))
    const raw = storage.getItem(store.key)
    discardSavedLesson(storage, profile, {
      progressionId: store.current.envelope.id,
      fingerprint: store.current.envelope.lessonSnapshot!.fingerprint,
    })
    assert.equal(storage.getItem(store.key), raw)
    assert.deepEqual((await listSavedLessons(storage, profile)).lessons, [])
    assert.notEqual(openAcquisitionStore(storage, context).key, store.key)
  })
}

test('invalid/missing guides cannot be used; supplemental geometry does not alter frozen prototypes', () => {
  assert.equal(strokeAssetIsAvailable('学校'), false)
  assert.equal(
    strokeAssetIsAvailable('一', {
      一: [
        [
          [0, Number.NaN],
          [1, 2],
        ],
      ],
    }),
    false,
  )
  assert.throws(() => strokeOrderGuide({ id: 'missing', text: '𠮷' }))
  assert.throws(() => strokeOrderGuide({ id: 'too-long', text: '一二三四五六七' }))
  const { dataset } = fixture('grade2')
  assert.throws(() => strokeOrderLesson([dataset, dataset]))
  assert.throws(() => strokeOrderLesson([{ ...dataset, schoolYear: '2027-28' }]))
  assert.throws(() => strokeOrderLesson([{ ...dataset, words: [], vocabulary: undefined }]))
  const wrong = dataset.words.map((w) => ({ ...w, tier: 'tier-2' as const }))
  assert.throws(() => strokeOrderLesson([{ ...dataset, words: wrong, vocabulary: undefined }]))
})

test('an honest supported subset keeps source order and cannot route arbitrary or reversed vocabulary', async () => {
  const { source, dataset, context, storage } = fixture('grade2')
  const profile = { id: context.identity.childId, grade: source.grade, nickname: 'Synthetic', active: true }
  const subset = { ...context, targetSet: { ...context.targetSet, targets: context.targetSet.targets.slice(1, 3) } }
  const store = openAcquisitionStore(storage, subset)
  rememberLessonLaunch(storage, profile, store.current.envelope, source, dataset.startDate)
  assert.equal((await listSavedLessons(storage, profile)).lessons[0].experience, STROKE_ORDER_MODULE)
  for (const targets of [
    [...subset.targetSet.targets].reverse(),
    [{ ...context.targetSet.targets[0], id: 'forged-target', text: '一' }],
  ]) {
    const separate = fixture('grade2').storage
    const bad = openAcquisitionStore(separate, { ...context, targetSet: { ...context.targetSet, targets } })
    assert.throws(() => rememberLessonLaunch(separate, profile, bad.current.envelope, source, dataset.startDate))
  }
})
