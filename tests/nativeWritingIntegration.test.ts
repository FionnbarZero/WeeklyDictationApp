import assert from 'node:assert/strict'
import test from 'node:test'
import { openAcquisitionStore } from '../src/familyBeta/acquisitionStore.ts'
import {
  nativeWritingAdapter,
  nativeWritingPayload,
  chooseNativeWritingPayload,
} from '../src/familyBeta/nativeWritingCheckpoint.ts'
import {
  createWritingCommand,
  teachingPosition,
  writingContext,
} from '../src/application/writingAcquisition/progress.ts'
import { crossGradeLessons } from '../src/writingAcquisition/crossGradeLessons.ts'
import { createDeviceSyncRepository, PracticeSyncConflictError } from '../src/familyBeta/deviceSync.ts'
import { documentValue, plainValue } from '../src/firestoreClient.ts'
import { createHash } from 'node:crypto'
import kindergartenSnapshot from '../public/curriculum/beta/kindergarten.json' with { type: 'json' }
import grade5Snapshot from '../public/curriculum/beta/grade5.json' with { type: 'json' }
import { inspectKindergartenWorkbook } from '../src/kindergartenSheetsImporter.ts'
import { kindergartenWritingDatasetForLab } from '../src/kindergartenLab/acquisitionLab.ts'
import { extractGrade5Presentation } from '../src/curriculum/adapters/grade5GoogleSlides.ts'
import { grade5LabDatasets } from '../src/grade5Lab/writingPractice.ts'
import {
  createWritingLesson,
  KINDERGARTEN_WRITING_POLICY,
  GRADE5_WRITING_POLICY,
} from '../src/application/writingAcquisition/lesson.ts'
import type { SheetsWorkbookPayload, SlidesPresentationPayload } from '../src/curriculum/model.ts'

const timestamp = '2026-10-16T00:00:00.000Z'

