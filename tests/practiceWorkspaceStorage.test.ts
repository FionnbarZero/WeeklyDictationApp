import assert from 'node:assert/strict'
import test from 'node:test'
import { createSharedWorkspace } from '../src/activity/sharedWorkspace.ts'
import { createInitialState } from '../src/domain.ts'
import {
  practiceWorkspaceKey,
  practiceWorkspaceStorage,
  readPracticeWorkspaceState,
} from '../src/familyBeta/practiceWorkspaceStorage.ts'
import { partitionWorkspaceState } from '../src/familyBeta/workspacePartition.ts'

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

test('adding a record to a full workspace fails before writing an unreadable snapshot', () => {
  const { storage } = fixture()
  const records = Object.fromEntries(
    Array.from({ length: 500 }, (_, index) => [`weekly-dictation-record-${index}`, `record-${index}`]),
  )
  storage.setItem(practiceWorkspaceKey('child'), JSON.stringify({ schema: 1, childId: 'child', records }))
  const before = storage.getItem(practiceWorkspaceKey('child'))
  const app = practiceWorkspaceStorage(storage, 'child')
  assert.throws(() => app.setItem('weekly-dictation-overflow', 'overflow'), /too many records/)
  assert.equal(storage.getItem(practiceWorkspaceKey('child')), before)
})

test('valid Grade 2 state is stored as separate history and checkpoint records and reconstructs exactly', () => {
  const { storage } = fixture()
  const app = practiceWorkspaceStorage(storage, 'child')
  const state = createInitialState()
  app.setItem('weekly-dictation-state-v2', JSON.stringify(state))
  const workspace = JSON.parse(storage.getItem(practiceWorkspaceKey('child'))!)
  assert.equal(workspace.records['weekly-dictation-state-v2'], undefined)
  assert.ok(workspace.records['weekly-dictation-history-v1'])
  assert.ok(workspace.records['weekly-dictation-checkpoint-v1'])
  assert.equal(app.getItem('weekly-dictation-history-v1'), null)
  assert.equal(app.getItem('weekly-dictation-checkpoint-v1'), null)
  assert.throws(() => app.setItem('weekly-dictation-history-v1', 'overwrite'), /preserved/)
  assert.throws(() => app.removeItem('weekly-dictation-checkpoint-v1'), /preserved/)
  assert.deepEqual(JSON.parse(app.getItem('weekly-dictation-state-v2')!), state)
  assert.deepEqual(JSON.parse(readPracticeWorkspaceState(storage, 'child')!), state)
})

test('oversized embedded state fails closed without rewriting the prior workspace', () => {
  const { storage } = fixture()
  const app = practiceWorkspaceStorage(storage, 'child')
  const state = createInitialState()
  state.results = Array.from({ length: 501 }, (_, index) => ({
    id: `result-${index}`,
    childId: 'child',
    datasetId: 'dataset',
    datasetDateRange: '2026-10-06-2026-10-12',
    wordId: `word-${index}`,
    grade: 'Grade 2',
    phase: 'acquisition',
    sessionId: 'session',
    sessionDate: '2026-10-08',
    completedAt: '2026-10-08T00:00:00.000Z',
    correct: true,
    revealMethod: 'timer',
    scored: true,
    completeSourceDatasetReviewed: true,
  }))
  const before = storage.getItem(practiceWorkspaceKey('child'))
  assert.throws(() => app.setItem('weekly-dictation-state-v2', JSON.stringify(state)), /preserved/)
  assert.equal(storage.getItem(practiceWorkspaceKey('child')), before)
})

test('oversized nested embedded collections fail closed without rewriting the prior workspace', () => {
  const { storage } = fixture()
  const app = practiceWorkspaceStorage(storage, 'child')
  const state = createInitialState()
  state.warmupVisitsV1 = [
    {
      schemaVersion: 1,
      contractId: 'adaptive-warmup-visit-v1',
      id: 'visit-1',
      childId: 'child',
      queue: Array.from({ length: 501 }, (_, index) => ({ id: `queue-${index}` })) as never,
      revision: 0,
      status: 'complete',
    } as never,
  ]
  const before = storage.getItem(practiceWorkspaceKey('child'))
  assert.throws(() => app.setItem('weekly-dictation-state-v2', JSON.stringify(state)), /preserved/)
  assert.equal(storage.getItem(practiceWorkspaceKey('child')), before)
})

