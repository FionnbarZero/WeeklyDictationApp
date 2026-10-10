import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { inspectSnapshot } from '../src/familyBeta/curriculum.ts'
import { reinforcementGames, resumableGameCheckpoints } from '../src/familyBeta/gamePools.ts'
import type { BetaGrade, BetaResult } from '../src/familyBeta/model.ts'
import { learningModuleCapability } from '../src/ninjaSkills/content.ts'
import type {
  LearningModuleCohort,
  LearningModuleId,
  LearningModulePack,
  LearningModuleSummary,
} from '../src/ninjaSkills/contracts.ts'
import { GAME_POLICIES, rotatingGameTerms } from '../src/ninjaSkills/policy.ts'
import { NINJA_SKILLS_PROFILES } from '../src/ninjaSkills/profiles.ts'
import { assertGamePack, reviewGameSummary } from '../src/ninjaSkills/review.ts'
import { withSupplementalContent } from '../src/ninjaSkills/supplemental.ts'
import { sequenceIsCorrect } from '../src/learningModules/sushi-scramble/runtime/model.ts'
import { checkpointGameAnswer, completeGameCheckpoint, startGameCheckpoint } from '../src/ninjaSkills/progress.ts'

const grades = [
  ['kindergarten', 'Kindergarten'],
  ['grade2', 'Grade 2'],
  ['grade5', 'Grade 5'],
] as const
const stageB: LearningModuleId[] = ['memory-flip', 'speed-match', 'context-gap-dash', 'sentence-scramble']
function source(slug: string) {
  return inspectSnapshot(
    JSON.parse(readFileSync(new URL(`../public/curriculum/beta/${slug}.json`, import.meta.url), 'utf8')),
  ).datasets
}
function ready(id: LearningModuleId, grade: BetaGrade = 'Grade 5', results: BetaResult[] = []) {
  const slug = grades.find(([, value]) => value === grade)![0]
  const capability = reinforcementGames(source(slug), '2026-10-05', grade, results, 'child').find(
    ({ capability: item }) => (item.status === 'ready' ? item.pack.moduleId : item.moduleId) === id,
  )!.capability
  assert.equal(capability.status, 'ready')
  if (capability.status !== 'ready') throw new Error(capability.reason)
  return capability.pack
}
function prompts(pack: LearningModulePack) {
  return 'pairs' in pack ? pack.pairs : pack.rounds
}
function perfect(pack: LearningModulePack): LearningModuleSummary {
  const attempts =
    'pairs' in pack
      ? pack.pairs.map((pair) => ({
          gameId: pack.moduleId,
          promptId: pair.id,
          targetId: pair.targetId,
          correct: true,
          assessmentMode: 'automatic' as const,
          response:
            pack.moduleId === 'memory-flip' ? [`${pair.id}:left`, `${pair.id}:right`] : [pair.left.id, pair.right.id],
        }))
      : pack.moduleId === 'context-gap-dash'
        ? pack.rounds.map((round) => ({
            gameId: pack.moduleId,
            promptId: round.id,
            targetId: round.targetId,
            correct: true,
            assessmentMode: 'automatic' as const,
            response: round.correctChoiceId,
          }))
        : pack.moduleId === 'sentence-scramble'
          ? pack.rounds.map((round) => ({
              gameId: pack.moduleId,
              promptId: round.id,
              targetId: round.targetId,
              correct: true,
              assessmentMode: 'automatic' as const,
              response: round.correctTokenIds,
            }))
          : []
  return { gameId: pack.moduleId, correct: attempts.length, attempted: attempts.length, attempts }
}

