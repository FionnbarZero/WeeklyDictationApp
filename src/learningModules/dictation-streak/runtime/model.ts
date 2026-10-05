import type { LearningGameAttempt, LearningGameId, LearningGameSummary, ProductionGameRound } from './contracts'

export function validDictationRound(round: ProductionGameRound) {
  if (round.pinyinSteps === undefined) return true
  const targetCharacters = Array.from(round.targetText.trim())
  return round.pinyinSteps.length === targetCharacters.length
    && round.pinyinSteps.length > 0
    && round.pinyinSteps.every((step) => Boolean(step.pinyin.trim())
      && step.candidates.length > 0
      && new Set(step.candidates).size === step.candidates.length
      && step.candidates.every((candidate) => Array.from(candidate).length === 1))
}

export function summarizeLearningGame(
  gameId: LearningGameId,
  attempts: readonly LearningGameAttempt[],
): LearningGameSummary {
  return {
    gameId,
    attempted: attempts.length,
    correct: attempts.filter((attempt) => attempt.correct).length,
    attempts: [...attempts],
  }
}
