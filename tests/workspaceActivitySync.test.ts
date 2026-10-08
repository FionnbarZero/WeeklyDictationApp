import assert from 'node:assert/strict'
import test from 'node:test'
import { createDeviceSyncRepository } from '../src/familyBeta/deviceSync.ts'
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
