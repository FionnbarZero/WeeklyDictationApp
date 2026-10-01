import { useMemo, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type {
  GameChoice,
  GamePair,
  LearningGameAttempt,
  LearningGameBaseProps,
} from './contracts.ts'
import { memoryDeck, summarizeLearningGame, validGamePairs } from './model.ts'
import {
  LearningGameComplete,
  LearningGameEmpty,
  LearningGameShell,
} from './GameShell.tsx'

type PairGameProps = LearningGameBaseProps & {
  readonly pairs: readonly GamePair[]
}

export function SpeedMatch({
  pairs,
  title = 'Speed Match',
  eyebrow = 'Receptive challenge',
  onExit,
  onAttempt,
  onComplete,
}: PairGameProps) {
  const [selectedLeft, setSelectedLeft] = useState<GameChoice | null>(null)
  const [selectedRight, setSelectedRight] = useState<GameChoice | null>(null)
  const [matchedPairIds, setMatchedPairIds] = useState<readonly string[]>([])
  const [attempts, setAttempts] = useState<readonly LearningGameAttempt[]>([])
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null)
  const [lastMessage, setLastMessage] = useState('Pick one tile from each side.')
  const rightPairs = useMemo(() => {
    if (pairs.length < 3) return [...pairs].reverse()
    const split = Math.ceil(pairs.length / 2)
    return [...pairs.slice(split), ...pairs.slice(0, split)]
  }, [pairs])
  const valid = validGamePairs(pairs)
  const complete = valid && matchedPairIds.length === pairs.length

  function resolve(left: GameChoice, right: GameChoice) {
    const pair = pairs.find((candidate) => candidate.left.id === left.id)
    if (!pair) return
    const correct = pair.right.id === right.id
    const attempt: LearningGameAttempt = {
      gameId: 'speed-match',
      promptId: pair.id,
      targetId: pair.targetId,
      correct,
      response: [left.id, right.id],
      assessmentMode: 'automatic',
    }
    const nextAttempts = [...attempts, attempt]
    setAttempts(nextAttempts)
    onAttempt?.(attempt)
    setFeedback(correct ? 'correct' : 'incorrect')
    setLastMessage(correct ? 'Match found—keep moving!' : 'Not a match. Try a different partner.')
    if (correct) setMatchedPairIds((current) => current.includes(pair.id) ? current : [...current, pair.id])
  }

  function chooseLeft(choice: GameChoice) {
    if (feedback || matchedPairIds.some((id) => pairs.find((pair) => pair.id === id)?.left.id === choice.id)) return
    setSelectedLeft(choice)
    if (selectedRight) resolve(choice, selectedRight)
  }

  function chooseRight(choice: GameChoice) {
    if (feedback || matchedPairIds.some((id) => pairs.find((pair) => pair.id === id)?.right.id === choice.id)) return
    setSelectedRight(choice)
    if (selectedLeft) resolve(selectedLeft, choice)
  }

  function continueMatching() {
    setSelectedLeft(null)
    setSelectedRight(null)
    setFeedback(null)
  }

  const summary = summarizeLearningGame('speed-match', attempts)
  return <LearningGameShell title={title} eyebrow={eyebrow} progress={`${matchedPairIds.length}/${pairs.length} pairs`} onExit={onExit}>
    {!valid ? <LearningGameEmpty onExit={onExit} /> : complete ? <LearningGameComplete
      summary={summary}
      message="Every pair has been matched."
      onDone={() => onComplete(summary)}
    /> : <section className="lg-card lg-speed-card">
      <p className="lg-instruction">Choose one tile from each side to make a pair.</p>
      <div className="lg-stat-row" aria-live="polite">
        <span><strong>{matchedPairIds.length}</strong> matched</span>
        <span><strong>{attempts.filter((attempt) => !attempt.correct).length}</strong> misses</span>
      </div>
      <div className="lg-match-board">
        <div className="lg-match-column">
          <span className="lg-lane-label">Targets</span>
          {pairs.map((pair) => <button
            key={pair.left.id}
            type="button"
            className={`lg-choice${selectedLeft?.id === pair.left.id ? ' is-selected' : ''}${matchedPairIds.includes(pair.id) ? ' is-matched' : ''}`}
            disabled={matchedPairIds.includes(pair.id) || Boolean(feedback)}
            aria-label={pair.left.accessibleLabel || pair.left.label}
            onClick={() => chooseLeft(pair.left)}
          >{pair.left.label}</button>)}
        </div>
        <div className="lg-match-column">
          <span className="lg-lane-label">Matches</span>
          {rightPairs.map((pair) => <button
            key={pair.right.id}
            type="button"
            className={`lg-choice${selectedRight?.id === pair.right.id ? ' is-selected' : ''}${matchedPairIds.includes(pair.id) ? ' is-matched' : ''}`}
            disabled={matchedPairIds.includes(pair.id) || Boolean(feedback)}
            aria-label={pair.right.accessibleLabel || pair.right.label}
            onClick={() => chooseRight(pair.right)}
          >{pair.right.label}</button>)}
        </div>
      </div>
      {feedback && <div className={`lg-feedback is-${feedback}`} role="status">
        <strong>{lastMessage}</strong>
        <button className="lg-primary" type="button" onClick={continueMatching}>{feedback === 'correct' ? 'Next pair' : 'Try again'}</button>
      </div>}
    </section>}
  </LearningGameShell>
}

