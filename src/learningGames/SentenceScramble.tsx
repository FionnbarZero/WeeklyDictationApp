import { useState } from 'react'
import { RotateCcw, Undo2 } from 'lucide-react'
import type {
  LearningGameAttempt,
  LearningGameBaseProps,
  SequenceGameRound,
} from './contracts.ts'
import {
  sequenceIsCorrect,
  summarizeLearningGame,
  validSequenceRounds,
} from './model.ts'
import {
  LearningGameComplete,
  LearningGameEmpty,
  LearningGameShell,
} from './GameShell.tsx'

export function SentenceScramble({
  rounds,
  title = 'Sentence Scramble',
  eyebrow = 'Tier 2 · Reading',
  onExit,
  onAttempt,
  onComplete,
}: LearningGameBaseProps & { readonly rounds: readonly SequenceGameRound[] }) {
  const [index, setIndex] = useState(0)
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])
  const [attempts, setAttempts] = useState<readonly LearningGameAttempt[]>([])
  const [checked, setChecked] = useState(false)
  const round = rounds[index]
  const valid = validSequenceRounds(rounds)
  const complete = valid && index >= rounds.length
  const correct = Boolean(round && checked && sequenceIsCorrect(round, selectedIds))

  function select(tokenId: string) {
    if (checked || selectedIds.includes(tokenId)) return
    setSelectedIds((current) => [...current, tokenId])
  }

  function remove(tokenId: string) {
    if (checked) return
    setSelectedIds((current) => current.filter((id) => id !== tokenId))
  }

  function undo() {
    if (checked) return
    setSelectedIds((current) => current.slice(0, -1))
  }

  function reset() {
    if (checked) return
    setSelectedIds([])
  }

  function check() {
    if (!round || selectedIds.length !== round.tokens.length) return
    const isCorrect = sequenceIsCorrect(round, selectedIds)
    const attempt: LearningGameAttempt = {
      gameId: 'sentence-scramble',
      promptId: round.id,
      targetId: round.targetId,
      correct: isCorrect,
      response: selectedIds,
      assessmentMode: 'automatic',
    }
    setAttempts((current) => [...current, attempt])
    setChecked(true)
    onAttempt?.(attempt)
  }

  function continueRound() {
    if (correct) setIndex((current) => current + 1)
    setSelectedIds([])
    setChecked(false)
  }

  const summary = summarizeLearningGame('sentence-scramble', attempts)
  return <LearningGameShell title={title} eyebrow={eyebrow} progress={`${Math.min(index, rounds.length)}/${rounds.length}`} onExit={onExit}>
    {!valid ? <LearningGameEmpty onExit={onExit} /> : complete ? <LearningGameComplete
      summary={summary}
      message="You rebuilt every approved sentence."
      onDone={() => onComplete(summary)}
    /> : round ? <section className="lg-card lg-scramble-card">
      <p className="lg-round-label">Sentence {index + 1} of {rounds.length}</p>
      <h2>{round.cueText || 'Put the sentence in reading order'}</h2>
      <div className="lg-sequence-answer" aria-label="Your sentence">
        {selectedIds.length ? selectedIds.map((id) => {
          const token = round.tokens.find((candidate) => candidate.id === id)
          return token ? <button key={id} type="button" disabled={checked} onClick={() => remove(id)}>{token.label}</button> : null
        }) : <span>Choose the first part below</span>}
      </div>
      <div className="lg-sequence-tools">
        <button type="button" disabled={checked || selectedIds.length === 0} onClick={undo}><Undo2 size={15} /> Undo</button>
        <button type="button" disabled={checked || selectedIds.length === 0} onClick={reset}><RotateCcw size={15} /> Reset</button>
      </div>
      <div className="lg-token-bank" aria-label="Available sentence parts">
        {round.tokens.map((token) => <button
          key={token.id}
          type="button"
          disabled={checked || selectedIds.includes(token.id)}
          onClick={() => select(token.id)}
        >{token.label}</button>)}
      </div>
      {!checked && <button className="lg-primary" type="button" disabled={selectedIds.length !== round.tokens.length} onClick={check}>Check sentence</button>}
      {checked && <div className={`lg-feedback is-${correct ? 'correct' : 'incorrect'}`} role="status">
        <strong>{correct ? 'That sentence is in order!' : 'Not quite. Reset the pieces and try again.'}</strong>
        <button className="lg-primary" type="button" onClick={continueRound}>{correct ? 'Next sentence' : <><RotateCcw size={16} /> Reset</>}</button>
      </div>}
    </section> : null}
  </LearningGameShell>
}
