import assert from 'node:assert/strict'
import test from 'node:test'
import { createResultRepository } from '../src/familyBeta/cloud.ts'
import { makeResult } from '../src/familyBeta/model.ts'
import {
  assertSavedAttemptsMatch,
  attemptSeries,
  distinctAttempts,
  olderLocalAttempts,
} from '../src/familyBeta/resultHistory.ts'
import { documentValue } from '../src/firestoreClient.ts'

const profile = { id: 'child', nickname: 'Synthetic', grade: 'Grade 5' as const, active: true }
const score = (id: string, at = '2026-10-06T15:00:00.000Z') =>
  makeResult(
    profile,
    { id, activity: 'Writing Dojo', channel: 'writing', datasetIds: ['week-one'], correct: 1, attempted: 2 },
    new Date(at),
  )
const row = (result: ReturnType<typeof score>) => ({
  document: { fields: Object.fromEntries(Object.entries(result).map(([key, value]) => [key, documentValue(value)])) },
})
function repositoryFor(body: unknown, onRequest?: (url: URL, init?: RequestInit) => void) {
  return createResultRepository({
    projectId: 'synthetic',
    familyId: 'family',
    token: async () => 'synthetic',
    fetchImpl: async (input, init) => {
      onRequest?.(new URL(String(input)), init)
      return Response.json(body)
    },
  })
}
const scores = Array.from({ length: 51 }, (_, i) => score(`attempt-${String(51 - i).padStart(3, '0')}`))

test('routine result refresh reads one bounded recent page instead of walking the whole history', async () => {
  const requested: RequestInit[] = []
  const repository = repositoryFor(scores.map(row), (url, init) => {
    assert.match(url.pathname, /\/child:runQuery$/)
    requested.push(init!)
  })
  const loaded = await repository.list(profile.id)
  assert.equal(requested.length, 1, 'routine sync must not fetch older pages')
  const query = JSON.parse(String(requested[0].body)).structuredQuery
  assert.equal(query.limit, 51)
  assert.deepEqual(query.orderBy, [
    { field: { fieldPath: 'completedAt' }, direction: 'DESCENDING' },
    { field: { fieldPath: '__name__' }, direction: 'DESCENDING' },
  ])
  assert.equal(query.startAt, undefined)
  assert.deepEqual(loaded, scores.slice(0, 50))
})

test('older result pages use a child-scoped stable cursor and never an offset', async () => {
  const first = await repositoryFor(scores.map(row)).listPage('child')
  const calls: RequestInit[] = []
  const last = scores[49]
  assert.deepEqual(JSON.parse(first.nextPageToken), {
    childId: 'child',
    familyId: 'family',
    completedAt: last.completedAt,
    id: last.id,
  })
  const page = await repositoryFor([row(scores[50])], (_url, init) => calls.push(init!)).listPage(
    'child',
    first.nextPageToken,
  )
  assert.equal(calls.length, 1)
  const query = JSON.parse(String(calls[0].body)).structuredQuery
  assert.equal(query.limit, 51)
  assert.equal(query.offset, undefined)
  assert.deepEqual(query.startAt, {
    before: false,
    values: [
      { stringValue: last.completedAt },
      {
        referenceValue: `projects/synthetic/databases/(default)/documents/families/family/children/child/betaResults/${last.id}`,
      },
    ],
  })
  assert.equal(page.nextPageToken, '')
  assert.deepEqual(page.results, [scores[50]])
})

test('malformed, duplicate, oversized and cross-child pages fail closed', async () => {
  const good = row(score('one'))
  for (const body of [
    null,
    {},
    'bad',
    [null],
    [{ error: 'failed' }],
    [good, good],
    Array.from({ length: 52 }, (_, i) => row(score(`attempt-${i}`))),
    [row({ ...score('one'), childId: 'other' })],
    [row({ ...score('one'), correct: 10 })],
  ])
    await assert.rejects(repositoryFor(body).listPage('child'), /validation/)
  assert.deepEqual(await repositoryFor([{ readTime: '2026-10-06T00:00:00Z' }]).listPage('child'), {
    results: [],
    nextPageToken: '',
  })
})

test('failed history fetches and cancellation never become an empty successful page', async () => {
  const repository = createResultRepository({
    projectId: 'synthetic',
    familyId: 'family',
    token: async () => 'synthetic',
    fetchImpl: async () => new Response('{}', { status: 503 }),
  })
  await assert.rejects(repository.listPage('child'), /503/)
  const controller = new AbortController()
  controller.abort()
  let aborted = false
  await repositoryFor([], (_url, init) => {
    aborted = Boolean(init?.signal?.aborted)
  }).listPage('child', '', controller.signal)
  assert.equal(aborted, true)
})

test('invalid and cross-family cursors fail before any network request', async () => {
  const repository = repositoryFor([], () => assert.fail('Unexpected request'))
  await assert.rejects(repository.listPage('../other'), /scope/)
  for (const cursor of [
    'x'.repeat(1025),
    'bad',
    'null',
    JSON.stringify({ childId: 'other', familyId: 'family' }),
    JSON.stringify({ childId: 'child', familyId: 'other', completedAt: scores[0].completedAt, id: scores[0].id }),
  ])
    await assert.rejects(repository.listPage('child', cursor), /cursor/)
})

