import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Eraser, Play, RotateCcw, Save, Sparkles, Undo2, Volume2, X } from 'lucide-react'
import { gradeAudioProfileFor } from '../../audio/gradeAudioProfile.ts'
import { playCachedWordAudio, stopActiveAudio } from '../../audio/lazyPromptAudio.ts'
import type { PracticeSession, PracticeTarget, Word } from '../../domain.ts'
import { SelfAssessmentActions } from '../../practice/SelfAssessmentActions.tsx'
import { buildStrokeOrderRounds } from './rounds.ts'
import { modelAnimationDurationMs, ReferencePad, StrokePad, type InkDrawing } from './StrokeOrderActivity.tsx'
import './strokeOrder.css'

type Props = {
  readonly session: PracticeSession
  readonly target: PracticeTarget
  readonly onExit: () => void
  readonly onAnswer: (correct: boolean, revealMethod: 'timer' | 'skip_timer' | 'show_answer') => void
  readonly onComplete: () => void
}

function promptLabel(session: PracticeSession) {
  const prompt = session.acquisition?.prompt
  if (!prompt) return 'Stroke Order'
  if (prompt.kind === 'familiar-dt') return 'Familiar DT'
  if (prompt.kind === 'earned-dt' || prompt.dtPoolType === 'earned') return 'Earned DT'
  if (session.acquisition?.phase === 'correction') return 'Correction'
  if (session.acquisition?.phase === 'introduction') return 'Introduction'
  return 'Expanded Trial'
}

function playWord(word: Word) {
  const profile = gradeAudioProfileFor('Grade 2')
  return playCachedWordAudio(word, false, {
    playbackRate: profile.dictationRate,
    sentenceRate: profile.dictationRate,
    pauseMs: profile.segmentGapMs,
  }).completed
}

