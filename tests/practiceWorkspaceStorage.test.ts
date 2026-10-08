import assert from 'node:assert/strict'
import test from 'node:test'
import {
  practiceWorkspaceKey,
  practiceWorkspaceStorage,
  readPracticeWorkspaceState,
} from '../src/familyBeta/practiceWorkspaceStorage.ts'

function fixture() {
  const records = new Map<string, string>()
  const storage = {
    get length() {
      return records.size
    },
    key: (index: number) => [...records.keys()][index] ?? null,
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value)
    },
  }
  const original = 'family-beta-activity:child:weekly-dictation-state-v2'
  const pending = 'family-beta-activity:child:weekly-dictation-acquisition-pending-v1'
  storage.setItem(original, '{"original":"reviewed history"}')
  storage.setItem(pending, '["unacknowledged answer"]')
  storage.setItem('weekly-dictation-auth-v1', 'private-credential-never-copy')
  storage.setItem('family-beta-activity:other:weekly-dictation-state-v2', 'other child')
  return { records, storage, original, pending }
}

test('one atomic copy retains original state and recovery journals without changing legacy records', () => {
  const { records, storage, original, pending } = fixture()
  const before = new Map(records)
  const app = practiceWorkspaceStorage(storage, 'child')
  assert.equal(app.getItem('weekly-dictation-state-v2'), before.get(original))
  assert.equal(app.getItem('weekly-dictation-acquisition-pending-v1'), before.get(pending))
  assert.equal(records.size, before.size + 1)
  for (const [key, value] of before) assert.equal(storage.getItem(key), value)
  assert.doesNotMatch(storage.getItem(practiceWorkspaceKey('child'))!, /private-credential|other child/)
  app.setItem('weekly-dictation-state-v2', '{"curriculumRevision":"new edition"}')
  app.removeItem('weekly-dictation-acquisition-pending-v1')
  assert.equal(storage.getItem(original), before.get(original))
  assert.equal(storage.getItem(pending), before.get(pending))
  assert.equal(readPracticeWorkspaceState(storage, 'child'), '{"curriculumRevision":"new edition"}')
})

test('older clients can normalize their original key without replacing the upgraded workspace', () => {
  const { storage, original } = fixture()
  const app = practiceWorkspaceStorage(storage, 'child')
  app.setItem('weekly-dictation-state-v2', '{"curriculumRevision":"new reviewed answer"}')
  const retained = storage.getItem(practiceWorkspaceKey('child'))
  storage.setItem(original, '{"olderClientNormalized":"legacy only"}')
  assert.equal(
    practiceWorkspaceStorage(storage, 'child').getItem('weekly-dictation-state-v2'),
    '{"curriculumRevision":"new reviewed answer"}',
  )
  assert.equal(storage.getItem(practiceWorkspaceKey('child')), retained)
})

test('failed copying cannot expose a partial workspace, and a successful retry copies pending work', () => {
  const { records, storage } = fixture()
  const before = [...records]
  assert.throws(
    () =>
      practiceWorkspaceStorage(
        {
          ...storage,
          setItem: () => {
            throw new Error('quota')
          },
        },
        'child',
      ),
    /quota/,
  )
  assert.deepEqual([...records], before)
  assert.throws(() => practiceWorkspaceStorage({ ...storage, setItem: () => {} }, 'child'), /preserved/)
  assert.deepEqual([...records], before)
  assert.equal(
    practiceWorkspaceStorage(storage, 'child').getItem('weekly-dictation-acquisition-pending-v1'),
    '["unacknowledged answer"]',
  )
})

test('corrupt or foreign upgraded records fail closed instead of falling back to an old copy', () => {
  const { storage } = fixture()
  for (const raw of ['{', 'null', JSON.stringify({ schema: 1, childId: 'other', records: {} })]) {
    storage.setItem(practiceWorkspaceKey('child'), raw)
    assert.throws(() => practiceWorkspaceStorage(storage, 'child'))
    assert.throws(() => readPracticeWorkspaceState(storage, 'child'))
    assert.equal(storage.getItem(practiceWorkspaceKey('child')), raw)
  }
})

test('a workspace over the record ceiling fails closed without evicting legacy records', () => {
  const { records, storage } = fixture()
  for (let index = 0; index < 501; index += 1)
    storage.setItem(`family-beta-activity:child:weekly-dictation-extra-${index}`, `record-${index}`)
  const before = new Map(records)
  assert.throws(() => practiceWorkspaceStorage(storage, 'child'), /too many records/)
  assert.deepEqual(records, before)
  assert.equal(storage.getItem(practiceWorkspaceKey('child')), null)
})

test('state and journal writes share the latest atomic record; quota does not erase the previous snapshot', () => {
  const { storage } = fixture()
  const one = practiceWorkspaceStorage(storage, 'child')
  const two = practiceWorkspaceStorage(storage, 'child')
  one.setItem('weekly-dictation-state-v2', 'new checkpoint')
  two.setItem('weekly-dictation-warmup-pending-v1', 'next journal')
  assert.equal(one.getItem('weekly-dictation-state-v2'), 'new checkpoint')
  assert.equal(one.getItem('weekly-dictation-warmup-pending-v1'), 'next journal')
  const before = storage.getItem(practiceWorkspaceKey('child'))
  assert.throws(() => one.setItem('weekly-dictation-state-v2', 'x'.repeat(700_000)), /safe syncing limit/)
  assert.equal(storage.getItem(practiceWorkspaceKey('child')), before)
})
