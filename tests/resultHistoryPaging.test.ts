import assert from 'node:assert/strict'
import test from 'node:test'
import { createResultRepository } from '../src/familyBeta/cloud.ts'
import { makeResult } from '../src/familyBeta/model.ts'
import { attemptSeries, distinctAttempts } from '../src/familyBeta/resultHistory.ts'
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

test('routine result refresh reads one bounded recent page instead of walking the whole history', async () => {
  const requested: URL[] = []
  const repository = createResultRepository({
    projectId: 'synthetic',
    familyId: 'family',
    token: async () => 'synthetic',
    fetchImpl: async (input) => {
      const url = new URL(String(input))
      requested.push(url)
      return Response.json(
        url.searchParams.has('pageToken')
          ? { documents: [document(score('old', '2025-10-06T15:00:00.000Z'))] }
          : { documents: [document(score('recent'))], nextPageToken: 'older-page' },
      )
    },
  })
  const loaded = await repository.list(profile.id)
  assert.equal(requested.length, 1, 'routine sync must not fetch older pages')
  assert.equal(requested[0].searchParams.get('pageSize'), '50')
  assert.equal(requested[0].searchParams.get('orderBy'), 'completedAt desc, __name__ desc')
  assert.ok(requested[0].search.includes('completedAt%20desc'))
  assert.deepEqual(
    loaded.map((r) => r.id),
    ['recent'],
  )
})
