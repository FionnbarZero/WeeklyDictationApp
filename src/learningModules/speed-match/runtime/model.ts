import type {
  GamePair,
  LearningGameAttempt,
  LearningGameId,
  LearningGameSummary,
} from './contracts'

function distinctIds(values: readonly { readonly id: string }[]) {
  return new Set(values.map((value) => value.id)).size === values.length
}

export function validGamePairs(pairs: readonly GamePair[]) {
  return pairs.length > 0
    && distinctIds(pairs)
    && pairs.every((pair) => pair.targetId && pair.left.id && pair.right.id
      && pair.left.id !== pair.right.id && pair.left.label && pair.right.label)
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
