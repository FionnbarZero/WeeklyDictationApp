import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { dailyTotals, isBetaResult, makeResult } from '../src/familyBeta/model.ts'
import { inspectSnapshot, type CurriculumSnapshot } from '../src/familyBeta/curriculum.ts'
import { extractGrade5Presentation } from '../src/curriculum/adapters/grade5GoogleSlides.ts'
import { createResultRepository } from '../src/familyBeta/cloud.ts'
import { documentValue } from '../src/firestoreClient.ts'
import { sameCompletedResult } from '../src/familyBeta/resultLedger.ts'
import { resultRetentionBucket } from '../src/familyBeta/resultRetention.ts'

const child = { id: 'preview-child', nickname: 'Learner', grade: 'Grade 2' as const, active: true }
const result = (id: string, at: string, correct = 2) =>
  makeResult(
    child,
    { id, activity: 'Writing Dojo', channel: 'writing', datasetIds: ['dataset-1'], correct, attempted: 3 },
    new Date(at),
  )

test('repeated attempts are summed once each and split at Pacific midnight, including winter time', () => {
  const before = result('one', '2026-10-06T06:59:59.000Z')
  const after = result('two', '2026-10-06T07:00:00.000Z')
  const repeated = result('three', '2026-10-06T07:01:00.000Z', 3)
  assert.equal(before.day, '2026-10-05')
  assert.equal(after.day, '2026-10-06')
  assert.deepEqual(dailyTotals([before, after, repeated, repeated], child.id), [
    { day: '2026-10-06', correct: 5, attempted: 6, sessions: 2 },
    { day: '2026-10-05', correct: 2, attempted: 3, sessions: 1 },
  ])
  assert.equal(result('winter', '2026-12-06T07:59:59.000Z').day, '2026-12-05')
  assert.equal(result('winter2', '2026-12-06T08:00:00.000Z').day, '2026-12-06')
})

test('invalid scores and scope do not enter the ledger', () => {
  const good = result('one', '2026-10-05T18:00:00.000Z')
  assert.equal(isBetaResult({ ...good, correct: 4 }), false)
  assert.equal(isBetaResult({ ...good, childId: '../other' }), false)
  assert.equal(isBetaResult({ ...good, day: '2026-10-04' }), false)
  assert.deepEqual(dailyTotals([good], 'another-child'), [])
})

test('completed results carry optional school-year provenance without invalidating legacy scores', () => {
  const current = result('current', '2026-10-05T18:00:00.000Z')
  const tagged = { ...current, schoolYear: '2026-27' }
  assert.equal(isBetaResult(tagged), true)
  assert.equal(isBetaResult({ ...tagged, datasetIds: [123] }), false)
  assert.equal(isBetaResult(current), true)
  assert.equal(sameCompletedResult(current, tagged), false)
  assert.equal(sameCompletedResult(tagged, current), false)
})

test('retention preview keeps current and previous school years detailed without deleting legacy records', () => {
  const base = result('retention', '2026-10-05T18:00:00.000Z')
  assert.equal(resultRetentionBucket({ ...base, schoolYear: '2026-27' }, '2026-27'), 'detail')
  assert.equal(resultRetentionBucket({ ...base, schoolYear: '2025-26' }, '2026-27'), 'detail')
  assert.equal(resultRetentionBucket({ ...base, schoolYear: '2024-25' }, '2026-27'), 'summary')
  assert.equal(resultRetentionBucket(base, '2026-27'), 'unknown')
  assert.equal(resultRetentionBucket({ ...base, schoolYear: 'unknown' }, '2026-27'), 'unknown')
  assert.equal(resultRetentionBucket({ ...base, schoolYear: '2027-28' }, '2026-27'), 'unknown')
})

test('teacher snapshots keep grade identities and writing/reading targets distinct', () => {
  for (const slug of ['kindergarten', 'grade2', 'grade5']) {
    const snapshot = JSON.parse(
      readFileSync(new URL(`../public/curriculum/beta/${slug}.json`, import.meta.url), 'utf8'),
    ) as CurriculumSnapshot
    const { datasets } = inspectSnapshot(snapshot)
    assert.ok(datasets.length >= 5)
    assert.ok(datasets.every((d) => d.grade === snapshot.grade))
    assert.throws(() => inspectSnapshot({ ...snapshot, sourceId: 'wrong-deck' }))
    if (slug === 'grade2') {
      const current = datasets.find((d) => d.startDate === '2026-10-05')!
      assert.equal(current.words.length, 9)
      assert.equal(current.vocabulary?.tier2.length, 0)
    }
    if (slug === 'kindergarten') {
      const current = datasets.find((d) => d.startDate === '2026-10-05')!
      assert.deepEqual(
        current.words.map((w) => w.text),
        ['牛', '羊'],
      )
      assert.deepEqual(
        current.vocabulary?.tier2.map((w) => w.text),
        ['猫', '狗', '鸟'],
      )
    }
    if (snapshot.payload.sourceType === 'google-slides' && slug === 'grade5') {
      const extracted = extractGrade5Presentation(snapshot.payload)
      assert.ok(extracted.issues.some((i) => i.code === 'unchanged_cohort'))
      assert.equal(
        extracted.issues.some((i) => i.code === 'confirmation_mismatch'),
        false,
      )
      assert.equal(extracted.progressionEvidence.length, 4)
    }
  }
})

test('cloud result save verifies readback, retries idempotently and loads on a second client', async () => {
  const documents = new Map<string, unknown>()
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    if (init?.method === 'PATCH') {
      if (documents.has(url.pathname)) return new Response('{}', { status: 409 })
      documents.set(url.pathname, JSON.parse(String(init.body)))
      return new Response('{}')
    }
    if (url.pathname.endsWith(':runQuery')) return Response.json([...documents.values()].map(document => ({ document })))
    return Response.json(documents.get(url.pathname))
  }
  const config = { projectId: 'demo-test', familyId: 'family-one', token: async () => 'test', fetchImpl: fakeFetch }
  const first = createResultRepository(config),
    second = createResultRepository(config)
  const score = result('one', '2026-10-05T18:00:00.000Z')
  await first.save(score)
  await first.save(score)
  assert.deepEqual(await second.list(child.id), [score])
  await assert.rejects(first.save({ ...score, correct: 1 }), /differs/)
  const bad = createResultRepository({
    ...config,
    fetchImpl: async (_url, init) =>
      init?.method === 'PATCH' ? new Response('{}') : Response.json({ fields: { id: documentValue('wrong') } }),
  })
  await assert.rejects(bad.save(score), /differs/)
})
