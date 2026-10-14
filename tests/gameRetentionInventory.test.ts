import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { inspectSnapshot } from '../src/familyBeta/curriculum.ts'
import { reinforcementGames } from '../src/familyBeta/gamePools.ts'
import {
  GAME_RETENTION_LIMITS,
  previewGameRetentionInventory,
  RETENTION_COLLECTIONS,
} from '../src/familyBeta/gameRetentionInventory.ts'
import type { LearningModuleAttempt, LearningModulePack } from '../src/ninjaSkills/contracts.ts'
import {
  checkpointGameAnswer,
  completeGameCheckpoint,
  continueGameCheckpoint,
  retireGameCheckpoint,
  startGameCheckpoint,
} from '../src/ninjaSkills/progress.ts'

const grades = [
  ['kindergarten', 'Kindergarten'],
  ['grade2', 'Grade 2'],
  ['grade5', 'Grade 5'],
] as const
const games = [
  'memory-flip',
  'speed-match',
  'context-gap-dash',
  'sentence-scramble',
  'target-blast',
  'dictation-streak',
] as const
const startedAt = '2026-10-05T18:00:00.000Z',
  endedAt = '2026-10-05T18:01:00.000Z'
type Page = {
  familyId: string
  childId: string
  collection: (typeof RETENTION_COLLECTIONS)[number]
  cursor: string
  nextCursor: string
  records: unknown[]
}
function answers(pack: LearningModulePack): LearningModuleAttempt[] {
  if ('pairs' in pack)
    return pack.pairs.map((pair) => ({
      gameId: pack.moduleId,
      promptId: pair.id,
      targetId: pair.targetId,
      correct: true,
      assessmentMode: 'automatic',
      response:
        pack.moduleId === 'memory-flip' ? [`${pair.id}:left`, `${pair.id}:right`] : [pair.left.id, pair.right.id],
    }))
  return pack.rounds.map((round) => ({
    gameId: pack.moduleId,
    promptId: round.id,
    targetId: round.targetId,
    correct: true,
    assessmentMode: 'automatic',
    response:
      'pinyinSteps' in round
        ? round.targetText
        : 'correctTokenIds' in round
          ? round.correctTokenIds
          : 'correctChoiceId' in round
            ? round.correctChoiceId
            : '',
  }))
}
function fixture(
  grade: (typeof grades)[number] = grades[1],
  game: (typeof games)[number] = games[0],
  schoolYear = '2024-25',
  attemptId = 'attempt',
) {
  const datasets = inspectSnapshot(
    JSON.parse(readFileSync(new URL(`../public/curriculum/beta/${grade[0]}.json`, import.meta.url), 'utf8')),
  ).datasets
  const capability = reinforcementGames(datasets, '2026-10-05', grade[1]).find(
    (c) => c.capability.status === 'ready' && c.capability.pack.moduleId === game,
  )!.capability
  if (capability.status !== 'ready') throw new Error('Missing synthetic fixture')
  const pack = structuredClone(capability.pack)
  pack.cohort.schoolYear = schoolYear
  const start = startGameCheckpoint(
    { childId: 'child', grade: grade[1], week: '2026-10-05', gameId: game },
    pack,
    attemptId,
    'writer',
    startedAt,
  )
  const finished = answers(pack).reduce((value, answer) => checkpointGameAnswer(value, answer, endedAt), start)
  return { start, finished, completion: completeGameCheckpoint(finished, endedAt) }
}
function snapshot(f = fixture()) {
  return {
    schema: 1,
    familyId: 'family',
    childId: 'child',
    currentSchoolYear: '2026-27',
    pages: RETENTION_COLLECTIONS.map((collection) => ({
      familyId: 'family',
      childId: 'child',
      collection,
      cursor: '',
      nextCursor: '',
      records:
        collection === 'results' ? [f.completion.result] : collection === 'gameCompletions' ? [f.completion] : [],
    })) as Page[],
  }
}
function page(input: ReturnType<typeof snapshot>, collection: Page['collection']) {
  return input.pages.find((p) => p.collection === collection)!
}