export function MemoryFlip({
  pairs,
  title = 'Memory Flip',
  eyebrow = 'Receptive challenge',
  onExit,
  onAttempt,
  onComplete,
}: PairGameProps) {
  const deck = useMemo(() => memoryDeck(pairs), [pairs])
  const [flippedIds, setFlippedIds] = useState<readonly string[]>([])
  const [matchedPairIds, setMatchedPairIds] = useState<readonly string[]>([])
  const [attempts, setAttempts] = useState<readonly LearningGameAttempt[]>([])
  const twoFlipped = flippedIds.length === 2
  const flippedCards = flippedIds.map((id) => deck.find((card) => card.id === id)).filter((card) => Boolean(card))
  const pairMatch = twoFlipped && flippedCards[0]?.pairId === flippedCards[1]?.pairId
  const valid = validGamePairs(pairs)
  const complete = valid && matchedPairIds.length === pairs.length

  function flip(cardId: string) {
    if (twoFlipped || flippedIds.includes(cardId)) return
    const card = deck.find((candidate) => candidate.id === cardId)
    if (!card || matchedPairIds.includes(card.pairId)) return
    const next = [...flippedIds, cardId]
    setFlippedIds(next)
    if (next.length !== 2) return
    const first = deck.find((candidate) => candidate.id === next[0])
    const second = deck.find((candidate) => candidate.id === next[1])
    if (!first || !second) return
    const correct = first.pairId === second.pairId
    const pair = pairs.find((candidate) => candidate.id === first.pairId) || pairs.find((candidate) => candidate.id === second.pairId)
    if (!pair) return
    const attempt: LearningGameAttempt = {
      gameId: 'memory-flip',
      promptId: pair.id,
      targetId: pair.targetId,
      correct,
      response: next,
      assessmentMode: 'automatic',
    }
    setAttempts((current) => [...current, attempt])
    onAttempt?.(attempt)
  }

  function continueMemory() {
    const matchedCard = flippedCards[0]
    if (pairMatch && matchedCard) {
      setMatchedPairIds((current) => [...current, matchedCard.pairId])
    }
    setFlippedIds([])
  }

  const summary = summarizeLearningGame('memory-flip', attempts)
  return <LearningGameShell title={title} eyebrow={eyebrow} progress={`${matchedPairIds.length}/${pairs.length} pairs`} onExit={onExit}>
    {!valid ? <LearningGameEmpty onExit={onExit} /> : complete ? <LearningGameComplete
      summary={summary}
      message="You remembered every matching location."
      onDone={() => onComplete(summary)}
    /> : <section className="lg-card lg-memory-game">
      <p className="lg-instruction">Turn over two tiles and find every pair.</p>
      <div className="lg-stat-row">
        <span><strong>{matchedPairIds.length}</strong> pairs found</span>
        <span><strong>{attempts.length}</strong> turns</span>
      </div>
      <div className="lg-memory-grid">
        {deck.map((card) => {
          const visible = flippedIds.includes(card.id) || matchedPairIds.includes(card.pairId)
          return <button
            key={card.id}
            type="button"
            className={`lg-memory-card${visible ? ' is-visible' : ''}${matchedPairIds.includes(card.pairId) ? ' is-matched' : ''}`}
            disabled={twoFlipped || matchedPairIds.includes(card.pairId)}
            aria-label={visible ? card.face.accessibleLabel || card.face.label : 'Hidden memory tile'}
            onClick={() => flip(card.id)}
          ><span aria-hidden={!visible}>{visible ? card.face.label : '?'}</span></button>
        })}
      </div>
      {twoFlipped && <div className={`lg-feedback is-${pairMatch ? 'correct' : 'incorrect'}`} role="status">
        <strong>{pairMatch ? 'A matching pair!' : 'Remember those two locations.'}</strong>
        <button className="lg-primary" type="button" onClick={continueMemory}>{pairMatch ? 'Keep going' : <><RotateCcw size={16} /> Turn them back</>}</button>
      </div>}
    </section>}
  </LearningGameShell>
}
