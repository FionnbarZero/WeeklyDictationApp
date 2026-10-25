import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { curriculumDateKey, scheduledCurriculumWeek, watchCurriculum } from '../src/familyBeta/automaticCurriculum.ts'
import { type CurriculumSnapshot, validateCurriculum } from '../src/familyBeta/curriculum.ts'
import {
  readRetainedCurriculum,
  retainAutomaticCurriculum,
  retainValidatedCurriculum,
} from '../src/familyBeta/curriculumCache.ts'

function source(slug = 'grade2') {
  const snapshot = JSON.parse(
    readFileSync(new URL(`./fixtures/dojo-launch-2026-10-16/${slug}.json`, import.meta.url), 'utf8'),
  ) as CurriculumSnapshot
  snapshot.retrievedAt = '2026-10-25T12:00:00Z'
  return snapshot
}
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
test('overlapping refreshes share one request; a failed retry keeps pending valid curriculum', async () => {
  let finish!: (value: string) => void
  let calls = 0
  const received: string[] = [],
    errors: unknown[] = []
  const watcher = watchCurriculum({
    load: () => {
      calls++
      return calls === 1
        ? new Promise<string>((resolve) => {
            finish = resolve
          })
        : Promise.reject(new Error('offline'))
    },
    apply: (value) => received.push(value),
    error: (error) => errors.push(error),
  })
  const first = watcher.refresh()
  assert.equal(watcher.refresh(), first)
  finish('validated')
  await first
  await watcher.refresh()
  watcher.settle()
  assert.equal(calls, 2)
  assert.deepEqual(received, ['validated', 'validated'])
  assert.equal(errors.length, 1)
  watcher.dispose()
})
test('disposal aborts requests and ignores both late previous-grade success and failure', async () => {
  for (const failure of [false, true]) {
    let resolve!: (value: string) => void, reject!: (error: Error) => void, signal!: AbortSignal
    const changes: unknown[] = []
    const watcher = watchCurriculum({
      load: (input) => {
        signal = input
        return new Promise<string>((ok, no) => {
          resolve = ok
          reject = no
        })
      },
      apply: (v) => changes.push(v),
      error: (e) => changes.push(e),
    })
    const pending = watcher.refresh()
    watcher.dispose()
    assert.equal(signal.aborted, true)
    if (failure) reject(new Error('late'))
    else resolve('previous grade')
    await pending
    watcher.settle()
    await watcher.refresh()
    assert.deepEqual(changes, [])
  }
})
test('early teacher targets wait for their scheduled date and explicit past weeks stay selected', async () => {
  const { datasets } = await validateCurriculum(JSON.stringify(source()), 'Grade 2')
  assert.equal(scheduledCurriculumWeek(datasets, '2026-10-12'), '2026-10-05')
  assert.equal(scheduledCurriculumWeek(datasets, '2026-10-13'), '2026-10-13')
  assert.equal(scheduledCurriculumWeek(datasets, '2026-10-12', '2026-10-13'), '2026-10-05')
  assert.equal(scheduledCurriculumWeek(datasets, '2026-10-13', '2026-09-21'), '2026-09-21')
  assert.equal(curriculumDateKey(new Date('2026-10-26T06:59:59Z')), '2026-10-25')
  assert.equal(curriculumDateKey(new Date('2026-10-26T07:00:00Z')), '2026-10-26')
  assert.equal(curriculumDateKey(new Date('2026-11-02T07:59:59Z')), '2026-11-01')
  assert.equal(curriculumDateKey(new Date('2026-11-02T08:00:00Z')), '2026-11-02')
})
test('automatic cache is isolated, fenced against stale/lost weeks and aborts without replacing saved data', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'locks')
  let tail = Promise.resolve<unknown>(undefined)
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (_name: string, action: () => unknown) => {
        const result = tail.then(action)
        tail = result.catch(() => {})
        return result
      },
    },
  })
  t.after(() =>
    descriptor ? Object.defineProperty(navigator, 'locks', descriptor) : Reflect.deleteProperty(navigator, 'locks'),
  )
  const storage = memory(),
    snapshot = source()
  retainValidatedCurriculum(storage, snapshot)
  storage.setItem('unrelated-child-checkpoint', 'preserve')
  const original = [...storage.values]
  await retainAutomaticCurriculum(storage, snapshot)
  assert.deepEqual([...storage.values].slice(0, 2), original)
  const newer = { ...snapshot, retrievedAt: '2026-10-26T12:00:00Z' }
  await Promise.all([
    retainAutomaticCurriculum(storage, newer),
    assert.rejects(retainAutomaticCurriculum(storage, snapshot), /older curriculum/),
  ])
  assert.equal(
    (await readRetainedCurriculum(storage, 'Grade 2', undefined, true)).snapshot.retrievedAt,
    newer.retrievedAt,
  )
  assert.equal((await readRetainedCurriculum(storage, 'Grade 2')).snapshot.retrievedAt, snapshot.retrievedAt)
  const partial = structuredClone(newer)
  if (partial.payload.sourceType !== 'google-slides') throw new Error('Expected slides')
  partial.payload.slides = partial.payload.slides!.filter((s) => JSON.stringify(s).includes('10/13'))
  partial.contentSha256 = createHash('sha256').update(JSON.stringify(partial.payload)).digest('hex')
  const before = [...storage.values]
  await assert.rejects(retainAutomaticCurriculum(storage, partial), /omits an existing valid week/)
  const cancelled = new AbortController()
  cancelled.abort()
  await assert.rejects(retainAutomaticCurriculum(storage, newer, cancelled.signal), /abort/i)
  assert.deepEqual([...storage.values], before)
})

test('newly posted teacher words have validated, complete guide geometry', async () => {
  const { automaticCurriculumStrokeMedians } = await import(
    '../src/learningGames/strokeOrder/automaticCurriculumStrokeAssets.ts'
  )
  const { grade2StrokeMedians } = await import('../src/learningGames/strokeOrder/grade2StrokeAssets.ts')
  const { buildStrokeOrderRounds } = await import('../src/learningGames/strokeOrder/rounds.ts')
  const targets = ['大', '马', '名字', '穷', '穷苦', '家庭', '勇敢', '喜爱', '伟大'].map((text, index) => ({
    id: String(index),
    text,
  }))
  const result = buildStrokeOrderRounds(targets, { ...grade2StrokeMedians, ...automaticCurriculumStrokeMedians })
  assert.deepEqual(result.unsupportedTargets, [])
  assert.equal(result.rounds.length, targets.length)
  assert.deepEqual(
    result.rounds.map((round) => round.targetText),
    targets.map((target) => target.text),
  )
})

test('current Kindergarten source supplement has real non-silent recorded prompts', async () => {
  const { default: assets } = await import('../src/audio/kindergarten/automatic-manifest.json', {
    with: { type: 'json' },
  })
  assert.deepEqual(Object.keys(assets), ['马', '绿色', '黄色', '吃'])
  for (const asset of Object.values(assets)) {
    const bytes = readFileSync(new URL(`../public/${asset.storagePath}`, import.meta.url))
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF')
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WAVE')
    assert.ok(bytes.length > 4096 && bytes.subarray(4096).some((value) => value !== 0))
  }
})
