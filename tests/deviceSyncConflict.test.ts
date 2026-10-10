import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { createDeviceSyncRepository } from '../src/familyBeta/deviceSync.ts'
import { documentValue, plainValue } from '../src/firestoreClient.ts'

const key = 'family-beta-acquisition-v1:child:week'
const digest = createHash('sha256').update(key).digest('hex')
const baseKey = `family-beta-sync-base-v1:family:child:${digest}`
const name = `projects/synthetic/databases/(default)/documents/families/family/children/child/betaPractice/${digest}`

function payload(sessionId: string, reviewedAt?: string, writerId = sessionId, reviewedSessionId = sessionId) {
  return JSON.stringify({
    sessionId,
    writerId,
    envelope: { childId: 'child' },
    reviewedTrials: reviewedAt ? [{ sessionId: reviewedSessionId, reviewedAt }] : [],
  })
}

function fixture(local: string, baseline: string, online: string) {
  const values = new Map<string, string>([[key, local], [baseKey, baseline]])
  let remote = online
  let writes = 0
  const storage = {
    get length() { return values.size },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => values.set(name, value),
    removeItem: (name: string) => values.delete(name),
  }
  const doc = () => ({
    name,
    updateTime: '2026-10-08T00:00:00.000Z',
    fields: Object.fromEntries(
      Object.entries({ schema: 1, childId: 'child', key, payload: remote, generation: 2 }).map(([field, value]) => [field, documentValue(value)]),
    ),
  })
  const repository = createDeviceSyncRepository({
    projectId: 'synthetic',
    familyId: 'family',
    token: async () => 'synthetic',
    fetchImpl: async (url, init) => {
      if (String(url).includes('/betaPractice?')) return Response.json({ documents: [doc()] })
      if (String(url).endsWith(':commit')) {
        const write = JSON.parse(String(init!.body)).writes[0]
        assert.equal(write.currentDocument.updateTime, '2026-10-08T00:00:00.000Z')
        remote = plainValue(write.update.fields.payload) as string
        writes += 1
        return Response.json({})
      }
      return Response.json(doc())
    },
  })
  return { storage, repository, writes: () => writes, remote: () => remote }
}

test('newest reviewed acquisition checkpoint replaces the remote unfinished copy', async () => {
  const local = payload('local', '2026-10-07T04:00:00.000Z')
  const remote = payload('remote', '2026-10-07T03:00:00.000Z')
  const f = fixture(local, payload('baseline', '2026-10-07T02:00:00.000Z'), remote)
  await f.repository.sync(f.storage, 'child')
  assert.equal(f.writes(), 1)
  assert.equal(f.remote(), local)
  assert.equal(f.storage.getItem(baseKey), local)
})

test('newest reviewed remote acquisition checkpoint wins without merging local fields', async () => {
  const local = payload('local', '2026-10-07T03:00:00.000Z')
  const remote = payload('remote', '2026-10-07T04:00:00.000Z')
  const f = fixture(local, payload('baseline', '2026-10-07T02:00:00.000Z'), remote)
  await f.repository.sync(f.storage, 'child')
  assert.equal(f.writes(), 0)
  assert.equal(f.storage.getItem(key), remote)
  assert.equal(f.storage.getItem(baseKey), remote)
})

test('competing acquisition checkpoints without reviewed answers remain blocked', async () => {
  const local = payload('local')
  const remote = payload('remote')
  const f = fixture(local, payload('baseline'), remote)
  await assert.rejects(f.repository.sync(f.storage, 'child'), /one reviewed response/)
  assert.equal(f.writes(), 0)
  assert.equal(f.storage.getItem(key), local)
})

test('historical reviewed answers from a prior session cannot arbitrate a new checkpoint', async () => {
  const local = payload('local', '2026-10-07T04:00:00.000Z', 'local', 'previous-session')
  const remote = payload('remote')
  const f = fixture(local, payload('baseline'), remote)
  await assert.rejects(f.repository.sync(f.storage, 'child'), /one reviewed response/)
  assert.equal(f.writes(), 0)
  assert.equal(f.storage.getItem(key), local)
})

test('checkpoint arbitration uses the shared Firestore update time for clock skew', async () => {
  const local = payload('local', '2026-10-08T00:04:00.000Z')
  const remote = payload('remote', '2026-10-08T00:01:00.000Z')
  const f = fixture(local, payload('baseline', '2026-10-07T23:59:00.000Z'), remote)
  await f.repository.sync(f.storage, 'child')
  assert.equal(f.writes(), 1)
  assert.equal(f.remote(), local)
})