for (const grade of grades)
  for (const game of games) {
    test(`${grade[1]} ${game}: valid older detail links to its exact total without authorizing deletion`, () => {
      const report = previewGameRetentionInventory(snapshot(fixture(grade, game)))
      assert.equal(report.details[0].summaryLink, 'matched')
      assert.equal(report.details[0].detailDisposition, 'review-linked-detail')
      assert.equal(report.details[0].preserveDetail, true)
      assert.equal(report.details[0].preserveCompletedScore, true)
      assert.equal(report.suppliedPagesComplete, true)
      assert.equal(report.completeInventory, false)
      assert.equal(report.familyOwnershipVerified, false)
      assert.equal(report.deletionAuthorized, false)
      assert.deepEqual(report.plannedDeletes, [])
    })
  }

test('current and previous year details stay retained; malformed and future years stay held', () => {
  for (const [year, disposition] of [
    ['2026-27', 'retain'],
    ['2025-26', 'retain'],
    ['2024oops', 'hold'],
    ['2027-28', 'hold'],
  ]) {
    const report = previewGameRetentionInventory(snapshot(fixture(grades[1], games[0], year)))
    assert.equal(report.details[0].detailDisposition, disposition)
  }
})

test('a missing or pending-only summary does not establish a confirmed link', () => {
  const input = snapshot(),
    result = page(input, 'results').records[0]
  page(input, 'results').records = []
  let report = previewGameRetentionInventory(input)
  assert.equal(report.details[0].summaryLink, 'missing')
  assert.equal(report.details[0].detailDisposition, 'hold')
  page(input, 'pendingResults').records = [result]
  report = previewGameRetentionInventory(input)
  assert.equal(report.details[0].summaryLink, 'pending-only')
  assert.deepEqual(report.details[0].protections, ['summary-not-confirmed', 'pending-sync'])
})

test('either pending outbox protects an otherwise matched confirmed completion', () => {
  for (const collection of ['pendingResults', 'pendingGameCompletions'] as const) {
    const f = fixture(),
      input = snapshot(f)
    page(input, collection).records = [collection === 'pendingResults' ? f.completion.result : f.completion]
    const report = previewGameRetentionInventory(input)
    assert.equal(report.details[0].detailDisposition, 'hold')
    assert.deepEqual(report.details[0].protections, ['pending-sync'])
    assert.equal(report.counts.detailedAttempts, 1)
  }
})

test('unfinished, final and competing fork checkpoints all protect their run detail', () => {
  const f = fixture()
  const fork = continueGameCheckpoint(f.start, 'another-writer', 'fork-attempt')
  for (const checkpoint of [f.start, f.finished, fork]) {
    const input = snapshot(f)
    page(input, 'gameCheckpoints').records = [checkpoint]
    const report = previewGameRetentionInventory(input)
    assert.equal(report.details[0].detailDisposition, 'hold')
    assert.deepEqual(report.details[0].protections, ['checkpoint-dependent'])
    assert.equal(report.preserveAllCheckpoints, true)
  }
})

test('retirement markers stay preserved and protect the matching run', () => {
  const f = fixture(),
    input = snapshot(f)
  page(input, 'gameRetirements').records = [retireGameCheckpoint(f.start, endedAt)]
  const report = previewGameRetentionInventory(input)
  assert.equal(report.preserveAllRetirements, true)
  assert.equal(report.details[0].detailDisposition, 'hold')
  assert.deepEqual(report.details[0].protections, ['retained-run-marker'])
})

