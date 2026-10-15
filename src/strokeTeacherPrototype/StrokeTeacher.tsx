import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { ArrowRight, Play } from 'lucide-react'
import { activityClock } from '../activity/activityLifecycle.ts'
import { playAudioPlan, promptAudioCompleted, stopActiveAudio } from '../audio/promptAudio.ts'
import type { StrokePoint } from '../learningGames/strokeOrder/contracts.ts'
import { TEACHER_STEPS, SIX_STEP_SEQUENCE, type TeacherSequence, strokeFeedback, suppliedStrokes } from './model.ts'
import { LearningGameShell, SelfAssessmentButtons } from './original/GameShell.tsx'
import { DrawingTools, ReferencePad, StrokePad, VocabularyContext } from './original/StrokeUI.tsx'
import type { StrokeOrderGameRound } from './original/contracts.ts'

type Drawing = StrokePoint[][]

export function StrokeTeacher({
  character,
  characterIndex,
  word,
  strokes,
  targetId = 'stroke-preview-hero',
  pinyin = word === '英雄' ? 'yīng xióng' : '',
  meaning = word === '英雄' ? 'hero' : '',
  initialStep = 0,
  sequence = SIX_STEP_SEQUENCE,
  onStepComplete,
  onComplete,
  onExit,
}: {
  character: string
  characterIndex: number
  word: string
  strokes: readonly (readonly StrokePoint[])[]
  targetId?: string
  pinyin?: string
  meaning?: string
  initialStep?: number
  sequence?: TeacherSequence
  onStepComplete?: (step: number) => Promise<void>
  onComplete: () => void
  onExit: () => void
}) {
  const [step, setStep] = useState(initialStep)
  const stage = sequence[step]
  const [drawing, setDrawing] = useState<Drawing>(() =>
    strokes.slice(0, suppliedStrokes(sequence[initialStep], strokes.length)).map((stroke) => [...stroke]),
  )
  const saving = useRef(false)
  const [savingStep, setSavingStep] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [rejected, setRejected] = useState<StrokePoint[] | null>(null)
  const [hint, setHint] = useState(false)
  const [message, setMessage] = useState(() =>
    initialStep === 0
      ? 'Start at 1. Follow the strokes in order.'
      : `Start at stroke ${suppliedStrokes(sequence[initialStep], strokes.length) + 1}.`,
  )
  const [hasError, setHasError] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const [animation, setAnimation] = useState(0)
  const [comparison, setComparison] = useState(false)
  const [paused, setPaused] = useState(activityClock.paused)
  const [audioState, setAudioState] = useState<'idle' | 'playing' | 'ready' | 'error'>('idle')
  const [clueVisible, setClueVisible] = useState(true)
  const [trialVisit, setTrialVisit] = useState(0)
  const audioRequest = useRef(0)
  const hear = useCallback(() => {
    const request = ++audioRequest.current
    setAudioState('playing')
    const attempt = playAudioPlan([{ text: word, language: 'zh-CN', rate: 0.7 }])
    void promptAudioCompleted(attempt)
      .then(() => {
        if (audioRequest.current === request) setAudioState('ready')
      })
      .catch(() => {
        if (audioRequest.current === request) setAudioState('error')
      })
  }, [word])
  const supplied = suppliedStrokes(stage, strokes.length)
  const next = drawing.length
  const complete = next === strokes.length
  const round: StrokeOrderGameRound = {
    id: `grade2-character-teacher-${characterIndex}`,
    targetId,
    targetText: character,
    word,
    pinyin,
    meaning,
    wordCharacterIndex: characterIndex,
    wordCharacterCount: [...word].length,
    audioText: word,
    strokes,
  }

  useEffect(
    () =>
      activityClock.subscribe((value) => {
        setPaused(value)
        setResetKey((current) => current + 1)
      }),
    [],
  )
  useEffect(() => {
    setClueVisible(true)
    hear()
    const hideCard = activityClock.setTimeout(() => setClueVisible(false), 7_000)
    return () => {
      activityClock.clearTimeout(hideCard)
      audioRequest.current += 1
      stopActiveAudio()
    }
  }, [step, trialVisit, hear])
  useEffect(() => {
    if (!rejected) return
    const timer = activityClock.setTimeout(() => setRejected(null), 700)
    return () => activityClock.clearTimeout(timer)
  }, [rejected])

  function clearGesture() {
    setResetKey((value) => value + 1)
    setRejected(null)
    setHasError(false)
    setHint(false)
    setMessage(`Start at stroke ${supplied + 1}.`)
  }
  const updateLearnerDrawing: Dispatch<SetStateAction<Drawing>> = (update) => {
    setDrawing((current) => {
      const learner = current.slice(supplied)
      const changed = typeof update === 'function' ? update(learner) : update
      return [...strokes.slice(0, supplied).map((stroke) => [...stroke]), ...changed]
    })
  }
  async function nextStep(confirmed = false) {
    if (!complete || paused || saving.current) return
    if (stage === 5 && !confirmed) {
      setComparison(true)
      return
    }
    if (onStepComplete) {
      saving.current = true
      setSavingStep(true)
      setSaveError('')
      try {
        await onStepComplete(step)
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'The step could not be saved. Please retry.')
        return
      } finally {
        saving.current = false
        setSavingStep(false)
      }
    }
    if (stage === 5) {
      // A durable parent may already have mounted the next character's audio.
      // Its normal unmount cleanup owns cancellation of this character.
      if (!onStepComplete) stopActiveAudio()
      onComplete()
      return
    }
    const following = step + 1
    const prefix = suppliedStrokes(sequence[following], strokes.length)
    setStep(following)
    setDrawing(strokes.slice(0, prefix).map((stroke) => [...stroke]))
    setRejected(null)
    setHint(false)
    setHasError(false)
    setResetKey((value) => value + 1)
    setAnimation((value) => value + 1)
    setMessage(`Start at stroke ${prefix + 1}.`)
  }
  function repeatIndependent() {
    setComparison(false)
    setDrawing([])
    setTrialVisit((value) => value + 1)
    clearGesture()
  }
  const instructions =
    stage < 3
      ? 'Follow the numbered strokes in order.'
      : stage < 5
        ? `I wrote strokes 1–${supplied}. You finish ${supplied + 1}–${strokes.length}.`
        : 'Write every stroke in order, then compare.'
  const phase = comparison ? 2 : stage < 3 ? 0 : 1

  return (
    <LearningGameShell
      gameId="stroke-order-slay-grade-2"
      title="Stroke-order Slay - 2nd"
      eyebrow="2nd Grade · Touch Writing"
      progress={`${characterIndex + (comparison ? 1 : 0)}/${[...word].length} completed`}
      onExit={onExit}
    >
      <section
        className="lg-card lg-production-card lg-stroke-order-card lg-stroke-profile-grade-2"
        aria-label="Stroke order teacher"
        data-step={step + 1}
        data-character-index={characterIndex}
        data-report-activity="Writing stroke teacher"
        data-report-phase={`character-${characterIndex + 1}:step-${step + 1}`}
        data-report-target={targetId}
        data-report-position={characterIndex + 1}
        data-report-audio={audioState}
      >
        <div className="lg-stroke-roundbar">
          <p className="lg-round-label">
            Character {characterIndex + 1} / {[...word].length} · Step {step + 1} of {sequence.length}
          </p>
          <div className="lg-phase-steps" aria-label={`Current step: ${TEACHER_STEPS[stage]}`}>
            {['Trace', 'Write', 'Compare'].map((label, index) => (
              <span
                key={label}
                aria-current={phase === index ? 'step' : undefined}
                className={phase === index ? 'is-current' : phase > index ? 'is-complete' : ''}
              >
                <b>{index + 1}</b>
                {label}
              </span>
            ))}
          </div>
        </div>
        <VocabularyContext
          round={round}
          audioState={audioState}
          clueVisible={clueVisible}
          onPlay={() => {
            void hear()
          }}
        />
        {saveError && <p role="alert">{saveError}</p>}
        {savingStep && <p role="status">Saving step…</p>}
        {comparison ? (
          <div className="lg-stroke-review">
            <div className="lg-stroke-comparison">
              <section>
                <strong>Your writing</strong>
                <StrokePad
                  round={round}
                  strokes={drawing}
                  showGuide={false}
                  animationKey={animation}
                  animationStepSeconds={0.7}
                  label="Your completed character"
                />
              </section>
              <section className="is-target">
                <strong>Correct character</strong>
                <ReferencePad round={round} />
              </section>
            </div>
            <SelfAssessmentButtons
              incorrectLabel="Trace it again"
              correctLabel="I slayed it"
              onAnswer={(correct) => {
                if (paused || saving.current) return
                if (correct) void nextStep(true)
                else repeatIndependent()
              }}
            />
          </div>
        ) : (
          <div className="lg-stroke-workspace">
            <StrokePad
              key={step}
              round={round}
              strokes={drawing}
              onStrokesChange={paused || savingStep ? undefined : setDrawing}
              showGuide
              animationKey={animation}
              animationStepSeconds={stage === 0 ? 0.7 : 0}
              resetKey={resetKey}
              rejectedStroke={rejected}
              suppliedStrokeCount={supplied}
              guideMode={stage < 3 ? 'full' : stage < 5 ? 'faded' : 'hidden'}
              hintStrokeIndex={hint && !complete ? next : undefined}
              label={`Trace the guide · ${drawing.length - supplied}/${strokes.length - supplied} strokes`}
              validateStroke={(stroke, index) =>
                !paused && index < strokes.length && strokeFeedback(stroke, strokes, index) === null
              }
              onStrokeAccepted={() => {
                setRejected(null)
                setHint(false)
                setHasError(false)
                setMessage(next + 1 === strokes.length ? 'Character complete!' : `Good! Next is stroke ${next + 2}.`)
              }}
              onStrokeRejected={(stroke) => {
                if (complete) return
                setRejected(stroke)
                setHint(true)
                setHasError(true)
                setAnimation((value) => value + 1)
                setMessage(strokeFeedback(stroke, strokes, next) || 'Try that stroke again.')
              }}
            />
            <div className="lg-stroke-actions">
              <p className={`lg-stroke-status${hasError ? ' is-error' : ''}`} role="status">
                <strong>
                  {drawing.length - supplied} / {strokes.length - supplied}
                </strong>
                <span>{TEACHER_STEPS[stage]}</span>
                <span>{instructions}</span>
                <span>{message}</span>
              </p>
              <DrawingTools
                drawing={drawing.slice(supplied)}
                setDrawing={updateLearnerDrawing}
                onReset={clearGesture}
                hasRejectedStroke={Boolean(rejected)}
              />
              <button
                className="lg-stroke-replay"
                type="button"
                aria-label="Replay stroke order"
                disabled={paused}
                onClick={() => {
                  setHint(true)
                  setAnimation((value) => value + 1)
                }}
              >
                <Play size={18} /> Replay
              </button>
              <button
                className="lg-primary"
                type="button"
                disabled={paused || savingStep || !complete}
                onClick={() => void nextStep()}
              >
                {stage === 5 ? 'Compare' : 'Next step'} <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}
      </section>
    </LearningGameShell>
  )
}
