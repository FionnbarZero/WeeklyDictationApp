import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { RotateCcw, Undo2, Volume2 } from 'lucide-react'
import type {
  GameChoice,
  LearningGameAttempt,
  LearningGameBaseProps,
  PlayLearningAudio,
  SequenceGameRound,
} from './runtime/contracts'
import {
  sequenceIsCorrect,
  summarizeLearningGame,
  validSequenceRounds,
} from './runtime/model'
import {
  LearningGameComplete,
  LearningGameEmpty,
  LearningGameShell,
} from './runtime/GameShell'
import { playGameSound } from './runtime/gameFeel'

const SUSHI_TYPES = ['salmon', 'tuna', 'shrimp', 'tamago'] as const
type SushiType = typeof SUSHI_TYPES[number]

function SushiWord({
  token,
  type,
  className = '',
  disabled,
  position,
  action = 'place',
  onClick,
}: {
  readonly token: GameChoice
  readonly type: SushiType
  readonly className?: string
  readonly disabled?: boolean
  readonly position: number
  readonly action?: 'place' | 'remove'
  readonly onClick: () => void
}) {
  return <button
    type="button"
    className={`lg-sushi-piece is-${type}${className ? ` ${className}` : ''}`}
    disabled={disabled}
    aria-label={action === 'remove' ? `Remove ${token.label} from sentence position ${position}` : `Place ${token.label} in sentence position ${position}`}
    onClick={onClick}
  >
    <span className="lg-sushi-body" aria-hidden="true"><i /><b /></span>
    <strong lang="zh-Hans">{token.label}</strong>
  </button>
}