for (const [slug, grade] of grades) {
  test(`${grade}: both-menu resolver uses each game's policy and earlier relevant weeks`, () => {
    const datasets = source(slug)
    const games = reinforcementGames(datasets, '2026-10-05', grade)
    for (const id of stageB) {
      const pack = ready(id, grade)
      assertGamePack(pack)
      assert.ok(
        pack.cohort.provenance.every((p) => datasets.find((d) => d.id === p.datasetId)!.startDate < '2026-10-05'),
      )
      const selected = prompts(pack).map(
        (prompt) => pack.cohort.terms.find((term) => term.occurrenceId === prompt.targetId)!,
      )
      assert.deepEqual(new Set(selected.map((term) => term.tier)), new Set(GAME_POLICIES[id].tiers))
      assert.ok(
        selected.every((term) => term.datasetId && pack.cohort.provenance.some((p) => p.datasetId === term.datasetId)),
      )
      const reviewed = reviewGameSummary(pack, perfect(pack))
      assert.equal(reviewed.correct, prompts(pack).length)
      assert.equal(reviewed.targets.length, prompts(pack).length)
      assert.equal(JSON.stringify(reviewed).includes('response'), false)
      assert.ok(
        reviewed.targets.every(
          (target) => Object.keys(target).sort().join(',') === 'attempted,correct,datasetId,targetId,tier',
        ),
      )
      assert.ok(pack.scopeNote?.includes('source targets'))
    }
    for (const id of ['target-blast', 'dictation-streak']) {
      const game = games.find(({ capability }) => capability.status === 'unavailable' && capability.moduleId === id)
      assert.ok(game, `${id} remains Coming soon until its separate stage`)
    }
    if (grade === 'Grade 2') {
      const pack = ready('speed-match', grade)
      assert.equal(pack.cohort.provenance.length, 2)
      const dates = pack.cohort.provenance.map((p) => datasets.find((d) => d.id === p.datasetId)!.startDate).sort()
      assert.deepEqual(dates, ['2026-09-21', '2026-09-29'])
      const writing = new Set(datasets.find((d) => d.startDate === '2026-09-29')!.words.map((word) => word.id))
      assert.ok(
        pack.cohort.terms.filter((term) => term.tier === 'tier-1').every((term) => writing.has(term.occurrenceId)),
      )
    }
  })
}

test('missing source content stays unavailable; an unsupported week never borrows current targets', () => {
  for (const [slug, grade] of grades) {
    assert.ok(
      reinforcementGames(source(slug), '1900-01-01', grade).every((game) => game.capability.status === 'unavailable'),
    )
  }
  const cohort = ready('speed-match').cohort
  const noMeanings = {
    ...cohort,
    provenance: cohort.provenance.map((p) => ({
      ...p,
      source: { ...p.source, sourceDocumentId: 'different-teacher' },
    })),
    terms: cohort.terms.map((term) => ({ ...term, meaning: undefined, context: undefined })),
  }
  assert.equal(
    learningModuleCapability('speed-match', noMeanings, NINJA_SKILLS_PROFILES['Grade 5']).status,
    'unavailable',
  )
  assert.equal(
    learningModuleCapability('context-gap-dash', noMeanings, NINJA_SKILLS_PROFILES['Grade 5']).status,
    'unavailable',
  )
})

test('saved game menu keeps unfinished and undelivered rounds but hides delivered completions', () => {
  const pack = ready('context-gap-dash')
  const scope = { childId: 'child', grade: 'Grade 5' as const, week: '2026-09-28', gameId: pack.moduleId }
  const started = startGameCheckpoint(scope, pack, 'attempt-one', 'writer-one', '2026-10-05T12:00:00.000Z')
  const first = pack.rounds[0]
  const answer = (round: typeof first) => ({ gameId: pack.moduleId, promptId: round.id, targetId: round.targetId,
    correct: true, assessmentMode: 'automatic' as const, response: round.correctChoiceId })
  const unfinished = checkpointGameAnswer(started, answer(first), '2026-10-05T12:01:00.000Z')
  let finished = unfinished
  for (const round of pack.rounds.slice(1))
    finished = checkpointGameAnswer(finished, answer(round), new Date(Date.parse(finished.reviewedAt!) + 60_000).toISOString())
  const completion = completeGameCheckpoint(finished, '2026-10-05T13:00:00.000Z')

  assert.equal(resumableGameCheckpoints([unfinished], [], 'child', 'Grade 5').get(pack.moduleId)?.attemptId, 'attempt-one')
  assert.equal(resumableGameCheckpoints([finished], [], 'child', 'Grade 5').get(pack.moduleId)?.attemptId, 'attempt-one')
  assert.equal(resumableGameCheckpoints([finished], [completion.result], 'child', 'Grade 5').has(pack.moduleId), false)
  assert.equal(resumableGameCheckpoints([finished], [{ ...completion.result, childId: 'other-child' }], 'child', 'Grade 5').has(pack.moduleId), true)
})

