import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { createInitialState } from '../src/domain.ts'
import { createDeviceSyncRepository, PracticeSyncConflictError } from '../src/familyBeta/deviceSync.ts'
import {
  practiceWorkspaceKey,
  practiceWorkspaceSyncAdapter,
  practiceWorkspaceSyncKey,
} from '../src/familyBeta/practiceWorkspaceStorage.ts'
import { documentValue, plainValue } from '../src/firestoreClient.ts'

const childId = 'child'
const familyId = 'family'
const projectId = 'synthetic'
const workspace = practiceWorkspaceKey(childId)

function activity(activityId: string, sessionId: string, occurredAt: string) {
  return JSON.stringify({
    schema: 1,
    childId,
    activityId,
    values: {
      acquisitionProgressions: [],
      acquisitionProgressEnvelopes: [],
      acquisitionTransitionReceipts: [],
      acquisitionPendingCheckpoints: [{ sessionId, occurredAt }],
    },
  })
}

function initialPayload() {
  return JSON.stringify({
    schema: 1,
    childId,
    records: {
      'weekly-dictation-history-v1': JSON.stringify({ schema: 1, childId, values: {} }),
      'weekly-dictation-checkpoint-v1': JSON.stringify({ schema: 1, childId, values: {} }),
      'weekly-dictation-checkpoint-v1:activity:a': activity('a', 'a-0', '2026-10-08T00:00:00.000Z'),
      'weekly-dictation-checkpoint-v1:activity:b': activity('b', 'b-0', '2026-10-08T00:00:00.000Z'),
    },
  })
}

function device() {
  const records = new Map<string, string>()
  return {
    get length() {
      return records.size
    },
    key: (index: number) => [...records.keys()][index] ?? null,
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value)
    },
    removeItem: (key: string) => {
      records.delete(key)
    },
  }
}

function serverHarness() {
  const docs = new Map<string, { key: string; payload: string; generation: number; updateTime: string }>()
  let clock = 0
  const repository = createDeviceSyncRepository({
    projectId,
    familyId,
    token: async () => 'synthetic',
    fetchImpl: async (url, init) => {
      const text = String(url)
      if (text.includes('/betaPractice?')) {
        const documents = [...docs].map(([id, value]) => ({
          name: `projects/${projectId}/databases/(default)/documents/families/${familyId}/children/${childId}/betaPractice/${id}`,
          updateTime: value.updateTime,
          fields: Object.fromEntries(
            Object.entries({
              schema: 1,
              childId,
              key: value.key,
              payload: value.payload,
              generation: value.generation,
            }).map(([field, value]) => [field, documentValue(value)]),
          ),
        }))
        return Response.json({ documents })
      }
      if (text.endsWith(':commit')) {
        const writes = JSON.parse(String(init?.body)).writes as Array<{
          update: { name: string; fields: Record<string, unknown> }
        }>
        for (const write of writes) {
          const fields = Object.fromEntries(
            Object.entries(write.update.fields).map(([key, value]) => [
              key,
              plainValue(value as Parameters<typeof plainValue>[0]),
            ]),
          ) as { key: string; payload: string; generation: number }
          const id = write.update.name.split('/').pop()!
          clock += 1
          docs.set(id, {
            key: fields.key,
            payload: fields.payload,
            generation: fields.generation,
            updateTime: `2026-10-08T00:00:${String(clock).padStart(2, '0')}.000Z`,
          })
        }
        return Response.json({})
      }
      const id = text.split('/').pop()!
      const value = docs.get(id)
      return value
        ? Response.json({
            updateTime: value.updateTime,
            fields: Object.fromEntries(
              Object.entries({
                schema: 1,
                childId,
                key: value.key,
                payload: value.payload,
                generation: value.generation,
              }).map(([field, item]) => [field, documentValue(item)]),
            ),
          })
        : new Response('', { status: 404 })
    },
  })
  return { repository, docs }
}

function setWorkspace(store: ReturnType<typeof device>, raw = initialPayload()) {
  store.setItem(workspace, raw)
}

const invalidPartitions = [
  ['weekly-dictation-history-v1', '{'],
  ['weekly-dictation-checkpoint-v1', '{'],
  ['weekly-dictation-checkpoint-v1:activity:a', '{'],
  ['weekly-dictation-checkpoint-v1', JSON.stringify({ schema: 1, childId: 'other', values: {} })],
  ['weekly-dictation-checkpoint-v1', JSON.stringify({ schema: 2, childId, values: {} })],
  ['weekly-dictation-checkpoint-v1', JSON.stringify({ schema: 1, childId, values: [] })],
  ['weekly-dictation-checkpoint-v1', JSON.stringify({ schema: 1, childId, values: { nested: Array(501).fill(0) } })],
  ['weekly-dictation-checkpoint-v1:activity:a', activity('wrong-activity', 'a', '2026-10-08T00:00:00.000Z')],
] as const

