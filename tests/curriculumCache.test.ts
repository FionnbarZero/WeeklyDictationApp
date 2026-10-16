import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fetchCurriculum, validateCurriculum, type CurriculumSnapshot } from '../src/familyBeta/curriculum.ts'
import { readRetainedCurriculum, retainValidatedCurriculum } from '../src/familyBeta/curriculumCache.ts'

function memory() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}
function source(slug: string) {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/dojo-launch-2026-10-16/${slug}.json`, import.meta.url), 'utf8'),
  ) as CurriculumSnapshot
}
for (const slug of ['kindergarten', 'grade2', 'grade5']) {
  test(`${slug}: validated teacher cache restores the ordinary entry inputs without touching progress`, async () => {
    const storage = memory(),
      snapshot = source(slug)
    const original = await validateCurriculum(JSON.stringify(snapshot), snapshot.grade)
    storage.setItem('unrelated-progress', 'preserved')
    retainValidatedCurriculum(storage, original.snapshot)
    const before = [...storage.values]
    const offline = await readRetainedCurriculum(storage, snapshot.grade)
    assert.deepEqual(offline.snapshot, original.snapshot)
    assert.deepEqual(offline.datasets, original.datasets)
    assert.match(offline.warnings.at(-1)!, /last validated teacher lesson/)
    assert.deepEqual([...storage.values], before)
  })
}
test('missing, wrong-grade, corrupted and aborted caches cannot silently select a different lesson', async () => {
  const storage = memory(),
    snapshot = source('kindergarten')
  await assert.rejects(readRetainedCurriculum(storage, snapshot.grade), /Reconnect/)
  retainValidatedCurriculum(storage, snapshot)
  await assert.rejects(readRetainedCurriculum(storage, 'Grade 2'), /Reconnect/)
  const key = [...storage.values.keys()][0]
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(readRetainedCurriculum(storage, snapshot.grade, controller.signal), /abort/i)
  storage.setItem(key, JSON.stringify({ ...source('grade2') }))
  await assert.rejects(readRetainedCurriculum(storage, snapshot.grade), /wrong grade/)
  storage.setItem(key, JSON.stringify({ ...snapshot, contentSha256: '0'.repeat(64) }))
  const before = [...storage.values]
  await assert.rejects(readRetainedCurriculum(storage, snapshot.grade), /checksum/)
  assert.deepEqual([...storage.values], before)
})

test('body connection loss reuses retained curriculum but body abort and invalid bytes remain rejected', async (t) => {
  const storage = memory(),
    snapshot = source('kindergarten')
  retainValidatedCurriculum(storage, snapshot)
  const before = [...storage.values]
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  })
  const brokenBody = (error: Error) =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.error(error)
        },
      }),
      { status: 200 },
    )
  const network = t.mock.method(globalThis, 'fetch', async () => brokenBody(new TypeError('Body connection lost')))
  const restored = await fetchCurriculum(snapshot.grade)
  assert.equal('offline' in restored && restored.offline, true)
  assert.deepEqual(restored.snapshot, snapshot)
  network.mock.mockImplementation(async () => brokenBody(new Error('Body failed for another reason')))
  await assert.rejects(fetchCurriculum(snapshot.grade), /another reason/)
  const cancelled = new AbortController()
  network.mock.mockImplementation(async () => {
    cancelled.abort()
    return brokenBody(new TypeError('Body connection lost'))
  })
  await assert.rejects(fetchCurriculum(snapshot.grade, cancelled.signal), /abort/i)
  network.mock.mockImplementation(async () => new Response('not JSON', { status: 200 }))
  await assert.rejects(fetchCurriculum(snapshot.grade))
  assert.deepEqual([...storage.values], before)
})
test('cache writes require readback and preserve a prior snapshot on a failed write', () => {
  const storage = memory(),
    snapshot = source('kindergarten')
  retainValidatedCurriculum(storage, snapshot)
  const before = [...storage.values]
  const failing = {
    getItem: storage.getItem,
    setItem: () => {
      throw new Error('quota')
    },
  }
  assert.throws(() => retainValidatedCurriculum(failing, { ...snapshot, retrievedAt: '2026-10-17T00:00:00Z' }), /quota/)
  assert.deepEqual([...storage.values], before)
  assert.throws(() => retainValidatedCurriculum({ getItem: () => null, setItem: () => {} }, snapshot), /retained/)
})

test('ordinary fetch retains validated data, falls back only for lost connections, and preserves rejected sources', async (t) => {
  const storage = memory(),
    snapshot = source('kindergarten')
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  })
  const network = t.mock.method(globalThis, 'fetch', async () => Response.json(snapshot))
  const online = await fetchCurriculum(snapshot.grade)
  assert.equal('offline' in online, false)
  const before = [...storage.values]
  network.mock.mockImplementation(async () => {
    throw new TypeError('Network disconnected')
  })
  const offline = await fetchCurriculum(snapshot.grade)
  assert.equal('offline' in offline && offline.offline, true)
  assert.deepEqual(offline.datasets, online.datasets)
  network.mock.mockImplementation(async () => new Response('', { status: 403 }))
  await assert.rejects(fetchCurriculum(snapshot.grade), /403/)
  network.mock.mockImplementation(async () => Response.json({ ...snapshot, contentSha256: '0'.repeat(64) }))
  await assert.rejects(fetchCurriculum(snapshot.grade), /checksum/)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(fetchCurriculum(snapshot.grade, controller.signal), /abort/i)
  assert.deepEqual([...storage.values], before)
})
