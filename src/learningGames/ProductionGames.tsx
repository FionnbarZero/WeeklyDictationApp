import { useState } from 'react'
import { Headphones, Mic, PencilLine, Sparkles, Volume2 } from 'lucide-react'
import type {
  LearningGameAttempt,
  LearningGameBaseProps,
  LearningGameId,
  PlayLearningAudio,
  ProductionGameRound,
  RenderReadingCapture,
  RenderReadingResponse,
} from './contracts.ts'
import { summarizeLearningGame } from './model.ts'
import {
  LearningGameComplete,
  LearningGameEmpty,
  LearningGameShell,
  SelfAssessmentButtons,
} from './GameShell.tsx'

function validProductionRounds(rounds: readonly ProductionGameRound[]) {
  return rounds.length > 0
    && new Set(rounds.map((round) => round.id)).size === rounds.length
    && rounds.every((round) => round.id && round.targetId && round.targetText)
}

type ProductionRunnerProps = LearningGameBaseProps & {
  readonly gameId: Extract<LearningGameId, 'read-aloud-boss-rush' | 'dictation-streak'>
  readonly rounds: readonly ProductionGameRound[]
  readonly playAudio?: PlayLearningAudio
  readonly defaultTitle: string
  readonly defaultEyebrow: string
  readonly prompt: (round: ProductionGameRound, controls: {
    reveal: () => void
    playAudio?: PlayLearningAudio
    index: number
    total: number
    streak: number
    bestStreak: number
  }) => React.ReactNode
  readonly directResponse?: RenderReadingResponse
  readonly completionMessage: string
}

function ProductionRunner({
  gameId,
  rounds,
  playAudio,
  defaultTitle,
  defaultEyebrow,
  prompt,
  directResponse,
  completionMessage,
  title,
  eyebrow,
  onExit,
  onAttempt,
  onComplete,
}: ProductionRunnerProps) {
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [attempts, setAttempts] = useState<readonly LearningGameAttempt[]>([])
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const round = rounds[index]
  const valid = validProductionRounds(rounds)
  const complete = valid && index >= rounds.length

  function assess(correct: boolean) {
    if (!round) return
    const attempt: LearningGameAttempt = {
      gameId,
      promptId: round.id,
      targetId: round.targetId,
      correct,
      response: correct ? 'correct' : 'practice-again',
      assessmentMode: 'self-assessment',
    }
    setAttempts((current) => [...current, attempt])
    const nextStreak = correct ? streak + 1 : 0
    setStreak(nextStreak)
    setBestStreak((current) => Math.max(current, nextStreak))
    onAttempt?.(attempt)
    setIndex((current) => current + 1)
    setRevealed(false)
  }

  const summary = summarizeLearningGame(gameId, attempts)
  return <LearningGameShell title={title || defaultTitle} eyebrow={eyebrow || defaultEyebrow} progress={`${Math.min(index, rounds.length)}/${rounds.length}`} onExit={onExit}>
    {!valid ? <LearningGameEmpty onExit={onExit} /> : complete ? <LearningGameComplete
      summary={summary}
      message={completionMessage}
      onDone={() => onComplete(summary)}
    /> : round ? <section className={`lg-card lg-production-card lg-${gameId}`}>
      <p className="lg-round-label">Prompt {index + 1} of {rounds.length}</p>
      <div className="lg-stat-row">
        <span><strong>{streak}</strong> streak</span>
        <span><strong>{bestStreak}</strong> best</span>
      </div>
      {directResponse ? directResponse(round, { onAssess: assess, index, total: rounds.length }) : !revealed ? prompt(round, {
        reveal: () => setRevealed(true),
        playAudio,
        index,
        total: rounds.length,
        streak,
        bestStreak,
      }) : <>
        <p className="lg-kicker">Compare with the target</p>
        <div className="lg-reveal-word" lang="zh-Hans">{round.targetText}</div>
        {playAudio && <button className="lg-audio" type="button" onClick={() => void playAudio(round.audioText || round.targetText)}><Volume2 size={20} /> Hear the model</button>}
        <p>How did your response compare?</p>
        <SelfAssessmentButtons onAnswer={assess} />
      </>}
    </section> : null}
  </LearningGameShell>
}