test('generated support never adds targets, changes tiers, overwrites existing content, or claims teacher authorship', () => {
  const pack = ready('speed-match')
  const withoutSupport = {
    ...pack.cohort,
    terms: pack.cohort.terms.map((term) => ({
      ...term,
      meaning: undefined,
      context: undefined,
      supplementalVersion: undefined,
    })),
  }
  const enriched = withSupplementalContent(withoutSupport)
  assert.deepEqual(
    enriched.terms.map((t) => [t.occurrenceId, t.tier, t.text]),
    withoutSupport.terms.map((t) => [t.occurrenceId, t.tier, t.text]),
  )
  assert.ok(enriched.terms.every((term) => term.supplementalVersion && term.meaning))
  assert.deepEqual(withSupplementalContent(pack.cohort), pack.cohort)
  const edited: LearningModuleCohort = {
    ...pack.cohort,
    terms: pack.cohort.terms.map((term) => ({ ...term, meaning: 'Teacher meaning' })),
  }
  assert.ok(withSupplementalContent(edited).terms.every((term) => term.meaning === 'Teacher meaning'))
  assert.match(pack.scopeNote!, /not teacher-authored/)
})

test('Lanterns never falls back to Tier 1 or Tier 3; Shuriken requires both eligible tiers', () => {
  const cohort = ready('speed-match').cohort
  for (const tier of ['tier-1', 'tier-3'] as const) {
    const changed = { ...cohort, terms: cohort.terms.map((term) => ({ ...term, tier })) }
    assert.equal(
      learningModuleCapability('memory-flip', changed, NINJA_SKILLS_PROFILES['Grade 5']).status,
      'unavailable',
    )
    assert.equal(
      learningModuleCapability('speed-match', changed, NINJA_SKILLS_PROFILES['Grade 5']).status,
      'unavailable',
    )
  }
})

test('validated subsets rotate across completed attempts, deduplicate retries, and stay child/cohort scoped', () => {
  const first = ready('memory-flip')
  const result: BetaResult = {
    id: 'done-1',
    childId: 'child',
    grade: 'Grade 5',
    activity: first.title,
    channel: 'game',
    datasetIds: first.cohort.provenance.map((p) => p.datasetId),
    correct: 8,
    attempted: 8,
    completedAt: '2026-10-05T12:00:00Z',
    day: '2026-10-05',
  }
  const next = ready('memory-flip', 'Grade 5', [result])
  assert.notDeepEqual(prompts(first), prompts(next))
  assert.deepEqual(next, ready('memory-flip', 'Grade 5', [result, result]))
  assert.deepEqual(first, ready('memory-flip', 'Grade 5', [{ ...result, childId: 'other' }]))
  assert.deepEqual(first, ready('memory-flip', 'Grade 5', [{ ...result, datasetIds: ['another-week'] }]))
  const reached = new Set<string>()
  for (let visit = 0; visit < first.cohort.terms.length; visit++) {
    for (const term of rotatingGameTerms('memory-flip', first.cohort.terms, 8, visit)) reached.add(term.occurrenceId)
  }
  assert.equal(reached.size, first.cohort.terms.length)
  assert.equal(first.selection!.visit, 0) // already-open round remains pinned
})