test('Grade 2 acquisition checkpoints are stored per activity and reconstruct exactly', () => {
  const { storage } = fixture()
  const app = practiceWorkspaceStorage(storage, 'child')
  const state = createInitialState()
  state.acquisitionProgressions = [
    {
      id: 'activity/a',
      childId: 'child',
      datasetId: 'week-a',
      grade: 'Grade 2',
      flow: {} as never,
      updatedAt: '2026-10-08T00:00:00.000Z',
    },
  ]
  app.setItem('weekly-dictation-state-v2', JSON.stringify(state))
  const workspace = JSON.parse(storage.getItem(practiceWorkspaceKey('child'))!)
  const activityKeys = Object.keys(workspace.records).filter((key) =>
    key.startsWith('weekly-dictation-checkpoint-v1:activity:'),
  )
  assert.deepEqual(activityKeys, ['weekly-dictation-checkpoint-v1:activity:activity%2Fa'])
  assert.equal(app.getItem(activityKeys[0]), null)
  assert.deepEqual(JSON.parse(app.getItem('weekly-dictation-state-v2')!), state)
  assert.deepEqual(JSON.parse(readPracticeWorkspaceState(storage, 'child')!), state)
})

test('legacy bundled checkpoint arrays remain readable during activity migration', () => {
  const { storage } = fixture()
  const state = createInitialState()
  state.acquisitionProgressions = [
    {
      id: 'legacy-activity',
      childId: 'child',
      datasetId: 'week-a',
      grade: 'Grade 2',
      flow: {} as never,
      updatedAt: '2026-10-08T00:00:00.000Z',
    },
  ]
  const partition = partitionWorkspaceState(state)
  const records = {
    'weekly-dictation-history-v1': JSON.stringify({
      schema: 1,
      childId: 'child',
      values: { ...partition.metadata, ...partition.history },
    }),
    'weekly-dictation-checkpoint-v1': JSON.stringify({
      schema: 1,
      childId: 'child',
      values: { ...partition.metadata, ...partition.checkpoint },
    }),
  }
  storage.setItem(practiceWorkspaceKey('child'), JSON.stringify({ schema: 1, childId: 'child', records }))
  assert.deepEqual(JSON.parse(practiceWorkspaceStorage(storage, 'child').getItem('weekly-dictation-state-v2')!), state)
})

test('malformed or orphaned activity checkpoint records fail closed', () => {
  const { storage } = fixture()
  const app = practiceWorkspaceStorage(storage, 'child')
  app.setItem('weekly-dictation-state-v2', JSON.stringify(createInitialState()))
  const key = practiceWorkspaceKey('child')
  const workspace = JSON.parse(storage.getItem(key)!)
  workspace.records['weekly-dictation-checkpoint-v1:activity:orphan'] = '{'
  storage.setItem(key, JSON.stringify(workspace))
  assert.throws(() => practiceWorkspaceStorage(storage, 'child').getItem('weekly-dictation-state-v2'), /preserved/)
})

test('partitioned state remains writable through the shared workspace after reconstruction', () => {
  const { storage } = fixture()
  const state = createInitialState()
  const app = practiceWorkspaceStorage(storage, 'child')
  const owner = createSharedWorkspace(state, app, 'weekly-dictation-state-v2')
  const first = { ...state, rotationCycles: { first: 1 } }
  assert.equal(owner.save(state, first), true)
  const second = { ...first, rotationCycles: { first: 2 } }
  assert.equal(owner.save(first, second), true)
  assert.deepEqual(JSON.parse(app.getItem('weekly-dictation-state-v2')!), second)
})

test('shared workspace accepts canonicalized property order after partition reconstruction', () => {
  const { storage } = fixture()
  const state = createInitialState()
  state.warmupVisitsV1 = [
    {
      schemaVersion: 1,
      contractId: 'adaptive-warmup-visit-v1',
      id: 'visit-1',
      childId: 'child',
      queue: [],
      revision: 0,
      status: 'complete',
    } as never,
  ]
  state.adaptiveWarmup = {}
  const app = practiceWorkspaceStorage(storage, 'child')
  const owner = createSharedWorkspace(state, app, 'weekly-dictation-state-v2')
  const next = { ...state, warmupVisitsV1: [...state.warmupVisitsV1, { ...state.warmupVisitsV1[0], id: 'visit-2' }] }
  assert.equal(owner.save(state, next), true)
  const final = { ...next, warmupVisitsV1: [...next.warmupVisitsV1, { ...next.warmupVisitsV1[0], id: 'visit-3' }] }
  assert.equal(owner.save(next, final), true)
  assert.deepEqual(JSON.parse(app.getItem('weekly-dictation-state-v2')!), final)
})

test('partition records count as one logical state record for the workspace ceiling', () => {
  const { storage } = fixture()
  const app = practiceWorkspaceStorage(storage, 'child')
  app.setItem('weekly-dictation-state-v2', JSON.stringify(createInitialState()))
  for (let index = 0; index < 498; index += 1) app.setItem(`weekly-dictation-extra-${index}`, `record-${index}`)
  assert.equal(app.length, 500)
  assert.throws(() => app.setItem('weekly-dictation-overflow', 'overflow'), /too many records/)
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
