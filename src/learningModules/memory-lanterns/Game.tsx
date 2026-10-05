import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { RotateCcw } from 'lucide-react'
import type { LearningGameAttempt } from './runtime/contracts'
import type { PairGameProps } from './runtime/PairGameShared'
import { memoryDeck, summarizeLearningGame, validGamePairs } from './runtime/model'
import { LearningGameComplete, LearningGameEmpty, LearningGameShell } from './runtime/GameShell'
import { playGameSound, preloadLanternSounds } from './runtime/gameFeel'

export function MemoryFlip({
  pairs,
  playAudio,
  title = 'Memory Lanterns',
  eyebrow = 'Sunset lantern challenge',
  onExit,
  onAttempt,
  onComplete,
}: PairGameProps) {
  const characterPairs = useMemo(() => pairs.map((pair) => ({
    ...pair,
    left: { ...pair.left, id: `${pair.left.id}:copy-one` },
    right: { ...pair.left, id: `${pair.left.id}:copy-two` },
  })), [pairs])
  const deck = useMemo(() => memoryDeck(characterPairs), [characterPairs])
  const [flippedIds, setFlippedIds] = useState<readonly string[]>([])
  const [matchedPairIds, setMatchedPairIds] = useState<readonly string[]>([])
  const [attempts, setAttempts] = useState<readonly LearningGameAttempt[]>([])
  const twoFlipped = flippedIds.length === 2
  const flippedCards = flippedIds.map((id) => deck.find((card) => card.id === id)).filter((card) => Boolean(card))
  const pairMatch = twoFlipped && flippedCards[0]?.pairId === flippedCards[1]?.pairId
  const valid = validGamePairs(characterPairs)
  const complete = valid && matchedPairIds.length === characterPairs.length

  useEffect(() => {
    preloadLanternSounds()
  }, [])

  useEffect(() => {
    if (!twoFlipped) return
    const timer = window.setTimeout(() => {
      const first = deck.find((card) => card.id === flippedIds[0])
      const second = deck.find((card) => card.id === flippedIds[1])
      if (first && second && first.pairId === second.pairId) {
        setMatchedPairIds((current) => current.includes(first.pairId) ? current : [...current, first.pairId])
      }
      setFlippedIds([])
    }, pairMatch ? 1050 : 1450)
    return () => window.clearTimeout(timer)
  }, [deck, flippedIds, pairMatch, twoFlipped])

  useEffect(() => {
    if (!complete) return
    const timer = window.setTimeout(() => playGameSound('lantern-victory'), 360)
    return () => window.clearTimeout(timer)
  }, [complete])

  function flip(cardId: string) {
    if (twoFlipped || flippedIds.includes(cardId)) return
    const card = deck.find((candidate) => candidate.id === cardId)
    if (!card || matchedPairIds.includes(card.pairId)) return
    const next = [...flippedIds, cardId]
    setFlippedIds(next)
    const spoken = new Promise<void>((resolve) => window.requestAnimationFrame(() => {
      void Promise.resolve(playAudio?.(card.face.label, 'zh-CN')).then(() => resolve(), () => resolve())
    }))
    if (next.length !== 2) return
    const first = deck.find((candidate) => candidate.id === next[0])
    const second = deck.find((candidate) => candidate.id === next[1])
    if (!first || !second) return
    const correct = first.pairId === second.pairId
    void spoken.then(() => playGameSound(correct ? 'lantern-match' : 'lantern-miss'))
    const pair = characterPairs.find((candidate) => candidate.id === first.pairId) || characterPairs.find((candidate) => candidate.id === second.pairId)
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

  const summary = summarizeLearningGame('memory-flip', attempts)
  return <LearningGameShell gameId="memory-flip" title={title} eyebrow={eyebrow} progress={`${matchedPairIds.length}/${characterPairs.length} pairs lit`} onExit={onExit}>
    {!valid ? <LearningGameEmpty onExit={onExit} /> : complete ? <LearningGameComplete
      summary={summary}
      message="Every matching lantern is glowing across the sunset courtyard."
      onDone={() => onComplete(summary)}
    /> : <section className="lg-card lg-memory-game">
      <div className="lg-mission-banner"><span>Lantern festival</span><strong>Find each character’s exact twin</strong></div>
      <p className="lg-instruction">Tap a lantern to reveal and hear its character, then find the identical character.</p>
      <div className="lg-stat-row">
        <span><strong>{matchedPairIds.length}/{characterPairs.length}</strong> pairs glowing</span>
        <span><strong>{attempts.length}</strong> turns</span>
      </div>
      <div className="lg-lantern-courtyard">
        <div className="lg-lantern-sky" aria-hidden="true"><i className="lg-setting-sun" /><i className="lg-sunset-cloud is-one" /><i className="lg-sunset-cloud is-two" /><i className="lg-distant-hills" /></div>
        <div className="lg-lantern-buildings" aria-hidden="true">
          <span className="is-left"><i /><b /><em /></span>
          <span className="is-center"><i /><b /><em /></span>
          <span className="is-right"><i /><b /><em /></span>
        </div>
        <div className="lg-pergola" aria-hidden="true"><i /><i /><b /><b /><em /></div>
        <div className="lg-lantern-wires" aria-hidden="true"><i /><i /></div>
        <div className="lg-memory-grid">
          {deck.map((card, cardIndex) => {
            const visible = flippedIds.includes(card.id) || matchedPairIds.includes(card.pairId)
            return <button
              key={card.id}
              data-card-id={card.id}
              type="button"
              className={`lg-memory-card lg-lantern-card${visible ? ' is-visible' : ''}${matchedPairIds.includes(card.pairId) ? ' is-matched' : ''}`}
              style={{ '--lantern-index': cardIndex, '--lantern-delay': `${-(cardIndex % 5) * .23}s` } as CSSProperties}
              disabled={twoFlipped || matchedPairIds.includes(card.pairId)}
              aria-label={visible ? card.face.accessibleLabel || card.face.label : `Hidden lantern ${cardIndex + 1}`}
              onClick={() => flip(card.id)}
            >
              <span className="lg-card-back" aria-hidden="true"><b>{cardIndex + 1}</b><i>福</i><em /></span>
              <span className="lg-card-face" aria-hidden={!visible}><b>{card.face.label}</b><i /><em /></span>
            </button>
          })}
        </div>
      </div>
      {twoFlipped && <div className={`lg-feedback is-${pairMatch ? 'correct' : 'incorrect'} is-auto`} role="status">
        <strong>{pairMatch ? 'The characters match exactly!' : 'Keep their places in mind.'}</strong>
        <span className="lg-feedback-detail">{pairMatch ? 'Two identical characters join the festival.' : 'The lanterns will dim so you can try again.'}</span>
        <span className="lg-auto-status">{pairMatch ? 'Lighting the pair…' : <><RotateCcw size={14} /> Lowering the light…</>}</span>
      </div>}
    </section>}
  </LearningGameShell>
}