test('each completed attempt gets a point, including tied timestamps, while retries deduplicate', () => {
  const first = score('one'),
    second = score('two'),
    third = score('three', '2026-10-06T16:00:00.000Z')
  const input = [third, second, first, first]
  assert.deepEqual(
    distinctAttempts(input, profile.id).map((r) => r.id),
    ['one', 'two', 'three'],
  )
  assert.deepEqual(
    attemptSeries(input, profile.id)[0].attempts.map((r) => r.id),
    ['one', 'two', 'three'],
  )
  assert.deepEqual(input, [third, second, first, first])
  assert.deepEqual(attemptSeries(input, 'other'), [])
})

test('graphs separate reading, writing, Boss, games and grades without changing mastery', () => {
  const input = [
    score('one'),
    { ...score('two'), channel: 'reading' as const },
    { ...score('three'), activity: 'Boss' },
    { ...score('four'), channel: 'game' as const },
    { ...score('five'), grade: 'Grade 2' as const },
  ]
  assert.equal(attemptSeries(input, profile.id).length, 5)
  assert.throws(
    () => distinctAttempts([score('one'), { ...score('one'), correct: 0 }], profile.id),
    /Neither was replaced/,
  )
  assert.throws(() => distinctAttempts([{ ...score('one'), correct: 100 }], profile.id), /validation/)
})

test('local history uses a stable time and identity boundary across newly inserted results', () => {
  const original = Array.from({ length: 125 }, (_, i) => score(`attempt-${String(i).padStart(3, '0')}`))
  const changed = [...original, score('z-new-arrival'), { ...score('other-child'), childId: 'other' }]
  const second = olderLocalAttempts(changed, profile.id, original[75])
  assert.deepEqual(
    second.results.map((r) => r.id),
    original
      .slice(25, 75)
      .reverse()
      .map((r) => r.id),
  )
  assert.equal(second.hasOlderLocal, true)
  const third = olderLocalAttempts(changed, profile.id, second.results[49])
  assert.deepEqual(
    third.results.map((r) => r.id),
    original
      .slice(0, 25)
      .reverse()
      .map((r) => r.id),
  )
  assert.equal(third.hasOlderLocal, false)
  assert.equal(changed.length, 127)
  assert.equal(original[0].id, 'attempt-000')
})

const ledgerKey = 'synthetic-result-ledger'
const readOnlyLedger = (entries: Map<string, string>, reads: string[] = []) => ({
  getItem(key: string) {
    reads.push(key)
    return entries.get(key) ?? null
  },
})

test('page integrity checks only requested keys and accepts equal keyed and legacy copies', () => {
  const result = score('one')
  const reordered = Object.fromEntries(Object.entries(result).reverse())
  const entries = new Map([
    [ledgerKey, JSON.stringify([result])],
    [`${ledgerKey}:one`, JSON.stringify(reordered)],
    [`${ledgerKey}:unrelated`, 'not read'],
  ])
  const before = [...entries]
  const reads: string[] = []
  assertSavedAttemptsMatch([result, score('two')], readOnlyLedger(entries, reads), ledgerKey)
  assert.deepEqual(reads, [ledgerKey, `${ledgerKey}:one`, `${ledgerKey}:two`])
  assert.deepEqual([...entries], before)
})

test('page integrity rejects either conflicting copy without overwriting or masking it', () => {
  const result = score('one')
  const conflict = { ...result, correct: 0 }
  for (const entries of [
    new Map([[`${ledgerKey}:one`, JSON.stringify(conflict)]]),
    new Map([
      [ledgerKey, JSON.stringify([conflict])],
      [`${ledgerKey}:one`, JSON.stringify(result)],
    ]),
    new Map([[ledgerKey, JSON.stringify([result, conflict])]]),
  ]) {
    const before = [...entries]
    assert.throws(
      () => assertSavedAttemptsMatch([result], readOnlyLedger(entries), ledgerKey),
      /Both copies are preserved/,
    )
    assert.deepEqual([...entries], before)
  }
})

test('page integrity fails closed on invalid records, unreadable storage and contradictory page copies', () => {
  const result = score('one')
  for (const entries of [
    new Map([[ledgerKey, '{}']]),
    new Map([[ledgerKey, '[null]']]),
    new Map([[`${ledgerKey}:one`, 'broken JSON']]),
    new Map([[`${ledgerKey}:one`, JSON.stringify({ ...result, attempted: 0 })]]),
  ]) {
    const before = [...entries]
    assert.throws(() => assertSavedAttemptsMatch([result], readOnlyLedger(entries), ledgerKey))
    assert.deepEqual([...entries], before)
  }
  assert.throws(
    () =>
      assertSavedAttemptsMatch(
        [result],
        {
          getItem() {
            throw new Error('Storage unavailable')
          },
        },
        ledgerKey,
      ),
    /Storage unavailable/,
  )
  assert.throws(
    () => assertSavedAttemptsMatch([result, { ...result, correct: 0 }], readOnlyLedger(new Map()), ledgerKey),
    /Both copies are preserved/,
  )
  assert.throws(
    () => assertSavedAttemptsMatch([{ ...result, correct: 10 }], readOnlyLedger(new Map()), ledgerKey),
    /validation/,
  )
})
