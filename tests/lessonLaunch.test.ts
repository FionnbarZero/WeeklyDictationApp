import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { AcquisitionPersistenceContext } from '../src/acquisition/persistence/contracts.ts'
import { grade2AcquisitionStrategy } from '../src/acquisition/strategies/grade2.ts'
import { openAcquisitionStore } from '../src/familyBeta/acquisitionStore.ts'
import { type CurriculumSnapshot, inspectSnapshot, validateCurriculum } from '../src/familyBeta/curriculum.ts'
import {
  cacheLessonSource,
  listSavedLessons,
  readSavedLesson,
  rememberLessonLaunch,
} from '../src/familyBeta/lessonLaunch.ts'
import type { BetaProfile } from '../src/familyBeta/model.ts'

function memory() {
  const data = new Map<string, string>()
  return {
    data,
    get length() {
      return data.size
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
}
function fixture(slug = 'grade5', channel: 'writing' | 'reading' = 'writing') {
  const source = JSON.parse(
    readFileSync(new URL(`../public/curriculum/beta/${slug}.json`, import.meta.url), 'utf8'),
  ) as CurriculumSnapshot
  const profile: BetaProfile = { id: 'child-test', grade: source.grade, nickname: 'Test learner', active: true }
  const candidate = inspectSnapshot(source).candidates.find(
    (c) => c.status === 'valid' && (channel === 'writing' ? c.tier1 : c.tier2).length,
  )!
  const tier = channel === 'writing' ? 'tier-1' : 'tier-2'
  const context: AcquisitionPersistenceContext = {
    identity: {
      childId: profile.id,
      grade: source.grade,
      datasetId: candidate.datasetId!,
      schoolYear: '2026-27',
      activityModule: `${channel}-dojo`,
      tier,
    },
    targetSet: {
      id: candidate.datasetId!,
      targets: (channel === 'writing' ? candidate.tier1 : candidate.tier2).map((w) => ({
        id: w.targetOccurrenceId!,
        text: w.text,
        sentence: '',
        datasetId: candidate.datasetId!,
        language: 'mandarin',
        tier,
        activityType: channel === 'writing' ? 'dictation' : 'reading',
      })),
    },
    strategy: grade2AcquisitionStrategy,
    lifecycleStage: { kind: 'acquisition' },
    applicationVersion: 'test',
  }
  const storage = memory()
  const store = openAcquisitionStore(storage, context)
  const week = candidate.normalizedStartDate!
  rememberLessonLaunch(storage, profile, store.current.envelope, source, week)
  return { storage, store, source, profile, week }
}
for (const grade of ['kindergarten', 'grade2', 'grade5'])
  for (const channel of ['writing', 'reading'] as const) {
    test(`${grade} ${channel}: source-backed route finds the exact checkpoint without a current curriculum request`, async () => {
      const { storage, store, source, profile, week } = fixture(grade, channel)
      store.answer(false, 'test')
      const before = JSON.stringify([...storage.data])
      const { lessons, warnings } = await listSavedLessons(storage, profile)
      assert.deepEqual(warnings, [])
      assert.equal(lessons.length, 1)
      assert.equal(lessons[0].week, week)
      assert.equal(lessons[0].channel, channel)
      assert.deepEqual(lessons[0].source, source)
      assert.equal(JSON.stringify([...storage.data]), before)
      assert.deepEqual((await listSavedLessons(storage, { ...profile, id: 'other-child' })).lessons, [])
      await assert.rejects(readSavedLesson(storage, { ...profile, id: 'other-child' }, lessons[0]), /not been erased/)
    })
  }
test('a corrupt cached source blocks only its route and remains byte-for-byte preserved', async () => {
  const { storage, profile } = fixture()
  const key = [...storage.data.keys()].find((k) => k.includes(':lesson-source-v1:'))!
  const source = JSON.parse(storage.getItem(key)!)
  source.payload = { sourceType: 'google-slides', presentationId: source.sourceId, slides: [] }
  const corrupt = JSON.stringify(source)
  storage.setItem(key, corrupt)
  const result = await listSavedLessons(storage, profile)
  assert.equal(result.lessons.length, 0)
  assert.equal(result.warnings.length, 1)
  assert.equal(storage.getItem(key), corrupt)
})
test('index alone cannot resurrect a missing, archived, or replaced checkpoint', async () => {
  const { storage, store, profile } = fixture()
  storage.data.delete(store.key)
  assert.deepEqual((await listSavedLessons(storage, profile)).lessons, [])
})
test('earned DT and a finished lesson awaiting score completion retain their saved route', async () => {
  const { storage, store, profile } = fixture()
  let guard = 0
  while (!store.current.envelope.flow.complete && guard++ < 1000) store.answer(true, 'test')
  assert.equal(store.current.envelope.flow.teachingComplete, true)
  assert.equal(store.current.envelope.flow.complete, true)
  assert.equal((await listSavedLessons(storage, profile)).lessons.length, 1)
  store.finishSession()
  assert.equal(store.current.envelope.flow.teachingComplete, true)
  assert.equal(store.current.envelope.flow.complete, false)
  assert.ok(['earned-dt', 'familiar-dt'].includes(store.current.envelope.flow.prompt?.kind || ''))
  assert.equal((await listSavedLessons(storage, profile)).lessons.length, 1)
})
test('a malformed checkpoint cannot silently look like a missing lesson', async () => {
  const { storage, store, profile } = fixture()
  storage.setItem(store.key, '{}')
  const result = await listSavedLessons(storage, profile)
  assert.equal(result.lessons.length, 0)
  assert.equal(result.warnings.length, 1)
  assert.equal(storage.getItem(store.key), '{}')
})
test('source validation rejects a different grade and checksum changes', async () => {
  const { source } = fixture()
  await assert.rejects(validateCurriculum(JSON.stringify(source), 'Kindergarten'), /wrong grade/)
  source.contentSha256 = '0'.repeat(64)
  await assert.rejects(validateCurriculum(JSON.stringify(source), 'Grade 5'), /checksum/)
})
test('source cache preserves first metadata for repeated identical content', () => {
  const { source, storage, profile } = fixture()
  const before = JSON.stringify([...storage.data])
  cacheLessonSource(storage, profile.id, { ...source, retrievedAt: new Date().toISOString() })
  assert.equal(JSON.stringify([...storage.data]), before)
})
test('two devices caching the same content at different times produce identical sync records', () => {
  const { source, profile } = fixture()
  const first = memory(),
    second = memory()
  cacheLessonSource(first, profile.id, source)
  cacheLessonSource(second, profile.id, { ...source, retrievedAt: '2026-10-07T12:00:00.000Z' })
  assert.deepEqual([...first.data], [...second.data])
})
test('the actual saved cohort week wins over a later calendar week that repeats it', async () => {
  const { source, storage, profile, store, week } = fixture()
  for (const key of storage.data.keys()) if (key.includes(':lesson-launch-v1:')) storage.data.delete(key)
  rememberLessonLaunch(storage, profile, store.current.envelope, source, '2026-12-21')
  assert.equal((await listSavedLessons(storage, profile)).lessons[0].week, week)
})
test('failed writes and mismatched source binding never erase a checkpoint', () => {
  const { source, storage, store, profile, week } = fixture()
  const before = storage.getItem(store.key)
  const silent = { ...storage, getItem: () => null, setItem: () => {} }
  assert.throws(() => cacheLessonSource(silent, profile.id, source), /could not retain/)
  const other = { ...store.current.envelope, childId: 'other-child' }
  assert.throws(() => rememberLessonLaunch(storage, profile, other, source, week), /not been erased/)
  assert.equal(storage.getItem(store.key), before)
})
test('Grade 2 local workspace checkpoints are indexed without rewriting the workspace', async () => {
  const { storage, store, profile } = fixture('grade2')
  const raw = JSON.stringify({ acquisitionProgressEnvelopes: [store.current.envelope] })
  const key = `family-beta-activity:${profile.id}:weekly-dictation-state-v2`
  storage.setItem(key, raw)
  storage.data.delete(store.key)
  const listed = await listSavedLessons(storage, profile)
  assert.equal(listed.lessons.length, 1)
  assert.deepEqual(listed.warnings, [])
  assert.equal(storage.getItem(key), raw)
})