test('every native source lesson retains the approved teacher pronunciation, meaning and character guides', () => {
  const kindergarten = inspectKindergartenWorkbook(kindergartenSnapshot.payload as SheetsWorkbookPayload)
    .filter((candidate) => candidate.status === 'valid')
    .map((candidate) => ({
      ...kindergartenWritingDatasetForLab(candidate),
      source: { ...candidate.source },
    }))
  const grade5 = grade5LabDatasets(extractGrade5Presentation(grade5Snapshot.payload as SlidesPresentationPayload))
  for (const [grade, datasets, policy, count] of [
    ['Kindergarten', kindergarten, KINDERGARTEN_WRITING_POLICY, 16],
    ['Grade 5', grade5, GRADE5_WRITING_POLICY, 25],
  ] as const) {
    const approved = crossGradeLessons(grade).flatMap((lesson) => lesson.targets)
    let total = 0
    for (const dataset of datasets) {
      const lesson = createWritingLesson(dataset, policy)
      const base = writingContext(lesson, 'parity-child')
      const context = { ...base, identity: { ...base.identity, activityModule: 'writing-dojo' } }
      const store = openAcquisitionStore(memory(), context, {
        writing: nativeWritingAdapter(dataset),
        now: () => timestamp,
      })
      for (const target of store.current.writing!.lesson.targets) {
        const original = approved.find((item) => item.text === target.text)!
        assert.equal(target.pinyin, original.pinyin, `${grade}: ${target.text} pronunciation`)
        assert.equal(target.meaning, original.meaning, `${grade}: ${target.text} meaning`)
        assert.equal(target.guideFingerprint, original.guideFingerprint)
        total++
      }
      assert.deepEqual(store.current.envelope.lessonSnapshot!.targetSet.targets, dataset.words)
    }
    assert.equal(total, count)
  }
})
function memory() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, raw: string) => {
      values.set(key, raw)
    },
  }
}
for (const grade of ['Kindergarten', 'Grade 5'] as const) {
  const lesson = crossGradeLessons(grade)[0]
  const base = writingContext(lesson, 'native-child')
  const context = { ...base, identity: { ...base.identity, activityModule: 'writing-dojo' } }
  const options = {
    now: () => timestamp,
    random: () => 0.25,
    writerId: 'native-device',
    writing: nativeWritingAdapter(lesson.dataset),
  }
  type Store = ReturnType<typeof openAcquisitionStore>
  const command = (store: Store) =>
    createWritingCommand({
      kind: 'complete-teaching-step',
      expectedRevision: store.current.writing!.revision,
      position: teachingPosition(store.current.writing!)!,
    })
  function teach(store: Store) {
    while (teachingPosition(store.current.writing!)) store.completeTeachingStep(command(store))
  }

  test(`${grade} native: long writing keeps all 501 assessments, retries lost readback and resumes the exact trial`, () => {
    const storage = memory()
    const store = openAcquisitionStore(storage, context, options)
    teach(store)
    while (store.current.reviewedTrials.length < 500) store.answer(false, 'skip_timer')
    while (store.current.envelope.flow.prompt!.kind === 'show-copy') store.answer(false, 'skip_timer')
    const oldHistory = JSON.stringify(store.current.reviewedTrials)
    const stale = openAcquisitionStore(storage, context, options)
    const set = storage.setItem,
      get = storage.getItem
    let fail = false
    storage.setItem = (key, raw) => {
      set(key, raw)
      fail = true
    }
    storage.getItem = (key) => {
      if (fail) {
        fail = false
        throw new Error('lost acknowledgement')
      }
      return get(key)
    }
    assert.throws(() => store.answer(true, 'skip_timer'), /lost acknowledgement/)
    const written = get(store.key)!
    storage.setItem = set
    store.answer(true, 'skip_timer')
    assert.equal(get(store.key), written)
    assert.equal(store.current.reviewedTrials.length, 501)
    assert.equal(JSON.stringify(store.current.reviewedTrials.slice(0, 500)), oldHistory)
    assert.equal(store.current.writing!.assessments.length, 501)
    assert.throws(() => stale.answer(true, 'skip_timer'), /another tab/)
    const reopened = openAcquisitionStore(storage, context, options)
    assert.equal(JSON.stringify(reopened.current), JSON.stringify(store.current))
    const invalid = JSON.parse(written)
    invalid.writing.assessments = Array.from(
      { length: invalid.envelope.revision + 1 },
      () => invalid.writing.assessments[0],
    )
    assert.throws(() => nativeWritingPayload(JSON.stringify(invalid), context.identity.childId))
    reopened.finishSession()
    assert.equal(reopened.current.assessments.length, 0)
    assert.equal(reopened.current.reviewedTrials.length, 501)
    nativeWritingPayload(get(store.key)!, context.identity.childId)
  })

  test(`${grade} native: atomic teacher gates every new word without changing native scoring`, () => {
    const storage = memory(),
      store = openAcquisitionStore(storage, context, options)
    assert.equal(store.current.schema, 2)
    assert.throws(() => store.answer(true, 'timer'), /every character/)
    for (let target = 0; target < lesson.targets.length; target++) {
      assert.equal(teachingPosition(store.current.writing!)?.targetIndex, target)
      const envelope = JSON.stringify(store.current.envelope),
        assessments = JSON.stringify(store.current.assessments)
      teach(store)
      assert.equal(JSON.stringify(store.current.envelope), envelope)
      assert.equal(JSON.stringify(store.current.assessments), assessments)
      assert.equal(store.current.writing!.completedTeachingSteps[target], [...lesson.targets[target].text].length * 5)
      for (
        let i = 0;
        !store.current.envelope.flow.teachingComplete && store.current.envelope.flow.targetIndex === target && i < 50;
        i++
      )
        store.answer(true, 'skip_timer')
      nativeWritingPayload(storage.getItem(store.key)!, context.identity.childId)
    }
    assert.equal(store.current.envelope.flow.teachingComplete, true)
    const reviewed = JSON.stringify(store.current.reviewedTrials)
    store.finishSession()
    assert.equal(store.current.assessments.length, 0)
    assert.equal(JSON.stringify(store.current.reviewedTrials), reviewed)
    assert.equal(teachingPosition(store.current.writing!), null)
    nativeWritingPayload(storage.getItem(store.key)!, context.identity.childId)
  })

  test(`${grade} native: old target continues, next target teaches; old client fails closed`, () => {
    const storage = memory(),
      old = openAcquisitionStore(storage, context, { ...options, writing: undefined })
    old.answer(true, 'timer')
    const oldFlow = JSON.stringify(old.current.envelope.flow)
    const upgraded = openAcquisitionStore(storage, context, options)
    assert.equal(JSON.stringify(upgraded.current.envelope.flow), oldFlow)
    assert.deepEqual(upgraded.current.assessments, old.current.assessments)
    assert.equal(teachingPosition(upgraded.current.writing!), null)
    const bytes = storage.getItem(old.key)
    assert.throws(() => openAcquisitionStore(storage, context), /Nothing was erased/)
    assert.equal(storage.getItem(old.key), bytes)
    assert.throws(() => old.answer(true, 'timer'), /another tab/)
    for (let i = 0; upgraded.current.envelope.flow.targetIndex === 0 && i < 50; i++) upgraded.answer(true, 'timer')
    assert.equal(teachingPosition(upgraded.current.writing!)?.targetIndex, 1)
  })

  test(`${grade} native: retry lost teaching/answer readback exactly, reject competing action and stale tab`, () => {
    const storage = memory(),
      store = openAcquisitionStore(storage, context, options)
    const stale = openAcquisitionStore(storage, context, options)
    const step = command(store),
      write = storage.setItem,
      read = storage.getItem
    let fail = false
    storage.getItem = (key) => {
      if (fail) {
        fail = false
        throw new Error('readback failed')
      }
      return read(key)
    }
    storage.setItem = (key, raw) => {
      write(key, raw)
      fail = true
    }
    assert.throws(() => store.completeTeachingStep(step), /readback failed/)
    assert.equal(store.current.writing!.revision, 0)
    assert.throws(() => store.answer(true, 'timer'), /pending writing save/)
    storage.setItem = write
    const savedBytes = read(store.key)
    store.completeTeachingStep(step)
    assert.equal(read(store.key), savedBytes)
    store.completeTeachingStep(step)
    assert.equal(store.current.writing!.revision, 1)
    assert.throws(() => stale.completeTeachingStep(step), /another tab/)
    teach(store)
    const before = store.current.envelope.revision
    storage.setItem = (key, raw) => {
      write(key, raw)
      fail = true
    }
    assert.throws(() => store.answer(true, 'timer'), /readback failed/)
    storage.setItem = write
    const answerBytes = read(store.key)
    store.answer(true, 'timer')
    assert.equal(read(store.key), answerBytes)
    assert.equal(store.current.envelope.revision, before + 1)
  })

  test(`${grade} native: partial Done retains teacher progress and native reviewed history`, () => {
    const storage = memory(),
      store = openAcquisitionStore(storage, context, options)
    store.completeTeachingStep(command(store))
    const firstVisit = store.current.sessionId
    store.finishSession()
    assert.notEqual(store.current.sessionId, firstVisit)
    assert.equal(teachingPosition(store.current.writing!)?.step, 1)
    teach(store)
    while (store.current.envelope.flow.prompt?.kind !== 'target') store.answer(true, 'timer')
    store.answer(false, 'skip_timer')
    assert.equal(teachingPosition(store.current.writing!), null)
    assert.equal(store.current.envelope.flow.phase, 'correction')
    const before = JSON.parse(JSON.stringify(store.current))
    const other = openAcquisitionStore(storage, context, { ...options, writerId: 'other-device' })
    const claimed = other.prepareResult()
    assert.notEqual(claimed.sessionId, before.sessionId)
    assert.deepEqual(claimed.writing, before.writing)
    assert.deepEqual(claimed.assessments, before.assessments)
    other.finishSession()
    const reopened = openAcquisitionStore(storage, context, options)
    assert.deepEqual(reopened.current.writing, before.writing)
    assert.deepEqual(reopened.current.reviewedTrials, before.reviewedTrials)
    assert.deepEqual(reopened.current.assessments, [])
  })

  test(`${grade} native: teacher-only cloud ordering, legacy conflict and invalid-owner preservation`, () => {
    const storage = memory(),
      store = openAcquisitionStore(storage, context, options)
    const first = storage.getItem(store.key)!
    store.completeTeachingStep(command(store))
    const second = storage.getItem(store.key)!
    assert.equal(chooseNativeWritingPayload(first, second, context.identity.childId, timestamp), 'online')
    assert.equal(chooseNativeWritingPayload(second, first, context.identity.childId, timestamp), 'local')
    assert.throws(() => nativeWritingPayload(second, 'other-child'), /invalid/)
    const broken = JSON.parse(second)
    broken.envelope.revision++
    assert.throws(() => nativeWritingPayload(JSON.stringify(broken), context.identity.childId), /disagree/)
    const legacy = JSON.parse(first)
    legacy.schema = 1
    delete legacy.writing
    assert.equal(chooseNativeWritingPayload(second, JSON.stringify(legacy), context.identity.childId, timestamp), null)
    assert.equal(chooseNativeWritingPayload(first, first, context.identity.childId, timestamp), null)
    assert.equal(chooseNativeWritingPayload(first, second, context.identity.childId, '2026-10-15T00:00:00.000Z'), null)
  })

  test(`${grade} native: teacher document changes do not replace the pinned lesson mid-attempt`, () => {
    const storage = memory(),
      store = openAcquisitionStore(storage, context, options)
    store.completeTeachingStep(command(store))
    const before = storage.getItem(store.key)
    const changed = { ...context, targetSet: { ...context.targetSet, targets: context.targetSet.targets.slice(1) } }
    const reopened = openAcquisitionStore(storage, changed, options)
    assert.equal(storage.getItem(store.key), before)
    assert.deepEqual(reopened.context.targetSet.targets, context.targetSet.targets)
    assert.equal(teachingPosition(reopened.current.writing!)?.step, 1)
  })

  test(`${grade} native: sync uploads teacher-only work and fresh device resumes; offline copies survive`, async () => {
    const storage = memory(),
      store = openAcquisitionStore(storage, context, options)
    const first = storage.getItem(store.key)!
    store.completeTeachingStep(command(store))
    const second = storage.getItem(store.key)!
    const id = createHash('sha256').update(store.key).digest('hex')
    const documentName = `projects/synthetic/databases/(default)/documents/families/test-family/children/native-child/betaPractice/${id}`
    let remote = first,
      writes = 0,
      offline = false
    const doc = () => ({
      name: documentName,
      updateTime: timestamp,
      fields: Object.fromEntries(
        Object.entries({
          schema: 1,
          childId: 'native-child',
          key: store.key,
          payload: remote,
          generation: 1,
        }).map(([key, value]) => [key, documentValue(value)]),
      ),
    })
    const repository = createDeviceSyncRepository({
      projectId: 'synthetic',
      familyId: 'test-family',
      token: async () => 'synthetic',
      fetchImpl: async (url, init) => {
        if (offline) throw new Error('offline')
        if (String(url).includes('/betaPractice?')) return Response.json({ documents: [doc()] })
        if (String(url).endsWith(':commit')) {
          remote = plainValue(JSON.parse(String(init?.body)).writes[0].update.fields.payload) as string
          writes++
          return Response.json({})
        }
        return Response.json(doc())
      },
    })
    const port = (m: ReturnType<typeof memory>) => ({
      ...m,
      get length() {
        return m.values.size
      },
      key: (i: number) => [...m.values.keys()][i] ?? null,
      removeItem: (key: string) => m.values.delete(key),
    })
    offline = true
    await assert.rejects(repository.sync(port(storage), 'native-child'), /offline/)
    assert.equal(storage.getItem(store.key), second)
    offline = false
    await repository.sync(port(storage), 'native-child')
    assert.equal(remote, second)
    assert.equal(writes, 1)
    const fresh = memory()
    await repository.sync(port(fresh), 'native-child')
    assert.equal(fresh.getItem(store.key), second)
    assert.equal(teachingPosition(openAcquisitionStore(fresh, context, options).current.writing!)?.step, 1)
    const bad = JSON.parse(remote)
    bad.writing.completedTeachingSteps[0]++
    remote = JSON.stringify(bad)
    const untouched = new Map(fresh.values)
    await assert.rejects(repository.sync(port(fresh), 'native-child'), /preserved/)
    assert.deepEqual(fresh.values, untouched)
    const legacy = JSON.parse(first)
    legacy.schema = 1
    delete legacy.writing
    remote = JSON.stringify(legacy)
    await assert.rejects(repository.sync(port(fresh), 'native-child'), PracticeSyncConflictError)
    assert.deepEqual(fresh.values, untouched)
  })
}
