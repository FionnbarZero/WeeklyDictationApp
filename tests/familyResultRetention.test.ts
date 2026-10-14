import assert from 'node:assert/strict'
import test from 'node:test'
import { type BetaResult, makeResult } from '../src/familyBeta/model.ts'
import {
  previewResultRetention,
  RETENTION_PREVIEW_LIMIT,
  resultRetentionBucket,
} from '../src/familyBeta/resultRetention.ts'

const base = makeResult(
  { id: 'child', nickname: 'Synthetic', grade: 'Grade 2', active: true },
  { id: 'attempt', activity: 'Writing', channel: 'writing', datasetIds: ['week'], correct: 1, attempted: 2 },
  new Date('2026-10-13T18:00:00.000Z'),
)

test('retention rejects incomplete, contradictory and non-string year metadata without throwing', () => {
  for (const schoolYear of ['2024oops', '2024-99', '2024', '2024-2026', '2024-25 extra', '', 2024, {}, null]) {
    assert.equal(resultRetentionBucket({ ...base, schoolYear } as BetaResult, '2026-27'), 'unknown')
  }
})

test('retention validates the reference school year as strictly as the result year', () => {
  for (const current of ['2026oops', '2026-88', '2026', '', null, 2026]) {
    assert.equal(resultRetentionBucket({ ...base, schoolYear: '2024-25' }, current as string), 'unknown')
  }
})

test('retention accepts consecutive supported year ranges without changing stored provenance', () => {
  for (const schoolYear of ['2026-27', '2026–2027', '2026 / 2027', ' 2026—27 ']) {
    const result = Object.freeze({ ...base, schoolYear })
    assert.equal(resultRetentionBucket(result, '2026–2027'), 'detail')
    assert.equal(result.schoolYear, schoolYear)
  }
  assert.equal(resultRetentionBucket({ ...base, schoolYear: '2025-2026' }, '2026-27'), 'detail')
  assert.equal(resultRetentionBucket({ ...base, schoolYear: '2024-2025' }, '2026-27'), 'summary')
  assert.equal(resultRetentionBucket({ ...base, schoolYear: '2027-2028' }, '2026-27'), 'unknown')
})

function preview(results: readonly unknown[], currentSchoolYear = '2026-27', childId = 'child') {
  return previewResultRetention({ childId, currentSchoolYear, results })
}

test('preview preserves every distinct completed attempt across grades, channels and identical scores', () => {
  const results = [
    { ...base, id: 'a', schoolYear: '2024-25' },
    { ...base, id: 'b', schoolYear: '2025-26', grade: 'Kindergarten' },
    { ...base, id: 'c', schoolYear: '2026-27', grade: 'Grade 5', channel: 'reading' },
    { ...base, id: 'd', schoolYear: '2024-25', channel: 'game' },
    { ...base, id: 'e', schoolYear: '2027-28' },
    { ...base, id: 'f' },
  ]
  const report = preview(results)
  assert.equal(report.mode, 'read-only')
  assert.equal(report.source, 'supplied-completed-scores-only')
  assert.equal(report.completeInventory, false)
  assert.equal(report.deletionAuthorized, false)
  assert.deepEqual(report.plannedDeletes, [])
  assert.deepEqual(report.counts, { detail: 2, olderDetailReview: 2, hold: 2 })
  assert.equal(report.distinctAttempts, 6)
  for (const [index, entry] of report.entries.entries()) {
    assert.equal(entry.attemptId, results[index].id)
    assert.equal(entry.preserveCompletedScore, true)
    assert.equal(entry.correct, results[index].correct)
    assert.equal(entry.attempted, results[index].attempted)
    assert.equal(entry.completedAt, results[index].completedAt)
  }
  assert.equal(report.entries[0].detailDisposition, 'review-linked-detail')
  assert.equal(report.entries[1].detailDisposition, 'retain')
  assert.equal(report.entries[4].detailDisposition, 'hold')
})

test('identical retries deduplicate only the same stable attempt id and output is deterministic', () => {
  const first = { ...base, id: 'a', schoolYear: '2024-25' }
  const second = { ...base, id: 'b', schoolYear: '2024-25' }
  const report = preview([second, structuredClone(first), first])
  assert.equal(report.inputCopies, 3)
  assert.equal(report.distinctAttempts, 2)
  assert.equal(report.duplicates, 1)
  assert.deepEqual(report, preview([first, second, structuredClone(first)]))
  assert.deepEqual(
    report.entries.map((entry) => entry.attemptId),
    ['a', 'b'],
  )
})