test('mixed Shuriken subsets keep both tiers even with an uneven pool', () => {
  for (const length of [13, 16]) {
    const terms = Array.from({ length }, (_, index) => ({
      occurrenceId: String(index),
      text: String(index),
      tier: index ? ('tier-2' as const) : ('tier-1' as const),
    }))
    const reached = new Set<string>()
    for (let visit = 0; visit < length; visit++) {
      const selected = rotatingGameTerms('speed-match', terms, 8, visit)
      assert.deepEqual(new Set(selected.map((t) => t.tier)), new Set(['tier-1', 'tier-2']))
      for (const term of selected) reached.add(term.occurrenceId)
    }
    assert.equal(reached.size, terms.length)
    assert.throws(() => rotatingGameTerms('memory-flip', terms, 8, -1))
  }
})

test('Sushi supports longer sentences and interchangeable identical printed tokens', () => {
  const pack = ready('sentence-scramble')
  assert.ok(pack.moduleId === 'sentence-scramble')
  assert.ok(pack.rounds.some((round) => round.tokens.length > 6))
  for (const round of pack.rounds) {
    assert.notDeepEqual(
      round.tokens.map((token) => token.id),
      round.correctTokenIds,
    )
    assert.ok(sequenceIsCorrect(round, round.correctTokenIds))
  }
  const round = {
    id: 'r',
    targetId: 't',
    targetText: '我和我的猫。',
    tokens: [
      { id: 'a', label: '我' },
      { id: 'b', label: '和' },
      { id: 'c', label: '我' },
      { id: 'd', label: '的猫。' },
    ],
    correctTokenIds: ['a', 'b', 'c', 'd'],
  }
  assert.equal(sequenceIsCorrect(round, ['c', 'b', 'a', 'd']), true)
  assert.equal(sequenceIsCorrect(round, ['a', 'b', 'a', 'd']), false)
  assert.equal(sequenceIsCorrect(round, ['a', 'c', 'b', 'd']), false)
})

test('launch and scoring reject tampered targets, prompt identities, totals, and correctness', () => {
  for (const id of stageB) {
    const pack = ready(id)
    const summary = perfect(pack)
    assert.throws(() => reviewGameSummary(pack, { ...summary, correct: summary.correct + 1 }))
    assert.throws(() =>
      reviewGameSummary(pack, {
        ...summary,
        attempts: [{ ...summary.attempts[0], targetId: 'other-target' }, ...summary.attempts.slice(1)],
      }),
    )
    assert.throws(() =>
      reviewGameSummary(pack, {
        ...summary,
        attempts: [{ ...summary.attempts[0], correct: false }, ...summary.attempts.slice(1)],
      }),
    )
    assert.throws(() => assertGamePack({ ...pack, selection: undefined }))
    const altered = structuredClone(pack)
    const prompt = prompts(altered)[0] as { targetId: string }
    prompt.targetId = 'other-target'
    assert.throws(() => assertGamePack(altered))
  }
})

test('Context Gap records wrong reviewed answers without inventing a correct completion', () => {
  const pack = ready('context-gap-dash')
  assert.ok(pack.moduleId === 'context-gap-dash')
  for (const round of pack.rounds) {
    assert.equal(round.cueText, `${round.sentenceBefore}____${round.sentenceAfter}`)
    assert.equal(round.audioText, `${round.sentenceBefore}${round.targetText}${round.sentenceAfter}`)
  }
  const attempts = pack.rounds.map((round) => ({
    gameId: pack.moduleId,
    promptId: round.id,
    targetId: round.targetId,
    correct: false,
    assessmentMode: 'automatic' as const,
    response: round.choices.find((c) => c.id !== round.correctChoiceId)!.id,
  }))
  const reviewed = reviewGameSummary(pack, { gameId: pack.moduleId, attempted: attempts.length, correct: 0, attempts })
  assert.equal(reviewed.correct, 0)
  assert.ok(reviewed.targets.every((target) => target.attempted === 1 && target.correct === 0))
})
