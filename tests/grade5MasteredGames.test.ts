import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { datasetFromCanonicalCandidate } from '../src/curriculum/datasetProjection.ts'
import type { Dataset } from '../src/domain/contracts.ts'
import type { BetaResult } from '../src/familyBeta/model.ts'
import {
  buildGrade5AssessmentPayload,
  extractGrade5Assessment,
} from '../src/grade5PresentationPreview/assessmentSource.ts'
import { grade5MasteredDatasets, grade5MasteredGames } from '../src/grade5PresentationPreview/masteredGames.ts'
import { buildGrade5LearningHub } from '../src/grade5Lab/learningHub.ts'
import { assertGamePack } from '../src/ninjaSkills/review.ts'

function fixture() {
  const baseline = JSON.parse(
    readFileSync(new URL('./fixtures/dojo-launch-2026-10-16/grade5.json', import.meta.url), 'utf8'),
  )
  const source = extractGrade5Assessment(buildGrade5AssessmentPayload(baseline.payload))
  const all = source.classification.selectedCandidates
    .filter((candidate) => candidate.status === 'valid')
    .map(datasetFromCanonicalCandidate)
  const ids = new Set(
    buildGrade5LearningHub(source, '2026-10-21')
      .sections.find((section) => section.id === 'review')!
      .cohorts.map((cohort) => cohort.cohortId),
  )
  const mastered = all.filter((dataset) => ids.has(dataset.id))
  return { all, mastered, pool: grade5MasteredDatasets(mastered, all, '2026-10-21') }
}
const words = (datasets: Dataset[]) =>
  datasets.flatMap((dataset) => [...dataset.words, ...(dataset.vocabulary?.tier2 || [])])
const activeEight = ['或者', '了解', '完', '兴奋的', '告诉', '沟通', '快速地', '有意思']

test('Grade 5 mastered arcade uses only the three lifecycle-mastered sets and excludes all active repeated words', () => {
  const { mastered, all, pool } = fixture()
  const original = structuredClone(all)
  assert.equal(mastered.length, 3)
  assert.equal(new Set(words(pool).map((word) => word.text)).size, 28)
  assert.equal(words(pool).length, 28)
  assert.ok(pool.every((dataset) => mastered.some((source) => source.id === dataset.id)))
  assert.ok(words(pool).every((word) => !activeEight.includes(word.text)))
  assert.deepEqual(all, original)
  assert.equal(grade5MasteredDatasets([], all, '2026-10-21').length, 0)
})

test('future repeats do not suppress mastered words, but arrived repeats in either channel do', () => {
  const { mastered, all, pool } = fixture()
  const word = pool[0].vocabulary!.tier2[0]
  const repeated: Dataset = {
    ...pool[0],
    id: 'future',
    startDate: '2026-10-22',
    words: [word],
    vocabulary: { tier1: [word], tier2: [], tier3: [] },
  }
  assert.ok(
    words(grade5MasteredDatasets(mastered, [...all, repeated], '2026-10-21')).some((item) => item.text === word.text),
  )
  repeated.startDate = '2026-10-21'
  assert.ok(
    words(grade5MasteredDatasets(mastered, [...all, repeated], '2026-10-21')).every((item) => item.text !== word.text),
  )
  repeated.grade = 'Grade 2'
  assert.ok(
    words(grade5MasteredDatasets(mastered, [...all, repeated], '2026-10-21')).some((item) => item.text === word.text),
  )
})

test('duplicates are removed within each channel without removing its separate reading and writing occurrences', () => {
  const { pool } = fixture()
  const base = pool[1]
  const writing = base.words[0]
  const reading = { ...writing, id: 'reading-copy', tier: 'tier-2' as const }
  const duplicate = {
    ...base,
    words: [writing, writing],
    vocabulary: { tier1: [writing, writing], tier2: [reading, reading], tier3: [] },
  }
  const result = grade5MasteredDatasets([duplicate], [duplicate], '2026-10-21')
  assert.equal(result[0].words.length, 1)
  assert.equal(result[0].vocabulary!.tier2.length, 1)
})

test('all five Ninja Skills games are ready, bounded, reconstructable and use mastered source occurrences only', () => {
  const { pool } = fixture()
  const eligible = new Set(words(pool).map((word) => word.id))
  const games = grade5MasteredGames(pool, [], 'test-child')
  assert.deepEqual(
    games.map((game) => (game.capability.status === 'ready' ? game.capability.pack.moduleId : '')),
    ['speed-match', 'target-blast', 'memory-flip', 'context-gap-dash', 'sentence-scramble'],
  )
  for (const { capability } of games) {
    assert.equal(capability.status, 'ready')
    if (capability.status !== 'ready') throw new Error(capability.reason)
    assertGamePack(capability.pack)
    assert.ok(capability.pack.cohort.terms.every((term) => eligible.has(term.occurrenceId)))
    assert.ok(capability.pack.cohort.terms.every((term) => !activeEight.includes(term.text)))
    assert.match(capability.pack.scopeNote!, /generated and validated, not teacher-authored/)
    assert.ok(capability.pack.selection.included <= 10)
  }
})

test('only distinct mastered-game completions for this child advance round rotation', () => {
  const { pool } = fixture()
  const completion: BetaResult = {
    schema: 1,
    id: 'result-1',
    childId: 'test-child',
    grade: 'Grade 5',
    schoolYear: pool[0].schoolYear,
    activity: 'Shuriken Match',
    channel: 'game',
    datasetIds: pool.map((dataset) => dataset.id),
    correct: 8,
    attempted: 8,
    completedAt: '2026-10-21T12:00:00.000Z',
    day: '2026-10-21',
  }
  const cases: [BetaResult[], number][] = [
    [[completion, completion], 1],
    [[{ ...completion, childId: 'other-child' }], 0],
    [[{ ...completion, channel: 'reading' }], 0],
    [[{ ...completion, datasetIds: ['grade-5__2026-27__2026-10-19__2026-10-23'] }], 0],
  ]
  for (const [history, expected] of cases) {
    const capability = grade5MasteredGames(pool, history, 'test-child')[0].capability
    assert.equal(capability.status, 'ready')
    if (capability.status === 'ready') assert.equal(capability.pack.selection.visit, expected)
  }
})

test('an empty mastered pool never falls back to current assessment targets', () => {
  const games = grade5MasteredGames([], [], 'test-child')
  assert.equal(games.length, 5)
  assert.ok(games.every((game) => game.capability.status === 'unavailable' && game.datasets.length === 0))
})
