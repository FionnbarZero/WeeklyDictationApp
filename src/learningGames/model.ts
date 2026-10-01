import type {
  ContextGameRound,
  GamePair,
  LearningGameAttempt,
  LearningGameId,
  LearningGameSummary,
  SelectionGameRound,
  SequenceGameRound,
} from './contracts.ts'

export function distinctGameIds(values: readonly { readonly id: string }[]) {
  return new Set(values.map((value) => value.id)).size === values.length
}

export function validContextRounds(rounds: readonly ContextGameRound[]) {
  return validSelectionRounds(rounds)
    && rounds.every((round) => Boolean(round.sentenceBefore.trim() || round.sentenceAfter.trim()))
}

export function validGamePairs(pairs: readonly GamePair[]) {
  return pairs.length > 0
    && distinctGameIds(pairs)
    && pairs.every((pair) => pair.targetId && pair.left.id && pair.right.id
      && pair.left.id !== pair.right.id && pair.left.label && pair.right.label)
}

export function validSelectionRounds(rounds: readonly SelectionGameRound[]) {
  return rounds.length > 0
    && distinctGameIds(rounds)
    && rounds.every((round) => round.targetId
      && round.targetText
      && round.choices.length >= 2
      && distinctGameIds(round.choices)
      && round.choices.some((choice) => choice.id === round.correctChoiceId))
}

export function validSequenceRounds(rounds: readonly SequenceGameRound[]) {
  return rounds.length > 0
    && distinctGameIds(rounds)
    && rounds.every((round) => round.targetId
      && round.targetText
      && round.tokens.length >= 2
      && distinctGameIds(round.tokens)
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

export function memoryDeck(pairs: readonly GamePair[]) {
  const cards = pairs.flatMap((pair, index) => [
    { id: `${pair.id}:left`, pairId: pair.id, targetId: pair.targetId, face: pair.left },
    { id: `${pair.id}:right`, pairId: pair.id, targetId: pair.targetId, face: pair.right },
  ])
  if (cards.length < 4) return cards
  const left = cards.filter((_, index) => index % 2 === 0)
  const right = cards.filter((_, index) => index % 2 === 1).reverse()
  return left.flatMap((card, index) => right[index] ? [card, right[index]] : [card])
}
