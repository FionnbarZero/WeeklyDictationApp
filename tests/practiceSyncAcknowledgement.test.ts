import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { createDeviceSyncRepository } from '../src/familyBeta/deviceSync.ts'
import { documentValue, plainValue } from '../src/firestoreClient.ts'

const key = 'family-beta-activity:child:checkpoint'
const id = createHash('sha256').update(key).digest('hex')
const baseKey = `family-beta-sync-base-v1:family:child:${id}`
const pendingKey = `${baseKey}:pending`
const name = `projects/synthetic/databases/(default)/documents/families/family/children/child/betaPractice/${id}`

function fixture() {
  const values = new Map<string, string>([
    [key, 'new'],
    [baseKey, 'old'],
  ])
  const storage = {
    get length() {
      return values.size
    },
    key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  }
  let online = 'old',
    generation = 1,
    writes = 0
  let afterCommit = () => {}
  const doc = () => ({
    name,
    updateTime: '2026-10-07T20:00:00.000Z',
    fields: Object.fromEntries(
      Object.entries({ schema: 1, childId: 'child', key, payload: online, generation }).map(([k, v]) => [
        k,
        documentValue(v),
      ]),
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
        assert.equal(write.currentDocument.updateTime, '2026-10-07T20:00:00.000Z')
        online = plainValue(write.update.fields.payload) as string
        generation++
        writes++
        afterCommit()
        return Response.json({})
      }
      assert.ok(String(url).endsWith(`/betaPractice/${id}`))
      return Response.json(doc())
    },
  })
  return {
    values,
    storage,
    repository,
    writes: () => writes,
    afterCommit: (fn: () => void) => {
      afterCommit = fn
    },
  }
}

test('confirmed practice releases its redundant retry payload but retains baseline and checkpoint', async () => {
  const f = fixture()
  await f.repository.sync(f.storage, 'child')
  assert.equal(f.storage.getItem(key), 'new')
  assert.equal(f.storage.getItem(baseKey), 'new')
  assert.equal(f.storage.getItem(pendingKey), null)
  await f.repository.sync(f.storage, 'child')
  assert.equal(f.writes(), 1)
})

test('a lost upload response retains the retry payload until exact online readback', async () => {
  const f = fixture()
  f.afterCommit(() => {
    throw new Error('lost response')
  })
  await assert.rejects(f.repository.sync(f.storage, 'child'), /lost response/)
  assert.equal(f.storage.getItem(pendingKey), 'new')
  assert.equal(f.storage.getItem(baseKey), 'old')
  await f.repository.sync(f.storage, 'child')
  assert.equal(f.storage.getItem(baseKey), 'new')
  assert.equal(f.storage.getItem(pendingKey), null)
  assert.equal(f.writes(), 1)
})

test('a response lost while another answer is saved retries the newer checkpoint, never overwriting it', async () => {
  const f = fixture()
  f.afterCommit(() => {
    f.storage.setItem(key, 'newer answer')
    throw new Error('lost response')
  })
  await assert.rejects(f.repository.sync(f.storage, 'child'), /lost response/)
  f.afterCommit(() => {})
  await f.repository.sync(f.storage, 'child')
  assert.equal(f.writes(), 2)
  assert.equal(f.storage.getItem(key), 'newer answer')
  assert.equal(f.storage.getItem(baseKey), 'newer answer')
  assert.equal(f.storage.getItem(pendingKey), null)
})

test('acknowledging one snapshot does not remove another uploader’s pending payload', async () => {
  const f = fixture()
  f.afterCommit(() => {
    f.storage.setItem(key, 'newer answer')
    f.storage.setItem(pendingKey, 'newer answer')
  })
  await f.repository.sync(f.storage, 'child')
  assert.equal(f.storage.getItem(key), 'newer answer')
  assert.equal(f.storage.getItem(baseKey), 'new')
  assert.equal(f.storage.getItem(pendingKey), 'newer answer')
})

test('failed baseline readback retains the pending payload for recovery', async () => {
  const f = fixture()
  const write = f.storage.setItem
  f.storage.setItem = (key, value) => {
    if (key !== baseKey) write(key, value)
  }
  await assert.rejects(f.repository.sync(f.storage, 'child'), /acknowledgement/)
  assert.equal(f.storage.getItem(key), 'new')
  assert.equal(f.storage.getItem(baseKey), 'old')
  assert.equal(f.storage.getItem(pendingKey), 'new')
  f.storage.setItem = write
  await f.repository.sync(f.storage, 'child')
  assert.equal(f.storage.getItem(pendingKey), null)
  assert.equal(f.writes(), 1)
})