test('different saved runs do not falsely link, but their checkpoints and markers stay protected', () => {
  const input = snapshot(),
    other = fixture(grades[1], games[0], '2024-25', 'other')
  page(input, 'gameCheckpoints').records = [other.start]
  page(input, 'gameRetirements').records = [retireGameCheckpoint(other.start, endedAt)]
  const report = previewGameRetentionInventory(input)
  assert.equal(report.details[0].detailDisposition, 'review-linked-detail')
  assert.equal(report.counts.checkpoints, 1)
  assert.equal(report.counts.retirements, 1)
})

test('immutable summary conflicts and changed per-target detail refuse the whole snapshot', () => {
  const f = fixture()
  for (const mutate of [
    (input: ReturnType<typeof snapshot>) => {
      page(input, 'results').records = [{ ...f.completion.result, correct: 0 }]
    },
    (input: ReturnType<typeof snapshot>) => {
      page(input, 'pendingResults').records = [{ ...f.completion.result, schoolYear: '2023-24' }]
    },
    (input: ReturnType<typeof snapshot>) => {
      const changed = structuredClone(f.completion)
      changed.targets[0].correct = 0
      page(input, 'pendingGameCompletions').records = [changed]
    },
  ]) {
    const input = snapshot(f)
    mutate(input)
    const before = JSON.stringify(input)
    assert.throws(() => previewGameRetentionInventory(input))
    assert.equal(JSON.stringify(input), before)
  }
})

test('individually valid conflicting details, checkpoints and retirements refuse the whole snapshot', () => {
  const f = fixture()
  const changedCheckpoint = { ...f.finished, writerId: 'other-writer' }
  const changedCompletion = completeGameCheckpoint(changedCheckpoint, endedAt)
  const retirement = retireGameCheckpoint(f.start, endedAt)
  for (const [collection, records] of [
    ['gameCompletions', [f.completion, changedCompletion]],
    ['gameCheckpoints', [f.start, { ...f.start, startedAt: '2026-10-05T17:59:00.000Z' }]],
    ['gameRetirements', [retirement, { ...retirement, writerId: 'other-writer' }]],
  ] as const) {
    for (const reverse of [false, true]) {
      const input = snapshot(f)
      page(input, collection).records = reverse ? [...records].reverse() : [...records]
      assert.throws(() => previewGameRetentionInventory(input))
    }
  }
})

test('same-time distinct attempts remain separate; identical retries and input order do not change the report', () => {
  const f = fixture(),
    second = fixture(grades[1], games[0], '2024-25', 'second')
  const input = snapshot(f)
  page(input, 'results').records.push(second.completion.result, structuredClone(f.completion.result))
  page(input, 'gameCompletions').records.push(second.completion, structuredClone(f.completion))
  const report = previewGameRetentionInventory(input)
  assert.equal(report.counts.detailedAttempts, 2)
  assert.equal(report.counts.summaryAttempts, 2)
  input.pages.reverse()
  input.pages.forEach((p) => p.records.reverse())
  assert.deepEqual(previewGameRetentionInventory(input), report)
})

test('missing collection and truncated page chains hold detail even if the visible summary matches', () => {
  const input = snapshot()
  input.pages = input.pages.filter((p) => p.collection !== 'pendingGameCompletions')
  page(input, 'results').nextCursor = 'missing-next'
  const report = previewGameRetentionInventory(input)
  assert.equal(report.coverage.pendingGameCompletions.status, 'missing')
  assert.equal(report.coverage.results.status, 'truncated')
  assert.equal(report.suppliedPagesComplete, false)
  assert.equal(report.details[0].detailDisposition, 'hold')
  assert.ok(report.details[0].protections.includes('incomplete-supplied-pages'))
})

