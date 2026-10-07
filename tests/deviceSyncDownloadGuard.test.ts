import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { createDeviceSyncRepository } from '../src/familyBeta/deviceSync.ts'

const key = 'family-beta-activity:child:checkpoint'
const digest = (key: string) => createHash('sha256').update(key).digest('hex')
const baselineKey = (key: string) => `family-beta-sync-base-v1:family:child:${digest(key)}`

function harness(keys = [key]) {
  const values = new Map(
    keys.flatMap((key) => [
      [key, 'old'],
      [baselineKey(key), 'old'],
    ]),
  )
  const storage = {
    get length() {
      return values.size
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
  let started!: () => void
  const requested = new Promise<void>((resolve) => {
    started = resolve
  })
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const repository = createDeviceSyncRepository({
    projectId: 'synthetic-project',
    familyId: 'family',
    token: async () => 'synthetic-token',
    fetchImpl: async (url, init) => {
      assert.match(String(url), /\/child\/betaPractice\?pageSize=100$/)
      assert.equal(init?.method, undefined)
      started()
      await gate
      return Response.json({
        documents: keys.map((key) => ({
          name: `projects/synthetic-project/databases/(default)/documents/families/family/children/child/betaPractice/${digest(key)}`,
          updateTime: '2026-10-06T00:00:00Z',
          fields: {
            schema: { integerValue: '1' },
            childId: { stringValue: 'child' },
            key: { stringValue: key },
            payload: { stringValue: 'new' },
            generation: { integerValue: '2' },
          },
        })),
      })
    },
  })
  return { storage, repository, requested, release }
}

test('download guard observes ownership revoked while the response is pending', async () => {
  const { storage, repository, requested, release } = harness()
  let allowed = true
  const sync = repository.sync(storage, 'child', () => allowed)
  await requested
  allowed = false
  release()
  await assert.rejects(sync, /Newer practice is available/)
  assert.equal(storage.getItem(key), 'old')
  assert.equal(storage.getItem(baselineKey(key)), 'old')
})

test('download guard permits hydration when the current ownership check allows it', async () => {
  const { storage, repository, requested, release } = harness()
  let allowed = false
  const sync = repository.sync(storage, 'child', () => allowed)
  await requested
  allowed = true
  release()
  await sync
  assert.equal(storage.getItem(key), 'new')
  assert.equal(storage.getItem(baselineKey(key)), 'new')
})

test('download ownership is rechecked for each record, not just at the start of sync', async () => {
  const other = 'family-beta-activity:child:other-checkpoint'
  const { storage, repository, requested, release } = harness([key, other])
  let allowed = true
  const set = storage.setItem
  storage.setItem = (name, value) => {
    set(name, value)
    if (name === key) allowed = false
  }
  const sync = repository.sync(storage, 'child', () => allowed)
  await requested
  release()
  await assert.rejects(sync, /Newer practice is available/)
  assert.equal(storage.getItem(key), 'new')
  assert.equal(storage.getItem(baselineKey(key)), 'new')
  assert.equal(storage.getItem(other), 'old')
  assert.equal(storage.getItem(baselineKey(other)), 'old')
})