export function ReadAloudBossRush({
  rounds,
  playAudio,
  renderCapture,
  renderResponse,
  ...props
}: LearningGameBaseProps & {
  readonly rounds: readonly ProductionGameRound[]
  readonly playAudio?: PlayLearningAudio
  readonly renderCapture?: RenderReadingCapture
  readonly renderResponse?: RenderReadingResponse
}) {
  return <ProductionRunner
    {...props}
    rounds={rounds}
    playAudio={playAudio}
    gameId="read-aloud-boss-rush"
    defaultTitle="Read-Aloud Boss Rush"
    defaultEyebrow="Tier 2 · Reading"
    completionMessage="Every reading response has been compared."
    directResponse={renderResponse}
    prompt={(round, controls) => <>
      <div className="lg-boss-meter" aria-label={`${controls.total - controls.index} boss power segments remaining`}><span style={{ width: `${((controls.total - controls.index) / controls.total) * 100}%` }} /></div>
      <Mic className="lg-production-icon" size={42} aria-hidden="true" />
      <h2>{round.instruction || 'Read this word aloud'}</h2>
      <div className="lg-prompt-word" lang="zh-Hans">{round.targetText}</div>
      {renderCapture
        ? renderCapture(round, { onReady: controls.reveal })
        : <button className="lg-primary" type="button" onClick={controls.reveal}>I read it aloud</button>}
    </>}
  />
}

export function DictationStreak({
  rounds,
  playAudio,
  ...props
}: LearningGameBaseProps & {
  readonly rounds: readonly ProductionGameRound[]
  readonly playAudio: PlayLearningAudio
}) {
  return <ProductionRunner
    {...props}
    rounds={rounds}
    playAudio={playAudio}
    gameId="dictation-streak"
    defaultTitle="Dictation Streak"
    defaultEyebrow="Tier 1 · Writing"
    completionMessage="You finished the writing streak."
    prompt={(round, controls) => <>
      <PencilLine className="lg-production-icon" size={42} aria-hidden="true" />
      <h2>{round.instruction || 'Listen, then write the word'}</h2>
      <div className="lg-streak-flames" aria-label={`${controls.streak} correct-answer streak`}>
        {Array.from({ length: Math.min(Math.max(controls.streak, 1), 5) }, (_, index) => <span key={index} className={index < controls.streak ? 'is-lit' : ''}>🔥</span>)}
      </div>
      <p>Write on the response surface selected by the activity.</p>
      <button className="lg-audio" type="button" onClick={() => void controls.playAudio?.(round.audioText || round.targetText)}><Headphones size={20} /> Hear the word</button>
      <button className="lg-primary" type="button" onClick={controls.reveal}>Reveal and check</button>
    </>}
  />
}

type StructuredWritingProps = LearningGameBaseProps & {
  readonly rounds: readonly ProductionGameRound[]
  readonly playAudio?: PlayLearningAudio
}

export function CopyHideWriteCombo({
  rounds,
  playAudio,
  title = 'Copy–Hide–Write Combo',
  eyebrow = 'Tier 1 · Writing',
  onExit,
  onAttempt,
  onComplete,
}: StructuredWritingProps) {
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<'copy' | 'write' | 'assess'>('copy')
  const [attempts, setAttempts] = useState<readonly LearningGameAttempt[]>([])
  const round = rounds[index]
  const valid = validProductionRounds(rounds)
  const complete = valid && index >= rounds.length

  function assess(correct: boolean) {
    if (!round) return
    const attempt: LearningGameAttempt = {
      gameId: 'copy-hide-write-combo',
      promptId: round.id,
      targetId: round.targetId,
      correct,
      response: correct ? 'correct' : 'practice-again',
      assessmentMode: 'self-assessment',
    }
    setAttempts((current) => [...current, attempt])
    onAttempt?.(attempt)
    setIndex((current) => current + 1)
    setPhase('copy')
  }

  const summary = summarizeLearningGame('copy-hide-write-combo', attempts)
  const phases = ['copy', 'write', 'assess'] as const
  return <LearningGameShell title={title} eyebrow={eyebrow} progress={`${Math.min(index, rounds.length)}/${rounds.length}`} onExit={onExit}>
    {!valid ? <LearningGameEmpty onExit={onExit} /> : complete ? <LearningGameComplete summary={summary} message="Every copy-and-memory combo is complete." onDone={() => onComplete(summary)} /> : round ? <section className="lg-card lg-production-card lg-copy-card">
      <p className="lg-round-label">Combo {index + 1} of {rounds.length}</p>
      <div className="lg-phase-steps" aria-label={`Current step: ${phase}`}>
        {phases.map((step, stepIndex) => <span key={step} className={step === phase ? 'is-current' : phases.indexOf(phase) > stepIndex ? 'is-complete' : ''}>
          <b>{stepIndex + 1}</b>{step === 'copy' ? 'Look & copy' : step === 'write' ? 'Hide & write' : 'Check'}
        </span>)}
      </div>
      {phase === 'copy' && <>
        <Sparkles className="lg-production-icon" size={42} aria-hidden="true" />
        <h2>Look carefully and copy</h2>
        <div className="lg-reveal-word" lang="zh-Hans">{round.targetText}</div>
        {playAudio && <button className="lg-audio" type="button" onClick={() => void playAudio(round.audioText || round.targetText)}><Volume2 size={20} /> Hear the word</button>}
        <button className="lg-primary" type="button" onClick={() => setPhase('write')}>Hide the word</button>
      </>}
      {phase === 'write' && <>
        <PencilLine className="lg-production-icon" size={42} aria-hidden="true" />
        <h2>Now write it from memory</h2>
        <p>The target stays hidden until the response is finished.</p>
        <button className="lg-primary" type="button" onClick={() => setPhase('assess')}>Reveal and compare</button>
      </>}
      {phase === 'assess' && <>
        <p className="lg-kicker">The target was</p>
        <div className="lg-reveal-word" lang="zh-Hans">{round.targetText}</div>
        <SelfAssessmentButtons onAnswer={assess} />
      </>}
    </section> : null}
  </LearningGameShell>
}