for (const [index, [record, invalid]] of invalidPartitions.entries()) {
  test(`invalid remote partition ${index} fails validation before conflict fallback or any device mutation`, async () => {
    const store = device()
    setWorkspace(store)
    const { repository, docs } = serverHarness()
    await repository.sync(store, childId)
    const key = practiceWorkspaceSyncKey(childId, record)
    const id = createHash('sha256').update(key).digest('hex')
    // Force a two-copy conflict, which formerly bypassed stage validation.
    store.setItem(`family-beta-sync-base-v1:${familyId}:${childId}:${id}`, 'divergent baseline')
    docs.get(id)!.payload = invalid
    const before = Array.from({ length: store.length }, (_, i) => [store.key(i)!, store.getItem(store.key(i)!)])
    const online = JSON.stringify([...docs])
    await assert.rejects(
      repository.sync(store, childId),
      (error) =>
        error instanceof Error && !(error instanceof PracticeSyncConflictError) && /preserved/.test(error.message),
    )
    assert.deepEqual(
      Array.from({ length: store.length }, (_, i) => [store.key(i)!, store.getItem(store.key(i)!)]),
      before,
    )
    assert.equal(JSON.stringify([...docs]), online)
  })
}

test('an earlier ordinary conflict cannot hide an invalid remote partition later in the response', async () => {
  const store = device()
  setWorkspace(store)
  const { repository, docs } = serverHarness()
  await repository.sync(store, childId)
  const key = practiceWorkspaceSyncKey(childId, 'weekly-dictation-checkpoint-v1')
  const id = createHash('sha256').update(key).digest('hex')
  const remote = [...docs]
  docs.clear()
  const opaque = `family-beta-activity:${childId}:legacy-opaque`
  const opaqueId = createHash('sha256').update(opaque).digest('hex')
  docs.set(opaqueId, { key: opaque, payload: 'remote', generation: 1, updateTime: '2026-10-08T00:00:00.000Z' })
  for (const [key, value] of remote) docs.set(key, value)
  docs.get(id)!.payload = '{'
  store.setItem(opaque, 'local')
  const before = store.getItem(workspace)
  await assert.rejects(
    repository.sync(store, childId),
    (error) =>
      error instanceof Error && !(error instanceof PracticeSyncConflictError) && /preserved/.test(error.message),
  )
  assert.equal(store.getItem(workspace), before)
  assert.equal(store.getItem(opaque), 'local')
  assert.equal(docs.get(opaqueId)!.payload, 'remote')
})

test('valid divergent partitions without reviewed answers still report a continuable conflict', async () => {
  const store = device()
  setWorkspace(store)
  const { repository, docs } = serverHarness()
  await repository.sync(store, childId)
  const key = practiceWorkspaceSyncKey(childId, 'weekly-dictation-checkpoint-v1')
  const id = createHash('sha256').update(key).digest('hex')
  const remote = JSON.stringify({ schema: 1, childId, values: { acquisitionPendingCheckpoints: [] } })
  docs.get(id)!.payload = remote
  store.setItem(`family-beta-sync-base-v1:${familyId}:${childId}:${id}`, 'divergent baseline')
  const before = store.getItem(workspace)
  await assert.rejects(repository.sync(store, childId), PracticeSyncConflictError)
  assert.equal(store.getItem(workspace), before)
  assert.equal(docs.get(id)!.payload, remote)
})

test('workspace sync exposes partitioned records and commits remote activity atomically', async () => {
  const first = device(),
    second = device()
  setWorkspace(first)
  const { repository } = serverHarness()
  await repository.sync(first, childId)
  await repository.sync(second, childId)
  assert.deepEqual(
    JSON.parse(second.getItem(workspace)!),
    JSON.parse(first.getItem(workspace)!),
    'logical records should be hydrated through one workspace adapter commit',
  )
})

test('workspace adapter names records without exposing them through normal Storage keys', () => {
  const store = device()
  setWorkspace(store)
  const adapter = practiceWorkspaceSyncAdapter(store, childId)
  assert.ok(adapter)
  const keys = adapter!.keys()
  assert.equal(keys.includes(practiceWorkspaceSyncKey(childId, 'weekly-dictation-history-v1')), true)
  assert.equal(store.key(0), workspace)
  assert.equal(adapter!.read(keys.find((key) => key.endsWith('%3Aactivity%3Aa')) || '')?.includes('a-0'), true)
})

