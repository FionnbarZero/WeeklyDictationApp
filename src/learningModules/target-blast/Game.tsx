import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Trophy, Volume2 } from 'lucide-react'
import type {
  LearningGameAttempt,
  LearningGameBaseProps,
  PlayLearningAudio,
  SelectionGameRound,
} from './runtime/contracts'
import { summarizeLearningGame, validSelectionRounds } from './runtime/model'
import { LearningGameEmpty, LearningGameShell } from './runtime/GameShell'
import { playGameSound } from './runtime/gameFeel'

type TargetBlastProps = LearningGameBaseProps & {
  readonly rounds: readonly SelectionGameRound[]
  readonly playAudio?: PlayLearningAudio
}

type TargetBlastPhase = 'idle' | 'throwing' | 'impact' | 'teacher-entering' | 'bonk' | 'feedback' | 'resetting'
type TargetBlastAudioState = 'waiting' | 'playing' | 'played' | 'error'

function TargetBlastPlayfield({ round, selectedChoiceId, phase, onChoose }: {
  readonly round: SelectionGameRound
  readonly selectedChoiceId: string | null
  readonly phase: TargetBlastPhase
  readonly onChoose: (choiceId: string) => void
}) {
  const playfieldRef = useRef<HTMLDivElement>(null)
  const selectedIndex = round.choices.findIndex((choice) => choice.id === selectedChoiceId)
  const correct = Boolean(selectedChoiceId && selectedChoiceId === round.correctChoiceId)
  const stageStyle = { '--selected-lane': Math.max(0, selectedIndex) } as CSSProperties

  useLayoutEffect(() => {
    if (!selectedChoiceId) return
    const playfield = playfieldRef.current
    const projectile = playfield?.querySelector<HTMLElement>('.lg-shuriken-shot')
    const target = Array.from(playfield?.querySelectorAll<HTMLButtonElement>('.lg-world-choice') || [])
      .find((choice) => choice.dataset.choiceId === selectedChoiceId)
      ?.querySelector<HTMLElement>('.lg-dojo-target-face')
    if (!playfield || !projectile || !target) return

    const aimProjectile = () => {
      const playfieldRect = playfield.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      const projectileCenterX = projectile.offsetLeft + projectile.offsetWidth / 2
      const projectileCenterY = projectile.offsetTop + projectile.offsetHeight / 2
      const targetCenterX = targetRect.left - playfieldRect.left + targetRect.width / 2
      const targetCenterY = targetRect.top - playfieldRect.top + targetRect.height / 2
      playfield.style.setProperty('--throw-x', `${targetCenterX - projectileCenterX}px`)
      playfield.style.setProperty('--throw-y', `${targetCenterY - projectileCenterY}px`)
    }

    aimProjectile()
    window.addEventListener('resize', aimProjectile)
    return () => window.removeEventListener('resize', aimProjectile)
  }, [round.id, selectedChoiceId])

  return <div ref={playfieldRef} className={`lg-active-playfield lg-target-blast-playfield phase-${phase}${selectedChoiceId ? ` lane-${Math.max(0, selectedIndex)} ${correct ? 'is-success' : 'is-miss'}` : ''}`} style={stageStyle}>
    <div className="lg-dojo-depth" aria-hidden="true">
      <span className="lg-dojo-mountains" />
      <span className="lg-dojo-wall" />
      <span className="lg-dojo-floor" />
      <span className="lg-dojo-lantern is-left"><i /></span>
      <span className="lg-dojo-lantern is-right"><i /></span>
    </div>
    <div className="lg-strike-ninja" aria-hidden="true"><span /><i /><b /><em /><small className="lg-ninja-sash" /><u className="lg-ninja-arm-wrap" /></div>
    <div className="lg-shuriken-shot" aria-hidden="true"><i /></div>
    <div className="lg-dojo-scenery" aria-hidden="true"><i /><i /><i /><i /></div>
    {!correct && ['teacher-entering', 'bonk', 'feedback'].includes(phase) && <div className="lg-ninja-teacher" aria-hidden="true"><span /><i /><b /><em /><small className="lg-sensei-beard" /><u className="lg-sensei-sleeve" /><strong>Bu Hao!!</strong></div>}
    {!correct && phase === 'bonk' && <div className="lg-bonk-impact" aria-hidden="true"><i /><b /><span>WHACK!</span></div>}
    <div className="lg-world-choice-grid" role="group" aria-label="Answer choices">
      {round.choices.map((choice, choiceIndex) => {
        const selected = selectedChoiceId === choice.id
        const answer = Boolean(selectedChoiceId) && round.correctChoiceId === choice.id && (correct || phase === 'feedback')
        const choiceStyle = { '--choice-index': choiceIndex } as CSSProperties
        return <button
          key={choice.id}
          type="button"
          style={choiceStyle}
          data-choice-id={choice.id}
          className={`lg-world-choice${selected ? choice.id === round.correctChoiceId ? ' is-correct' : ' is-incorrect' : ''}${answer ? ' is-answer' : ''}`}
          disabled={Boolean(selectedChoiceId)}
          aria-label={choice.accessibleLabel || choice.label}
          onClick={() => onChoose(choice.id)}
        ><span className="lg-dojo-target-face">{choice.label}</span><i aria-hidden="true" />
          <b className="lg-dojo-burst" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <i key={index} />)}</b>
        </button>
      })}
    </div>
    {selectedChoiceId && phase === 'impact' && <div className="lg-impact-callout is-correct" role="status">
      <strong>SHADOW STRIKE!</strong>
      <span>Correct answer</span>
    </div>}
  </div>
}

