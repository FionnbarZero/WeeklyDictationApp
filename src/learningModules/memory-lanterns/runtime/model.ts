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

export function memoryDeck(
  pairs: readonly GamePair[],
  random: () => number = Math.random,
) {
  const cards = pairs.flatMap((pair) => [
    { id: `${pair.id}:left`, pairId: pair.id, targetId: pair.targetId, face: pair.left },
    { id: `${pair.id}:right`, pairId: pair.id, targetId: pair.targetId, face: pair.right },
  ])

  // Fisher-Yates gives every layout an equal chance instead of arranging the
  // two copies in a predictable pattern. This runs once for every game mount.
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]]
  }

  return cards
}