test('legacy workspace normalization is deferred and cannot overwrite a newer snapshot', () => {
  const store = device()
  const state = createInitialState()
  const legacy = JSON.stringify({
    schema: 1,
    childId,
    records: { 'weekly-dictation-state-v2': JSON.stringify(state) },
  })
  store.setItem(workspace, legacy)
  const adapter = practiceWorkspaceSyncAdapter(store, childId)
  assert.ok(adapter)
  assert.equal(store.getItem(workspace), legacy, 'opening the adapter must not write a migration')

  const newer = JSON.stringify({
    schema: 1,
    childId,
    records: { 'weekly-dictation-state-v2': JSON.stringify({ ...state, rotationCycles: { child: 1 } }) },
  })
  store.setItem(workspace, newer)
  assert.throws(() => adapter!.commit(), /preserved/)
  assert.equal(store.getItem(workspace), newer, 'a newer snapshot must survive a stale migration commit')
})

test('sync adapter rejects oversized nested activity payloads before staging them', () => {
  const store = device()
  setWorkspace(store)
  const adapter = practiceWorkspaceSyncAdapter(store, childId)
  assert.ok(adapter)
  const payload = JSON.parse(activity('a', 'a-oversized', '2026-10-08T00:05:00.000Z')) as {
    values: { acquisitionPendingCheckpoints: unknown[] }
  }
  payload.values.acquisitionPendingCheckpoints = Array.from({ length: 501 }, (_, index) => ({ id: index }))
  const key = practiceWorkspaceSyncKey(childId, 'weekly-dictation-checkpoint-v1:activity:a')
  assert.throws(() => adapter!.stage(key, JSON.stringify(payload)), /preserved/)
})

test('sync adapter rejects an oversized nested activity already on the device', () => {
  const store = device()
  const payload = JSON.parse(activity('a', 'a-oversized', '2026-10-08T00:05:00.000Z')) as {
    values: { acquisitionPendingCheckpoints: unknown[] }
  }
  payload.values.acquisitionPendingCheckpoints = Array.from({ length: 501 }, (_, index) => ({ id: index }))
  const raw = JSON.parse(initialPayload())
  raw.records['weekly-dictation-checkpoint-v1:activity:a'] = JSON.stringify(payload)
  setWorkspace(store, JSON.stringify(raw))
  assert.throws(() => practiceWorkspaceSyncAdapter(store, childId), /preserved/)
})

test('different activity checkpoints reconcile independently, while the same activity chooses newest reviewed work', async () => {
  const first = device(),
    second = device()
  setWorkspace(first)
  const { repository } = serverHarness()
  await repository.sync(first, childId)
  await repository.sync(second, childId)
  let firstAdapter = practiceWorkspaceSyncAdapter(first, childId)!
  let secondAdapter = practiceWorkspaceSyncAdapter(second, childId)!
  const aKey = practiceWorkspaceSyncKey(childId, 'weekly-dictation-checkpoint-v1:activity:a')
  const bKey = practiceWorkspaceSyncKey(childId, 'weekly-dictation-checkpoint-v1:activity:b')
  firstAdapter.stage(aKey, activity('a', 'a-1', '2026-10-08T00:01:00.000Z'))
  firstAdapter.commit()
  secondAdapter.stage(bKey, activity('b', 'b-1', '2026-10-08T00:02:00.000Z'))
  secondAdapter.commit()
  await repository.sync(first, childId)
  await repository.sync(second, childId)
  assert.match(JSON.parse(second.getItem(workspace)!).records['weekly-dictation-checkpoint-v1:activity:b'], /b-1/)
  assert.match(JSON.parse(second.getItem(workspace)!).records['weekly-dictation-checkpoint-v1:activity:a'], /a-1/)
  await repository.sync(first, childId)
  assert.match(JSON.parse(first.getItem(workspace)!).records['weekly-dictation-checkpoint-v1:activity:b'], /b-1/)

  firstAdapter = practiceWorkspaceSyncAdapter(first, childId)!
  secondAdapter = practiceWorkspaceSyncAdapter(second, childId)!
  firstAdapter.stage(aKey, activity('a', 'a-2', '2026-10-08T00:03:00.000Z'))
  firstAdapter.commit()
  secondAdapter.stage(aKey, activity('a', 'a-3', '2026-10-08T00:04:00.000Z'))
  secondAdapter.commit()
  await repository.sync(first, childId)
  await repository.sync(second, childId)
  assert.match(JSON.parse(second.getItem(workspace)!).records['weekly-dictation-checkpoint-v1:activity:a'], /a-3/)
  await repository.sync(first, childId)
  assert.match(JSON.parse(first.getItem(workspace)!).records['weekly-dictation-checkpoint-v1:activity:a'], /a-3/)
})
