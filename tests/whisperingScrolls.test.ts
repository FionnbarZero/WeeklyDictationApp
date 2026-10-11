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
import { WHISPERING_SCROLLS_MODULE, whisperingScrollsLesson } from '../src/familyBeta/whisperingScrolls.ts'
import type { Tier2ReadingTarget } from '../src/tier2/contracts.ts'

function fixture(slug: string) {
  const source = JSON.parse(readFileSync(`public/curriculum/beta/${slug}.json`, 'utf8')) as CurriculumSnapshot
  const dataset = inspectSnapshot(source).datasets.find((item) => item.vocabulary?.tier2?.length)!
  const { profile, targetSet } = whisperingScrollsLesson([dataset])
  const identity = {
    childId: 'scroll-child',
    grade: profile.grade,
    schoolYear: profile.schoolYearKey,
    datasetId: dataset.id,
    activityModule: WHISPERING_SCROLLS_MODULE,
    tier: 'tier-2' as const,
  }
  const context: AcquisitionPersistenceContext<Tier2ReadingTarget> = {
    identity,
    targetSet,
    strategy: profile.acquisitionStrategy,
    lifecycleStage: { kind: 'acquisition' },
    applicationVersion: 'test-d1',
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
  return { source, dataset, profile, context, records, storage }
}

for (const slug of ['kindergarten', 'grade2', 'grade5']) {
  test(`${slug} scrolls: all transitions and target timers match the grade reading engine; ordinary progress stays separate`, () => {
    const { context, storage } = fixture(slug)
    const ordinary = openAcquisitionStore(
      storage,
      { ...context, identity: { ...context.identity, activityModule: 'reading-dojo' } },
      { random: () => 0 },
    )
    const ordinaryRaw = storage.getItem(ordinary.key)
    const scrolls = openAcquisitionStore(storage, context, { random: () => 0 })
    assert.notEqual(scrolls.key, ordinary.key)
    const timers: number[] = []
    let trials = 0
    while (!scrolls.current.envelope.flow.complete && trials++ < 500) {
      const flow = scrolls.current.envelope.flow
      if (flow.targetIndex === 0 && flow.phase === 'expanded-trials' && flow.prompt?.kind === 'target')
        timers.push(flow.prompt.timerSeconds)
      const expected = transitionAcquisition(
        revealAcquisition(flow),
        context.targetSet,
        context.strategy,
        { correct: true, revealMethod: 'recording-comparison' },
        () => 0,
      )
      scrolls.answer(true, 'recording-comparison')
      assert.deepEqual(scrolls.current.envelope.flow, expected.nextFlow)
      if (expected.assessment) assert.deepEqual(scrolls.current.assessments.at(-1), expected.assessment)
      const resumed = openAcquisitionStore(storage, context, { random: () => 0 })
      assert.deepEqual(resumed.current, JSON.parse(JSON.stringify(scrolls.current)))
    }
    assert.ok(scrolls.current.envelope.flow.teachingComplete)
    assert.deepEqual(timers, [10, 9, 8, 7, 6])
    assert.equal(storage.getItem(ordinary.key), ordinaryRaw)
    const reviewed = [...scrolls.current.reviewedTrials]
    scrolls.finishSession()
    assert.equal(scrolls.current.envelope.flow.mode, 'dt-practice')
    assert.deepEqual(scrolls.current.reviewedTrials, reviewed)
  })

  test(`${slug} scrolls: original lesson routes back to scrolls, rejects a forged route and preserves retired facts`, async () => {
    const { source, dataset, context, storage, records } = fixture(slug)
    const profile = { id: context.identity.childId, grade: source.grade, nickname: 'Synthetic', active: true }
    const store = openAcquisitionStore(storage, context, { random: () => 0 })
    store.answer(false, 'recording-comparison')
    rememberLessonLaunch(storage, profile, store.current.envelope, source, dataset.startDate)
    const { lessons, warnings } = await listSavedLessons(storage, profile)
    assert.deepEqual(warnings, [])
    assert.equal(lessons.length, 1)
    assert.equal(lessons[0].experience, 'whispering-scrolls')
    assert.equal(lessons[0].channel, 'reading')
    assert.equal(lessons[0].source.contentSha256, source.contentSha256)
    await assert.rejects(readSavedLesson(storage, { ...profile, id: 'other-child' }, lessons[0]))
    const raw = storage.getItem(store.key)
    discardSavedLesson(storage, profile, {
      progressionId: store.current.envelope.id,
      fingerprint: store.current.envelope.lessonSnapshot!.fingerprint,
    })
    assert.equal(storage.getItem(store.key), raw)
    assert.equal((await listSavedLessons(storage, profile)).lessons.length, 0)
    const restarted = openAcquisitionStore(storage, context, { random: () => 0 })
    assert.notEqual(restarted.key, store.key)
    assert.equal(restarted.current.envelope.revision, 0)
    assert.doesNotMatch(JSON.stringify([...records]), /blob:|data:audio|audio\/webm/)
  })
}

test('Kindergarten scrolls correction is feedback-only and retries the final six-second target before earning', () => {
  const { context, storage } = fixture('kindergarten')
  const store = openAcquisitionStore(storage, context, { random: () => 0 })
  let guard = 0
  while (
    !(
      store.current.envelope.flow.phase === 'expanded-trials' &&
      store.current.envelope.flow.prompt?.kind === 'target' &&
      store.current.envelope.flow.prompt.timerSeconds === 6
    ) &&
    guard++ < 60
  )
    store.answer(true, 'recording-comparison')
  const target = store.current.envelope.flow.prompt!.word.id
  store.answer(false, 'recording-comparison')
  assert.equal(store.current.envelope.flow.phase, 'correction')
  const scoredBefore = store.current.assessments.filter((item) => item.countsTowardWeeklyScore).length
  while (store.current.envelope.flow.phase === 'correction' && guard++ < 80) store.answer(true, 'recording-comparison')
  assert.equal(store.current.assessments.filter((item) => item.countsTowardWeeklyScore).length, scoredBefore)
  assert.equal(store.current.envelope.flow.prompt?.word.id, target)
  assert.equal(store.current.envelope.flow.prompt?.timerSeconds, 6)
  assert.equal(
    store.current.envelope.flow.earnedDtPool.some((item) => item.id === target),
    false,
  )
  store.answer(true, 'recording-comparison')
  assert.equal(
    store.current.envelope.flow.earnedDtPool.some((item) => item.id === target),
    true,
  )
})

test('scrolls refuses mixed cohorts, missing reading targets and unsupported school years', () => {
  const { dataset } = fixture('grade5')
  assert.throws(() => whisperingScrollsLesson([dataset, dataset]))
  assert.throws(() => whisperingScrollsLesson([{ ...dataset, vocabulary: { ...dataset.vocabulary!, tier2: [] } }]))
  assert.throws(() => whisperingScrollsLesson([{ ...dataset, schoolYear: '2027-28' }]))
})

test('ordinary saved reading cannot be redirected to scrolls by forged route metadata', async () => {
  const { source, dataset, context, storage } = fixture('grade5')
  const profile = { id: context.identity.childId, grade: source.grade, nickname: 'Synthetic', active: true }
  const ordinary = openAcquisitionStore(storage, {
    ...context,
    identity: { ...context.identity, activityModule: 'reading-dojo' },
  })
  rememberLessonLaunch(storage, profile, ordinary.current.envelope, source, dataset.startDate)
  const saved = (await listSavedLessons(storage, profile)).lessons[0]
  const validated = await readSavedLesson(storage, profile, { ...saved, experience: 'whispering-scrolls' })
  assert.equal(validated.experience, undefined)
})
