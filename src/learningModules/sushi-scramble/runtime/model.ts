import type {
  LearningGameAttempt,
  LearningGameId,
  LearningGameSummary,
  SequenceGameRound,
} from './contracts'

function distinctIds(values: readonly { readonly id: string }[]) {
  return new Set(values.map((value) => value.id)).size === values.length
}

export function validSequenceRounds(rounds: readonly SequenceGameRound[]) {
  return rounds.length > 0
    && distinctIds(rounds)
    && rounds.every((round) => round.targetId
      && round.targetText
      && round.tokens.length >= 2
      && distinctIds(round.tokens)
      && round.correctTokenIds.length === round.tokens.length
      && new Set(round.correctTokenIds).size === round.correctTokenIds.length
      && round.correctTokenIds.every((id) => round.tokens.some((token) => token.id === id)))
}

export function sequenceIsCorrect(round: SequenceGameRound, response: readonly string[]) {
  return response.length === round.correctTokenIds.length
    && response.every((id, index) => id === round.correctTokenIds[index])
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
