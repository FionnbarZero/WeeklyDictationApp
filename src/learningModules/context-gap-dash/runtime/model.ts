import type {
  ContextGameRound,
  LearningGameAttempt,
  LearningGameId,
  LearningGameSummary,
  SelectionGameRound,
} from './contracts'

function distinctIds(values: readonly { readonly id: string }[]) {
  return new Set(values.map((value) => value.id)).size === values.length
}

function validSelectionRounds(rounds: readonly SelectionGameRound[]) {
  return rounds.length > 0
    && distinctIds(rounds)
    && rounds.every((round) => round.targetId
      && round.targetText
      && round.choices.length >= 2
      && distinctIds(round.choices)
      && round.choices.some((choice) => choice.id === round.correctChoiceId))
}

export function validContextRounds(rounds: readonly ContextGameRound[]) {
  return validSelectionRounds(rounds)
    && rounds.every((round) => Boolean(round.sentenceBefore.trim() || round.sentenceAfter.trim()))
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