test('any conflicting immutable copy refuses the entire batch in either ordering', () => {
  for (const changed of [
    { ...base, correct: 2 },
    { ...base, schoolYear: '2024-25' },
    { ...base, datasetIds: ['another-week'] },
    { ...base, grade: 'Grade 5' },
  ]) {
    assert.throws(() => preview([base, changed]), /copies disagree/)
    assert.throws(() => preview([changed, base]), /copies disagree/)
  }
  assert.throws(
    () =>
      preview([
        { ...base, schoolYear: '2024-25' },
        { ...base, schoolYear: '2024-2025' },
      ]),
    /copies disagree/,
  )
})

test('malformed legacy metadata is held without exposing its content or inferring a year from dates', () => {
  for (const schoolYear of ['', null, 2024, { private: 'do-not-output' }, '2024oops', '2024-99']) {
    const [entry] = preview([{ ...base, schoolYear }]).entries
    assert.equal(entry.bucket, 'unknown')
    assert.equal(entry.reason, 'invalid-year')
    assert.equal(entry.schoolYear, null)
    assert.equal(entry.detailDisposition, 'hold')
    assert.equal(JSON.stringify(entry).includes('do-not-output'), false)
  }
  const old = makeResult(
    { id: 'child', nickname: 'Synthetic', grade: 'Kindergarten', active: true },
    { id: 'old', activity: 'Writing', channel: 'writing', datasetIds: ['week-2020-21'], correct: 1, attempted: 2 },
    new Date('2020-09-01T18:00:00.000Z'),
  )
  assert.equal(preview([old]).entries[0].reason, 'missing-year')
  assert.equal(preview([{ ...base, schoolYear: '2027-28' }]).entries[0].reason, 'future-year')
})

test('reference year is explicit, normalized, and cannot be inferred from the machine clock', () => {
  assert.equal(preview([base], ' 2026 / 2027 ').currentSchoolYear, '2026-27')
  for (const year of ['', '2026', '2026-99', null, 2026]) {
    assert.throws(() => preview([base], year as string), /consecutive current school-year/)
  }
})

test('child scope and valid summary shape are required for every item, not silently filtered', () => {
  for (const invalid of [
    null,
    {},
    { ...base, childId: 'different-child' },
    { ...base, correct: 99 },
    { ...base, attempted: 0 },
    { ...base, grade: 'Unknown' },
    { ...base, nickname: 'private-name' },
    { ...base, completedAt: 'not-a-date' },
    { ...base, day: '1900-01-01' },
  ]) {
    assert.throws(() => preview([base, invalid]), /invalid or differently scoped/)
  }
  for (const childId of ['', 'child/path', '*', null, 'a'.repeat(161)]) {
    assert.throws(() => preview([], '2026-27', childId as string), /explicit child scope/)
  }
})

test('bounded input never silently truncates and even an empty snapshot is not a complete inventory', () => {
  assert.equal(preview(Array.from({ length: RETENTION_PREVIEW_LIMIT }, () => base)).inputCopies, 500)
  assert.throws(() => preview(Array.from({ length: RETENTION_PREVIEW_LIMIT + 1 }, () => base)), /bounded/)
  for (const invalid of [null, {}, undefined]) {
    assert.throws(() => preview(invalid as unknown as unknown[]), /bounded/)
  }
  const empty = preview([])
  assert.equal(empty.completeInventory, false)
  assert.equal(empty.distinctAttempts, 0)
  assert.deepEqual(empty.counts, { detail: 0, olderDetailReview: 0, hold: 0 })
})

test('frozen input is never rewritten and preview entries do not retain mutable input references', () => {
  const result = { ...base, schoolYear: ' 2024—2025 ' }
  Object.freeze(result.datasetIds)
  Object.freeze(result)
  const input = Object.freeze([result])
  const before = JSON.stringify(input)
  const report = preview(input)
  report.entries[0].correct = 0
  assert.equal(JSON.stringify(input), before)
  assert.equal(report.entries[0].schoolYear, '2024-25')
  assert.equal('datasetIds' in report.entries[0], false)
})

test('retention boundary advances only with the caller supplied consecutive school year', () => {
  const result = { ...base, schoolYear: '2025-26' }
  assert.equal(preview([result], '2026-27').entries[0].bucket, 'detail')
  assert.equal(preview([result], '2027-28').entries[0].bucket, 'summary')
  assert.equal(resultRetentionBucket({ ...base, schoolYear: '2099-2100' }, '2099-00'), 'detail')
})