export function SentenceScramble({
  rounds,
  title = 'Sushi Scramble',
  eyebrow = 'Tier 2 · Reading',
  onExit,
  onAttempt,
  onComplete,
  playAudio,
}: LearningGameBaseProps & {
  readonly rounds: readonly SequenceGameRound[]
  readonly playAudio?: PlayLearningAudio
}) {
  const [index, setIndex] = useState(0)
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])
  const [attempts, setAttempts] = useState<readonly LearningGameAttempt[]>([])
  const [checked, setChecked] = useState(false)
  const [carryingId, setCarryingId] = useState<string | null>(null)
  const [promptPlaying, setPromptPlaying] = useState(false)
  const playAudioRef = useRef(playAudio)
  const narrationRequestRef = useRef(0)
  const pickupTimerRef = useRef<number | undefined>(undefined)
  const round = rounds[index]
  const valid = validSequenceRounds(rounds)
  const complete = valid && index >= rounds.length
  const correct = Boolean(round && checked && sequenceIsCorrect(round, selectedIds))
  const sentenceAudioText = round?.audioText || round?.targetText || ''
  const carryingToken = round?.tokens.find((token) => token.id === carryingId)
  const carryingTokenIndex = round?.tokens.findIndex((token) => token.id === carryingId) ?? -1
  const carrierStyle = {
    '--sushi-pickup-x': `${-255 + Math.max(0, carryingTokenIndex) * 170}px`,
    '--sushi-drop-x': `${-225 + selectedIds.length * 150}px`,
  } as CSSProperties

  useEffect(() => {
    playAudioRef.current = playAudio
  }, [playAudio])

  const readSentence = useCallback(() => {
    if (!sentenceAudioText || !playAudioRef.current) return
    const requestId = ++narrationRequestRef.current
    setPromptPlaying(true)
    try {
      void Promise.resolve(playAudioRef.current(sentenceAudioText, 'zh-CN')).catch(() => undefined).finally(() => {
        if (narrationRequestRef.current === requestId) setPromptPlaying(false)
      })
    } catch {
      if (narrationRequestRef.current === requestId) setPromptPlaying(false)
    }
  }, [sentenceAudioText])

  useEffect(() => {
    if (!round || !playAudio) return
    setPromptPlaying(true)
    const timer = window.setTimeout(readSentence, 350)
    return () => window.clearTimeout(timer)
  }, [index, playAudio, readSentence, round])

  useEffect(() => () => {
    narrationRequestRef.current += 1
    if (pickupTimerRef.current !== undefined) window.clearTimeout(pickupTimerRef.current)
  }, [])

  useEffect(() => {
    if (!checked) return
    const timer = window.setTimeout(() => {
      if (correct) setIndex((current) => current + 1)
      setSelectedIds([])
      setChecked(false)
    }, correct ? 1000 : 2400)
    return () => window.clearTimeout(timer)
  }, [checked, correct])

  function select(tokenId: string) {
    if (checked || promptPlaying || carryingId || selectedIds.includes(tokenId)) return
    const next = [...selectedIds, tokenId]
    setCarryingId(tokenId)
    playGameSound('select')
    pickupTimerRef.current = window.setTimeout(() => {
      setSelectedIds(next)
      setCarryingId(null)
      if (round && next.length === round.tokens.length) resolve(next)
    }, 620)
  }

  function remove(tokenId: string) {
    if (checked || promptPlaying || carryingId) return
    setSelectedIds((current) => current.filter((id) => id !== tokenId))
  }

  function undo() {
    if (checked || promptPlaying || carryingId) return
    setSelectedIds((current) => current.slice(0, -1))
  }

  function reset() {
    if (checked || promptPlaying || carryingId) return
    setSelectedIds([])
  }

  function resolve(response: readonly string[]) {
    if (!round || response.length !== round.tokens.length) return
    const isCorrect = sequenceIsCorrect(round, response)
    const attempt: LearningGameAttempt = {
      gameId: 'sentence-scramble',
      promptId: round.id,
      targetId: round.targetId,
      correct: isCorrect,
      response,
      assessmentMode: 'automatic',
    }
    setAttempts((current) => [...current, attempt])
    setChecked(true)
    playGameSound(isCorrect ? 'correct' : 'incorrect')
    onAttempt?.(attempt)
  }

  const summary = summarizeLearningGame('sentence-scramble', attempts)
  return <LearningGameShell gameId="sentence-scramble" title={title} eyebrow={eyebrow} progress={`${Math.min(index + (correct ? 1 : 0), rounds.length)}/${rounds.length} completed`} onExit={onExit}>
    {!valid ? <LearningGameEmpty onExit={onExit} /> : complete ? <LearningGameComplete
      summary={summary}
      message="You rebuilt every approved sentence."
      onDone={() => onComplete(summary)}
    /> : round ? <section className="lg-card lg-scramble-card">
      <p className="lg-round-label">Sentence {index + 1} of {rounds.length}</p>
      <div className="lg-sushi-listen-panel">
        <div>
          <span><Volume2 size={16} aria-hidden="true" /> Listen first</span>
          <strong>{round.cueText || 'Build the Mandarin sentence you hear'}</strong>
          <small>{promptPlaying ? 'The chef is reading the full sentence…' : 'Now place the sushi words in the same order.'}</small>
        </div>
        <button type="button" disabled={promptPlaying || !playAudio || !sentenceAudioText} onClick={readSentence}>
          <Volume2 size={17} aria-hidden="true" /> Hear sentence again
        </button>
      </div>

      <div className={`lg-sushi-counter${checked ? correct ? ' is-complete' : ' is-jammed' : ''}`}>
        <div className="lg-sushi-awning" aria-hidden="true" />
        <div className="lg-sushi-lantern is-left" aria-hidden="true"><i /></div>
        <div className="lg-sushi-lantern is-right" aria-hidden="true"><i /></div>

        {carryingToken && <div className="lg-chopstick-carrier" style={carrierStyle} aria-hidden="true">
          <span className="lg-carry-chopsticks"><i /><i /></span>
          <div className={`lg-sushi-piece is-${SUSHI_TYPES[Math.max(0, carryingTokenIndex) % SUSHI_TYPES.length]} is-carried`}>
            <span className="lg-sushi-body"><i /><b /></span>
            <strong>{carryingToken.label}</strong>
          </div>
        </div>}

        <div className="lg-sushi-answer-zone">
          <div className="lg-sushi-zone-label"><span>Your order</span><strong>{selectedIds.length}/{round.tokens.length} pieces</strong></div>
          <div className="lg-sushi-plate" aria-label="Your sentence order">
            {selectedIds.map((id, position) => {
              const tokenIndex = round.tokens.findIndex((candidate) => candidate.id === id)
              const token = round.tokens[tokenIndex]
              return token ? <SushiWord
                key={id}
                token={token}
                type={SUSHI_TYPES[tokenIndex % SUSHI_TYPES.length]}
                className="is-plated"
                position={position + 1}
                action="remove"
                disabled={checked || promptPlaying || Boolean(carryingId)}
                onClick={() => remove(id)}
              /> : null
            })}
            {Array.from({ length: Math.max(0, round.tokens.length - selectedIds.length) }, (_, slot) => <i className="lg-sushi-place-setting" key={slot} aria-hidden="true"><small>{selectedIds.length + slot + 1}</small></i>)}
          </div>
        </div>

        <div className="lg-sushi-tools">
          <button type="button" disabled={checked || promptPlaying || Boolean(carryingId) || selectedIds.length === 0} onClick={undo}><Undo2 size={15} /> Undo</button>
          <button type="button" disabled={checked || promptPlaying || Boolean(carryingId) || selectedIds.length === 0} onClick={reset}><RotateCcw size={15} /> Clear plate</button>
        </div>

        <div className="lg-sushi-bar" aria-label="Available sushi words">
          {round.tokens.map((token, tokenIndex) => {
            const unavailable = selectedIds.includes(token.id) || carryingId === token.id
            return <SushiWord
              key={token.id}
              token={token}
              type={SUSHI_TYPES[tokenIndex % SUSHI_TYPES.length]}
              className={carryingId === token.id ? 'is-being-picked' : unavailable ? 'is-unavailable' : ''}
              position={selectedIds.length + 1}
              disabled={checked || promptPlaying || Boolean(carryingId) || unavailable}
              onClick={() => select(token.id)}
            />
          })}
        </div>
        {!checked && <p className="lg-sushi-order-note" aria-live="polite">{promptPlaying ? 'Listen to the whole sentence before serving.' : <><strong>{selectedIds.length}/{round.tokens.length}</strong> sushi words plated · checks automatically</>}</p>}
      </div>

      {checked && <div className={`lg-feedback is-${correct ? 'correct' : 'incorrect'} is-auto`} role="status">
        <strong>{correct ? 'Perfect order!' : 'That order needs another try.'}</strong>
        {!correct && <span className="lg-correction-line" lang="zh-Hans">{round.correctTokenIds.map((id) => round.tokens.find((token) => token.id === id)?.label).join(' ')}</span>}
        <span className="lg-feedback-detail">{correct ? 'The chef approves. Correct answer' : 'You’ll plate this same sentence again.'}</span>
        <span className="lg-auto-status">{correct ? 'Next sushi order coming up…' : <><RotateCcw size={14} /> Clearing the plate for your retry…</>}</span>
      </div>}
    </section> : null}
  </LearningGameShell>
}