export function CorrectionRescue({
  rounds,
  playAudio,
  copyCount = 3,
  title = 'Correction Rescue',
  eyebrow = 'Tier 1 · Writing',
  onExit,
  onAttempt,
  onComplete,
}: StructuredWritingProps & { readonly copyCount?: number }) {
  const requiredCopies = Math.max(1, Math.floor(copyCount))
  const [index, setIndex] = useState(0)
  const [copiesFinished, setCopiesFinished] = useState(0)
  const [phase, setPhase] = useState<'copy' | 'hidden' | 'assess'>('copy')
  const [attempts, setAttempts] = useState<readonly LearningGameAttempt[]>([])
  const round = rounds[index]
  const valid = validProductionRounds(rounds)
  const complete = valid && index >= rounds.length

  function finishCopy() {
    const next = copiesFinished + 1
    setCopiesFinished(next)
    if (next >= requiredCopies) setPhase('hidden')
  }

  function assess(correct: boolean) {
    if (!round) return
    const attempt: LearningGameAttempt = {
      gameId: 'correction-rescue',
      promptId: round.id,
      targetId: round.targetId,
      correct,
      response: correct ? 'correct' : 'practice-again',
      assessmentMode: 'self-assessment',
    }
    setAttempts((current) => [...current, attempt])
    onAttempt?.(attempt)
    setIndex((current) => current + 1)
    setCopiesFinished(0)
    setPhase('copy')
  }

  const summary = summarizeLearningGame('correction-rescue', attempts)
  return <LearningGameShell title={title} eyebrow={eyebrow} progress={`${Math.min(index, rounds.length)}/${rounds.length}`} onExit={onExit}>
    {!valid ? <LearningGameEmpty onExit={onExit} /> : complete ? <LearningGameComplete summary={summary} message="The correction targets have been rescued." onDone={() => onComplete(summary)} /> : round ? <section className="lg-card lg-production-card lg-rescue-card">
      <p className="lg-round-label">Rescue {index + 1} of {rounds.length}</p>
      <div className="lg-rescue-scene" aria-hidden="true">
        <span className={phase === 'assess' ? 'is-rescued' : ''}>★</span>
        <div>{Array.from({ length: requiredCopies }, (_, step) => <i key={step} className={step < copiesFinished ? 'is-cleared' : ''} />)}</div>
      </div>
      {phase === 'copy' && <>
        <div className="lg-rescue-meter" aria-label={`${copiesFinished} of ${requiredCopies} copies complete`}>
          {Array.from({ length: requiredCopies }, (_, step) => <span key={step} className={step < copiesFinished ? 'is-complete' : ''} />)}
        </div>
        <h2>Copy this target</h2>
        <div className="lg-reveal-word" lang="zh-Hans">{round.targetText}</div>
        {playAudio && <button className="lg-audio" type="button" onClick={() => void playAudio(round.audioText || round.targetText)}><Volume2 size={20} /> Hear the word</button>}
        <button className="lg-primary" type="button" onClick={finishCopy}>Copy {copiesFinished + 1} finished</button>
      </>}
      {phase === 'hidden' && <>
        <PencilLine className="lg-production-icon" size={42} aria-hidden="true" />
        <h2>Write it once with the target hidden</h2>
        <button className="lg-primary" type="button" onClick={() => setPhase('assess')}>Reveal and compare</button>
      </>}
      {phase === 'assess' && <>
        <p className="lg-kicker">The target was</p>
        <div className="lg-reveal-word" lang="zh-Hans">{round.targetText}</div>
        <SelfAssessmentButtons onAnswer={assess} />
      </>}
    </section> : null}
  </LearningGameShell>
}