test('page chains are verified regardless of input order and never follow network cursors', () => {
  const input = snapshot(),
    first = page(input, 'results')
  first.nextCursor = 'next'
  input.pages.unshift({ ...first, cursor: 'next', nextCursor: '', records: [] })
  assert.equal(previewGameRetentionInventory(input).coverage.results.pages, 2)
  for (const variant of ['repeated', 'detached', 'cycle', 'after-terminal']) {
    const bad = structuredClone(input)
    const next = bad.pages.find((p) => p.cursor === 'next')!
    if (variant === 'repeated') bad.pages.push(structuredClone(next))
    if (variant === 'detached') next.cursor = 'detached'
    if (variant === 'cycle') next.nextCursor = 'next'
    if (variant === 'after-terminal')
      bad.pages.find((p) => p.collection === 'results' && p.cursor === '')!.nextCursor = ''
    assert.throws(() => previewGameRetentionInventory(bad))
  }
})

test('cross-family page scope, cross-child page/record scope, and unsupported shape refuse the batch', () => {
  for (const mutate of [
    (input: ReturnType<typeof snapshot>) => {
      input.pages[0].familyId = 'another-family'
    },
    (input: ReturnType<typeof snapshot>) => {
      input.pages[0].childId = 'another-child'
    },
    (input: ReturnType<typeof snapshot>) => {
      page(input, 'results').records = [{ ...fixture().completion.result, childId: 'another-child' }]
    },
    (input: ReturnType<typeof snapshot>) => {
      input.familyId = '../family'
    },
    (input: ReturnType<typeof snapshot>) => {
      input.currentSchoolYear = '2026oops'
    },
  ]) {
    const input = snapshot()
    mutate(input)
    assert.throws(() => previewGameRetentionInventory(input))
  }
  assert.throws(() => previewGameRetentionInventory({ ...snapshot(), execute: true }))
  assert.throws(() => previewGameRetentionInventory(null))
})

test('all resource limits fail without truncation or changes to supplied input', () => {
  const f = fixture()
  for (const mutate of [
    (input: ReturnType<typeof snapshot>) => {
      input.pages = Array.from({ length: GAME_RETENTION_LIMITS.pages + 1 }, () => input.pages[0])
    },
    (input: ReturnType<typeof snapshot>) => {
      page(input, 'results').records = Array(51).fill(f.completion.result)
    },
    (input: ReturnType<typeof snapshot>) => {
      input.pages = Array.from({ length: 11 }, (_, index) => ({
        familyId: 'family',
        childId: 'child',
        collection: 'results',
        cursor: index ? String(index) : '',
        nextCursor: index < 10 ? String(index + 1) : '',
        records: Array(50).fill(f.completion.result),
      }))
    },
    (input: ReturnType<typeof snapshot>) => {
      page(input, 'results').records = [{ ...f.completion.result, schoolYear: 'x'.repeat(GAME_RETENTION_LIMITS.bytes) }]
    },
  ]) {
    const input = snapshot(f)
    mutate(input)
    const before = JSON.stringify(input)
    assert.throws(() => previewGameRetentionInventory(input))
    assert.equal(JSON.stringify(input), before)
  }
})

test('output omits teaching text, raw targets and cursors; frozen input is not mutated', () => {
  const input = snapshot()
  const freeze = (value: unknown) => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze)
      Object.freeze(value)
    }
  }
  freeze(input)
  const before = JSON.stringify(input),
    report = previewGameRetentionInventory(input)
  report.details[0].correct = 0
  assert.equal(JSON.stringify(input), before)
  for (const key of ['targets', 'checkpoint', 'pack', 'datasetIds', 'cursor', 'nextCursor']) {
    assert.equal(JSON.stringify(report).includes(`"${key}":`), false)
  }
})

test('empty supplied pages establish neither family ownership nor a complete inventory', () => {
  const input = snapshot()
  input.pages.forEach((p) => {
    p.records = []
  })
  const report = previewGameRetentionInventory(input)
  assert.equal(report.suppliedPagesComplete, true)
  assert.equal(report.completeInventory, false)
  assert.equal(report.familyOwnershipVerified, false)
  assert.equal(report.counts.detailedAttempts, 0)
  input.pages = []
  assert.equal(previewGameRetentionInventory(input).suppliedPagesComplete, false)
})