function TargetBlastJourneyActor({ className = '' }: { readonly className?: string }) {
  return <span className={`lg-journey-actor is-target-blast${className ? ` ${className}` : ''}`} aria-hidden="true"><i /><b /><em /></span>
}

function TargetBlastJourney({ completed, total }: { readonly completed: number; readonly total: number }) {
  const progress = total ? completed / total : 0
  const journeyStyle = {
    '--journey-progress': `${progress * 100}%`,
    '--training-ninja-x': `${6 + progress * 88}%`,
    '--training-field-scroll': `${progress * -58}%`,
  } as CSSProperties
  return <section className="lg-journey-map is-target-blast lg-training-field" style={journeyStyle} aria-label={`${completed} of ${total} training posts reached`}>
    <div className="lg-journey-copy">
      <span>Training field</span>
      <strong>{completed === total ? 'Master dojo reached' : `Training post ${completed} of ${total}`}</strong>
      <span>Master dojo</span>
    </div>
    <div className="lg-training-viewport" aria-hidden="true">
      <div className="lg-training-world">
        <span className="lg-training-moon" />
        <span className="lg-training-mountains" />
        <span className="lg-training-bamboo"><i /><i /><i /><i /><i /></span>
        <span className="lg-training-path" />
        <span className="lg-training-posts">
          {Array.from({ length: total + 1 }, (_, checkpoint) => <i
            key={checkpoint}
            className={checkpoint <= completed ? 'is-cleared' : ''}
            style={{ '--training-post-x': `${6 + (checkpoint / Math.max(1, total)) * 88}%` } as CSSProperties}
          ><b>{checkpoint}</b></i>)}
        </span>
        <TargetBlastJourneyActor className="lg-training-ninja" />
        <span className="lg-training-dojo"><i /><b /><em /></span>
      </div>
    </div>
  </section>
}

function TargetBlastComplete({ summary, total, onDone }: {
  readonly summary: ReturnType<typeof summarizeLearningGame>
  readonly total: number
  readonly onDone: () => void
}) {
  const accuracy = summary.attempted ? Math.round((summary.correct / summary.attempted) * 100) : 0
  return <section className="lg-card lg-journey-complete is-target-blast" aria-live="polite">
    <div className="lg-finale-sky" aria-hidden="true">
      {Array.from({ length: 18 }, (_, index) => <i key={index} />)}
    </div>
    <div className="lg-finale-stage" aria-hidden="true">
      <TargetBlastJourneyActor />
      <span className="lg-finale-destination"><i /><b /><em /></span>
      <span className="lg-finale-rays"><i /><i /><i /><i /><i /><i /></span>
    </div>
    <div className="lg-finale-copy">
      <span className="lg-finale-trophy"><Trophy size={28} /></span>
      <p className="lg-kicker">{total} checkpoints cleared</p>
      <h2>Master rank reached!</h2>
      <p>You completed every shadow-strike target. Your character made it safely and the whole route is now glowing.</p>
      <div className="lg-complete-stats">
        <span><strong>{accuracy}%</strong> attempt accuracy</span>
        <span><strong>{summary.attempted - summary.correct}</strong> learning retries</span>
      </div>
      <button className="lg-primary" type="button" onClick={onDone}>Celebrate and return</button>
    </div>
  </section>
}