export default function Grade2StrokeOrderAcquisitionExperience({
  session,
  target,
  onExit,
  onAnswer,
  onComplete,
}: Props) {
  const flow = session.acquisition
  const prompt = flow?.prompt
  const built = useMemo(
    () =>
      prompt
        ? buildStrokeOrderRounds([{ id: prompt.word.id, text: prompt.word.text }])
        : { rounds: [], unsupportedTargets: [] },
    [prompt?.id, prompt?.word.id, prompt?.word.text],
  )
  const round = built.rounds[0]
  const [drawing, setDrawing] = useState<InkDrawing>([])
  const [reviewing, setReviewing] = useState(false)
  const [animationKey, setAnimationKey] = useState(0)
  const [modelAnimating, setModelAnimating] = useState(false)
  const [seconds, setSeconds] = useState(prompt?.timerSeconds || 20)
  const [revealMethod, setRevealMethod] = useState<'timer' | 'skip_timer' | 'show_answer'>('show_answer')
  const showModel = Boolean(
    prompt && (prompt.kind === 'show-copy' || flow?.phase === 'introduction' || flow?.phase === 'correction'),
  )

  const replay = useCallback(() => {
    if (!prompt) return
    setAnimationKey((value) => value + 1)
    if (showModel && round) setModelAnimating(true)
    void playWord(prompt.word)
  }, [prompt, round, showModel])

  useEffect(() => {
    setDrawing([])
    setReviewing(false)
    setRevealMethod('show_answer')
    setSeconds(prompt?.timerSeconds || 20)
    setModelAnimating(Boolean(showModel && round))
    setAnimationKey((value) => value + 1)
    if (prompt) void playWord(prompt.word)
    return () => stopActiveAudio()
  }, [prompt?.id, prompt, round, showModel])

  useEffect(() => {
    if (!modelAnimating || !round) return
    const timer = window.setTimeout(() => setModelAnimating(false), modelAnimationDurationMs(round.strokes.length))
    return () => window.clearTimeout(timer)
  }, [animationKey, modelAnimating, round])

  useEffect(() => {
    if (!prompt || reviewing || modelAnimating) return
    let remaining = prompt.timerSeconds
    setSeconds(remaining)
    const timer = window.setInterval(() => {
      remaining -= 1
      setSeconds(Math.max(0, remaining))
      if (remaining <= 0) {
        window.clearInterval(timer)
        setRevealMethod('timer')
        setReviewing(true)
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [prompt?.id, prompt, reviewing, modelAnimating])

  function review(method: 'skip_timer' | 'show_answer' = 'show_answer') {
    setRevealMethod(method)
    setReviewing(true)
  }

  function finishAssessment(correct: boolean) {
    if (!prompt) return
    onAnswer(prompt.kind === 'show-copy' ? true : correct, revealMethod)
  }

  const completed = Boolean(flow?.complete || session.stage === 'complete')
  const scored = session.primaryAnswers.filter((answer) => answer.countsTowardWeeklyScore)
  const correct = scored.filter((answer) => answer.correct).length
  const total = Math.max(session.primaryQueue.length, 1)
  const position = Math.min((flow?.targetIndex || 0) + 1, total)

  return (
    <section className="so-shell is-grade2" data-activity-id="stroke-order-grade2-acquisition">
      <div className="so-atmosphere" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="so-topbar">
        <button className="so-exit" type="button" onClick={onExit}>
          <X size={18} /> Exit game
        </button>
        <div className="so-progress" aria-label={`Stroke Order progress: ${position}/${total}`}>
          <Sparkles size={14} aria-hidden="true" />
          <span>{target.dataset.dateRange}</span>
          <strong>{completed ? 'Complete' : `${position}/${total}`}</strong>
        </div>
      </div>
      <header className="so-heading">
        <p>Grade 2 · Enter the Dojo</p>
        <h1>Stroke Order Acquisition</h1>
      </header>

      {completed ? (
        <section className="so-card so-complete" aria-live="polite">
          <span className="so-complete-mark">
            <Check size={34} />
          </span>
          <p className="so-kicker">Teaching sequence complete</p>
          <h2>Stroke Order progress saved</h2>
          <div className="so-complete-stats">
            <span>
              <strong>{correct}</strong> correct checks
            </span>
            <span>
              <strong>{scored.length - correct}</strong> learning retries
            </span>
          </div>
          <p>You can reenter this date later and practice it again as a separate visit.</p>
          <button className="so-primary" type="button" onClick={onComplete}>
            Return to the Dojo
          </button>
        </section>
      ) : !prompt ? (
        <section className="so-card so-empty" role="status">
          <h2>The saved Stroke Order prompt is unavailable.</h2>
          <button className="so-primary" type="button" onClick={onExit}>
            Return to the Dojo
          </button>
        </section>
      ) : !round ? (
        <section className="so-card so-empty" role="status">
          <h2>Stroke practice is not ready for this prompt.</h2>
          <p>Stroke data is missing for: {prompt.word.text}.</p>
          <button className="so-primary" type="button" onClick={onExit}>
            Return to the Dojo
          </button>
        </section>
      ) : reviewing ? (
        <section className="so-card so-practice-card">
          <p className="so-kicker">{promptLabel(session)} · response ready to compare</p>
          <h2>Compare your writing with the target</h2>
          <div className="so-comparison">
            <section>
              <strong>Your writing</strong>
              <StrokePad
                round={round}
                strokes={drawing}
                showGuide={false}
                animationKey={animationKey}
                label={`${drawing.length} saved strokes`}
              />
            </section>
            <span aria-hidden="true">→</span>
            <section className="is-target">
              <strong>Correct target</strong>
              <ReferencePad round={round} />
            </section>
          </div>
          <button className="so-audio" type="button" onClick={replay}>
            <Volume2 size={18} /> Hear {prompt.word.text}
          </button>
          {prompt.kind === 'show-copy' ? (
            <button className="so-primary" type="button" onClick={() => finishAssessment(true)}>
              Continue
            </button>
          ) : (
            <SelfAssessmentActions
              onIncorrect={() => finishAssessment(false)}
              onCorrect={() => finishAssessment(true)}
            />
          )}
        </section>
      ) : (
        <section className="so-card so-practice-card">
          <p className="so-round-label">
            {promptLabel(session)} · {seconds}s
          </p>
          <div className="so-stroke-heading">
            <div>
              <p className="so-kicker">
                {showModel ? 'Watch the model, then copy' : 'Target hidden · write from memory'}
              </p>
              <h2>
                {showModel ? (
                  <>
                    Practice <span lang="zh-Hans">{prompt.word.text}</span>
                  </>
                ) : (
                  'Listen, then write the word'
                )}
              </h2>
            </div>
            <button className="so-audio" type="button" onClick={replay}>
              <Volume2 size={18} /> Hear it
            </button>
          </div>
          <StrokePad
            round={round}
            strokes={drawing}
            onStrokeComplete={(stroke) => setDrawing((current) => [...current, stroke])}
            showGuide={showModel}
            animationKey={animationKey}
            label={`${showModel ? 'Animated stroke order' : 'Memory writing'} · ${drawing.length} strokes`}
          />
          <div className="so-actions">
            <button
              type="button"
              disabled={!drawing.length}
              onClick={() => setDrawing((current) => current.slice(0, -1))}
            >
              <Undo2 size={17} /> Undo stroke
            </button>
            <button type="button" disabled={!drawing.length} onClick={() => setDrawing([])}>
              <Eraser size={17} /> Clear pad
            </button>
            <button className="so-secondary" type="button" onClick={replay}>
              <Play size={17} /> Replay
            </button>
            <button className="so-secondary" type="button" onClick={() => review('show_answer')}>
              <RotateCcw size={17} /> Review now
            </button>
            <button className="so-secondary" type="button" onClick={() => review('skip_timer')}>
              Skip timer
            </button>
            <button
              className="so-primary"
              type="button"
              disabled={!drawing.length}
              onClick={() => review('show_answer')}
            >
              <Save size={18} /> Save and compare
            </button>
          </div>
          <p className="so-timer">
            {modelAnimating ? 'Model writing · timer starts after the final stroke' : `Your writing time · ${seconds}s`}
          </p>
        </section>
      )}
    </section>
  )
}
