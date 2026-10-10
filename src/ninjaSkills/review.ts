import type { LearningModuleAttempt, LearningModulePack, LearningModuleSummary } from './contracts.ts'
import { learningModuleCapability } from './content.ts'
import { GAME_POLICIES, GAME_POLICY_VERSION } from './policy.ts'
import { NINJA_SKILLS_PROFILES } from './profiles.ts'
import type { SupportedGrade } from '../config.ts'
import { serializeGameRecord } from './serialization.ts'

/** Rebuild against the pinned cohort, not today's source or a new language
 * catalog. The cohort contains the exact supporting content used at launch. */
export function assertGamePack(pack: LearningModulePack) {
  const profile = NINJA_SKILLS_PROFILES[pack.cohort.grade as SupportedGrade]
  if (!profile || !pack.selection || pack.selection.policyVersion !== GAME_POLICY_VERSION)
    throw new Error('This game needs a current validated selection. Return to Ninja Skills.')
  const expected = learningModuleCapability(pack.moduleId, pack.cohort, profile, pack.selection.visit)
  if (expected.status !== 'ready') throw new Error('This game’s required content is not ready.')
  const prompts = (value: LearningModulePack) => ('pairs' in value ? value.pairs : value.rounds)
  if (
    serializeGameRecord(prompts(expected.pack)) !== serializeGameRecord(prompts(pack)) ||
    serializeGameRecord(expected.pack.selection) !== serializeGameRecord(pack.selection)
  )
    throw new Error('This game’s targets do not match its validated selection.')
}

function reviewedCorrect(pack: LearningModulePack, attempt: LearningModuleAttempt) {
  if ('pairs' in pack) {
    if (!Array.isArray(attempt.response) || attempt.response.length !== 2 || new Set(attempt.response).size !== 2)
      throw new Error('Invalid matching response.')
    const cards = pack.pairs.flatMap((pair) => [
      { id: pack.moduleId === 'memory-flip' ? `${pair.id}:left` : pair.left.id, pair },
      { id: pack.moduleId === 'memory-flip' ? `${pair.id}:right` : pair.right.id, pair },
    ])
    const [first, second] = attempt.response.map((id) => cards.find((card) => card.id === id))
    if (!first || !second || first.pair.id !== attempt.promptId || first.pair.targetId !== attempt.targetId)
      throw new Error('The matching response belongs to a different target.')
    return first.pair.id === second.pair.id
  }
  if (pack.moduleId === 'context-gap-dash') {
    const round = pack.rounds.find((round) => round.id === attempt.promptId && round.targetId === attempt.targetId)
    if (
      !round ||
      typeof attempt.response !== 'string' ||
      !round.choices.some((choice) => choice.id === attempt.response)
    )
      throw new Error('The sentence response does not belong to this prompt.')
    return round.correctChoiceId === attempt.response
  }
  if (pack.moduleId === 'sentence-scramble') {
    const round = pack.rounds.find((round) => round.id === attempt.promptId && round.targetId === attempt.targetId)
    const response = attempt.response
    if (
      !round ||
      !Array.isArray(response) ||
      response.length !== round.tokens.length ||
      new Set(response).size !== response.length ||
      response.some((id) => !round.tokens.some((token) => token.id === id))
    )
      throw new Error('The sentence tokens do not belong to this prompt.')
    // Identical printed tokens are interchangeable; do not penalize their IDs.
    return response.every(
      (id, index) =>
        round.tokens.find((token) => token.id === id)!.label ===
        round.tokens.find((token) => token.id === round.correctTokenIds[index])!.label,
    )
  }
  throw new Error('This game’s scoring adapter is coming soon.')
}

/** Validate while the response is in memory, then return only reviewed facts. */
export function reviewGameAnswer(pack: LearningModulePack, attempt: LearningModuleAttempt) {
  assertGamePack(pack)
  return reviewedGameFact(pack, attempt)
}

function reviewedGameFact(pack: LearningModulePack, attempt: LearningModuleAttempt) {
  const term = pack.cohort.terms.find((term) => term.occurrenceId === attempt.targetId)
  if (
    attempt.gameId !== pack.moduleId ||
    attempt.assessmentMode !== 'automatic' ||
    !term?.datasetId ||
    !pack.cohort.provenance.some((source) => source.datasetId === term.datasetId) ||
    reviewedCorrect(pack, attempt) !== attempt.correct
  )
    throw new Error('A game assessment could not be verified against its source target.')
  return {
    promptId: attempt.promptId,
    targetId: term.occurrenceId,
    datasetId: term.datasetId,
    tier: term.tier,
    correct: attempt.correct,
  }
}

/** A privacy-safe reviewed projection, not a persistence schema. Callers must
 * never save module response strings, recordings, or unfinished choices. */
export function reviewGameSummary(pack: LearningModulePack, summary: LearningModuleSummary) {
  assertGamePack(pack)
  if (summary.gameId !== pack.moduleId || !summary.attempts.length || summary.attempts.length > 100000)
    throw new Error('The game summary does not belong to this activity.')
  const targets = new Map<
    string,
    { targetId: string; datasetId: string; tier: string; attempted: number; correct: number }
  >()
  for (const attempt of summary.attempts) {
    const reviewed = reviewedGameFact(pack, attempt)
    const target = targets.get(reviewed.targetId) || {
      targetId: reviewed.targetId,
      datasetId: reviewed.datasetId,
      tier: reviewed.tier,
      attempted: 0,
      correct: 0,
    }
    target.attempted++
    target.correct += Number(attempt.correct)
    targets.set(reviewed.targetId, target)
  }
  const correct = [...targets.values()].reduce((total, target) => total + target.correct, 0)
  if (summary.attempted !== summary.attempts.length || summary.correct !== correct)
    throw new Error('The game totals do not match its reviewed answers.')
  const prompts = 'pairs' in pack ? pack.pairs : pack.rounds
  if (
    prompts.some(
      (prompt) =>
        !(pack.moduleId === 'context-gap-dash'
          ? targets.get(prompt.targetId)?.attempted
          : targets.get(prompt.targetId)?.correct),
    )
  )
    throw new Error('Finish every target in this selected round before saving a completion.')
  return {
    gameId: pack.moduleId,
    policyVersion: GAME_POLICY_VERSION,
    phase: GAME_POLICIES[pack.moduleId].phase,
    attempted: summary.attempted,
    correct,
    targets: [...targets.values()],
  }
}