export function TargetBlast({
  rounds,
  playAudio,
  title = 'Shadow Strike Dojo',
  eyebrow = 'Ninja target training',
  onExit,
  onAttempt,
  onComplete,
}: TargetBlastProps) {
  const [index, setIndex] = useState(0)
  const [attempts, setAttempts] = useState<readonly LearningGameAttempt[]>([])
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null)
  const [phase, setPhase] = useState<TargetBlastPhase>('idle')
  const [audioState, setAudioState] = useState<TargetBlastAudioState>('waiting')
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const playAudioRef = useRef(playAudio)
  const audioCycleRef = useRef(0)
  const round = rounds[index]
  const valid = validSelectionRounds(rounds)
  const complete = valid && index >= rounds.length
  const selectedCorrect = Boolean(round && selectedChoiceId === round.correctChoiceId)

  useEffect(() => {
    playAudioRef.current = playAudio
  }, [playAudio])

  const speakPrompt = useCallback(async () => {
    const audioText = round?.audioText
    const play = playAudioRef.current
    if (!audioText || !play) return
    const cycle = ++audioCycleRef.current
    setAudioState('playing')
    try {
      await play(audioText)
      if (cycle === audioCycleRef.current) setAudioState('played')
    } catch {
      if (cycle === audioCycleRef.current) setAudioState('error')
    }
  }, [round?.audioText, round?.id])

  useEffect(() => {
    if (!round?.audioText || !playAudioRef.current) return
    setAudioState('waiting')
    const timer = window.setTimeout(() => void speakPrompt(), 320)
    return () => {
      audioCycleRef.current += 1
      window.clearTimeout(timer)
      window.speechSynthesis?.cancel()
    }
  }, [round?.id, round?.audioText, speakPrompt])

  useEffect(() => {
    if (!selectedChoiceId || !round) return
    let timer: number | undefined
    if (phase === 'throwing') {
      timer = window.setTimeout(() => {
        if (selectedCorrect) playGameSound('correct')
        setPhase(selectedCorrect ? 'impact' : 'teacher-entering')
      }, 460)
    } else if (phase === 'impact') {
      timer = window.setTimeout(() => {
        setIndex((current) => current + 1)
        setSelectedChoiceId(null)
        setPhase('resetting')
      }, 680)
    } else if (phase === 'teacher-entering') {
      timer = window.setTimeout(() => {
        playGameSound('incorrect')
        setPhase('bonk')
      }, 360)
    } else if (phase === 'bonk') {
      timer = window.setTimeout(() => {
        void Promise.resolve(playAudioRef.current?.('不好！', 'zh-CN')).catch(() => undefined)
        setPhase('feedback')
      }, 440)
    } else if (phase === 'feedback') {
      timer = window.setTimeout(() => {
        setSelectedChoiceId(null)
        setPhase('idle')
      }, 800)
    }
    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [phase, round, selectedChoiceId, selectedCorrect])

  useEffect(() => {
    if (phase !== 'resetting') return
    const timer = window.setTimeout(() => setPhase('idle'), 120)
    return () => window.clearTimeout(timer)
  }, [phase])

  function choose(choiceId: string) {
    if (!round || selectedChoiceId) return
    const correct = choiceId === round.correctChoiceId
    const attempt: LearningGameAttempt = {
      gameId: 'target-blast',
      promptId: round.id,
      targetId: round.targetId,
      correct,
      response: choiceId,
      assessmentMode: 'automatic',
    }
    setSelectedChoiceId(choiceId)
    setPhase('throwing')
    setAttempts((current) => [...current, attempt])
    const nextStreak = correct ? streak + 1 : 0
    setStreak(nextStreak)
    setBestStreak((current) => Math.max(current, nextStreak))
    onAttempt?.(attempt)
  }

  const summary = summarizeLearningGame('target-blast', attempts)
  const correctChoice = round?.choices.find((choice) => choice.id === round.correctChoiceId)
  const showFeedback = Boolean(selectedChoiceId) && (phase === 'impact' || phase === 'feedback')
  return <LearningGameShell
    gameId="target-blast"
    title={title}
    eyebrow={eyebrow}
    progress={`${index}/${rounds.length} completed`}
    onExit={onExit}
  >
    {!valid ? <LearningGameEmpty onExit={onExit} /> : complete ? <TargetBlastComplete
      summary={summary}
      total={rounds.length}
      onDone={() => onComplete(summary)}
    /> : round ? <section className="lg-card lg-blast-card">
      <p className="lg-round-label">Training strike {index + 1} of {rounds.length}</p>
      <h2>{round.cueText || 'Strike the correct practice target'}</h2>
      <TargetBlastJourney completed={index} total={rounds.length} />
      {round.audioText && playAudio && <div className={`lg-auto-prompt-status is-${audioState}`} role="status">
        <Volume2 size={18} aria-hidden="true" />
        <span>{audioState === 'playing' ? 'Playing the word…' : audioState === 'played' ? 'Word played automatically' : audioState === 'error' ? 'Audio needs another try' : 'Get ready — the word will play automatically'}</span>
        <button type="button" onClick={() => void speakPrompt()}>Replay word</button>
      </div>}
      <div className="lg-stat-row">
        <span><strong>{streak}</strong> momentum</span>
        <span><strong>{bestStreak}</strong> best run</span>
      </div>
      <TargetBlastPlayfield round={round} selectedChoiceId={selectedChoiceId} phase={phase} onChoose={choose} />
      {showFeedback && <div className={`lg-feedback is-${selectedCorrect ? 'correct' : 'incorrect'} is-auto`} role="status">
        <strong>{selectedCorrect ? `Perfect strike — ${correctChoice?.label || round.targetText}` : `Correct target: ${correctChoice?.label || round.targetText}`}</strong>
        <span className="lg-feedback-detail">{selectedCorrect ? 'The target shattered. Advancing one training mark.' : 'Study the glowing practice target, then strike again.'}</span>
        <span className="lg-auto-status">{selectedCorrect ? index + 1 === rounds.length ? 'Preparing the master trial…' : 'Advancing to the next training mark…' : 'Your retry is almost ready…'}</span>
      </div>}
    </section> : null}
  </LearningGameShell>
}
