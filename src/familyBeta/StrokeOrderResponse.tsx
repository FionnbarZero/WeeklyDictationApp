import { useEffect, useRef, useState } from 'react'
import type { EngineAcquisitionPrompt } from '../acquisition/contracts.ts'
import { activityClock } from '../activity/activityLifecycle.ts'
import { gradeAudioProfileFor } from '../audio/gradeAudioProfile.ts'
import { withKindergartenAudio } from '../audio/kindergartenAudio.ts'
import {
  type PromptAudioAttempt,
  playCachedWordAudio,
  promptAudioStarted,
  stopPromptAudio,
} from '../audio/promptAudio.ts'
import type { Word } from '../domain/contracts.ts'
import { createPracticeCountdown } from '../practice/countdown.ts'
import { emptyWritingPadState, type WritingPadState } from '../skywriting/model.ts'
import { WritingPad } from '../skywriting/WritingPad.tsx'
import { strokeOrderGuide } from './strokeOrderSlay.ts'

export type StrokeReveal = 'timer' | 'skip_timer'

function Guide({ target, animated = false }: { target: EngineAcquisitionPrompt['word']; animated?: boolean }) {
  const guide = strokeOrderGuide(target)
  // Every model finishes within the ten-second grade-owned teaching interval,
  // including multi-character words. Guides never lengthen that interval.
  const step = Math.min(0.55, 7.5 / guide.strokes.length)
  return (
    <g className={`stroke-acquisition-guide${animated ? ' is-animated' : ''}`} aria-hidden="true">
      {guide.strokes.map((stroke, i) => (
        <g key={i}>
          <path
            d={stroke.map(([x, y], index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ')}
            pathLength={1}
            style={{ animationDelay: `${i * step}s`, animationDuration: `${Math.min(0.46, step)}s` }}
          />
          <text x={stroke[0][0]} y={stroke[0][1]}>
            {guide.strokeLabels[i]}
          </text>
        </g>
      ))}
    </g>
  )
}

/** Temporary response material lives only in this mounted prompt. The parent
 * receives a reviewed boolean and reveal reason, never ink or typed text. */
export function StrokeOrderResponse({
  prompt,
  grade,
  onAnswer,
  onPending,
}: {
  prompt: EngineAcquisitionPrompt
  grade: string
  onAnswer: (correct: boolean, method: StrokeReveal) => Promise<void>
  onPending: (pending: boolean) => void
}) {
  const [pad, setPad] = useState<WritingPadState>(emptyWritingPadState)
  const [stage, setStage] = useState<'listening' | 'writing' | 'review'>('listening')
  const [seconds, setSeconds] = useState(prompt.timerSeconds)
  const [paused, setPaused] = useState(activityClock.paused)
  const [timerPaused, setTimerPaused] = useState(false)
  const [error, setError] = useState('')
  const [audioFailed, setAudioFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [retryAnswer, setRetryAnswer] = useState<boolean | null>(null)
  const countdown = useRef<ReturnType<typeof createPracticeCountdown> | null>(null)
  const audio = useRef<PromptAudioAttempt>(undefined)
  const audioGeneration = useRef(0)
  const mounted = useRef(true)
  const reviewed = useRef(false)
  const busy = useRef(false)
  const reveal = useRef<StrokeReveal>('timer')
  const answerRef = useRef(onAnswer)
  const pendingRef = useRef(onPending)
  answerRef.current = onAnswer
  pendingRef.current = onPending
  const teaching = prompt.kind === 'show-copy'

  function stopAudio() {
    audioGeneration.current++
    stopPromptAudio(audio.current)
    audio.current = undefined
  }
  function compare(method: StrokeReveal) {
    if (activityClock.paused || reviewed.current) return
    reviewed.current = true
    reveal.current = method
    countdown.current?.cancel()
    stopAudio()
    setAudioFailed(false)
    setError('')
    setTimerPaused(false)
    setStage('review')
  }
  function play() {
    if (activityClock.paused || reviewed.current || busy.current) return
    stopAudio()
    const generation = audioGeneration.current
    setError('')
    setAudioFailed(false)
    setStage('listening')
    const profile = gradeAudioProfileFor(grade)
    const word = { ...prompt.word, grade } as Word
    const attempt = playCachedWordAudio(grade === 'Kindergarten' ? withKindergartenAudio(word) : word, false, {
      playbackRate: profile.dictationRate,
      sentenceRate: profile.dictationRate,
      pauseMs: profile.segmentGapMs,
    })
    audio.current = attempt
    const failed = () => {
      if (!mounted.current || reviewed.current || audioGeneration.current !== generation) return
      countdown.current?.pause()
      setStage('listening')
      setAudioFailed(true)
      setError('The writing prompt could not play. Try audio again to continue this response.')
    }
    void promptAudioStarted(attempt)
      .then(() => {
        if (!mounted.current || reviewed.current || audioGeneration.current !== generation) return
        setStage('writing')
        setTimerPaused(false)
        if (!countdown.current)
          countdown.current = createPracticeCountdown(prompt.timerSeconds, setSeconds, () => compare('timer'))
        else countdown.current.resume()
      })
      .catch(failed)
    if (attempt && typeof attempt !== 'function') void attempt.completed.catch(failed)
  }

  useEffect(() => {
    mounted.current = true
    const unsubscribe = activityClock.subscribe((value) => {
      setPaused(value)
      if (!value && !audio.current && !reviewed.current) play()
    })
    play()
    return () => {
      mounted.current = false
      unsubscribe()
      countdown.current?.cancel()
      stopAudio()
      pendingRef.current(false)
    }
    // One panel instance per immutable prompt identity.
  }, [])

  async function assess(correct: boolean) {
    if (activityClock.paused || !reviewed.current || busy.current) return
    busy.current = true
    setSaving(true)
    pendingRef.current(true)
    const selected = retryAnswer ?? correct
    setRetryAnswer(selected)
    try {
      await answerRef.current(selected, reveal.current)
      if (mounted.current) pendingRef.current(false)
    } catch (failure) {
      if (mounted.current)
        setError(failure instanceof Error ? failure.message : 'The reviewed response could not be saved.')
    } finally {
      busy.current = false
      if (mounted.current) setSaving(false)
    }
  }

  return (
    <section className="stroke-response" aria-label="Stroke Order response">
      <div className="prompt-meta">
        <span>
          {prompt.kind === 'familiar-dt'
            ? 'Familiar DT'
            : prompt.kind === 'earned-dt'
              ? 'Earned DT'
              : prompt.phase.replace(/-/g, ' ')}
        </span>
        <span role="timer" aria-label={`${seconds} seconds remaining`}>
          {seconds}s
        </span>
      </div>
      <h2>
        {stage === 'review'
          ? 'Compare your writing'
          : teaching
            ? 'Watch the strokes and copy'
            : 'Listen, then write what you hear'}
      </h2>
      {stage === 'listening' && <p role="status">{audioFailed ? 'Audio needs a retry.' : 'Loading prompt audio…'}</p>}
      {stage === 'writing' && (
        <div className="stroke-controls">
          <button
            disabled={paused}
            onClick={() => {
              if (activityClock.paused) return
              compare('skip_timer')
            }}
          >
            Skip Timer
          </button>
          <button
            disabled={paused}
            onClick={() => {
              if (activityClock.paused) return
              if (timerPaused) countdown.current?.resume()
              else countdown.current?.pause()
              setTimerPaused(!timerPaused)
            }}
          >
            {timerPaused ? 'Resume timer' : 'Pause timer'}
          </button>
          <button
            disabled={paused}
            onClick={() => {
              if (!activityClock.paused) countdown.current?.addSeconds(10)
            }}
          >
            +10s
          </button>
        </div>
      )}
      <div className={`skywriting-workspace stroke-writing-workspace${stage === 'review' ? ' is-review' : ''}`}>
        <section aria-label={stage === 'review' ? 'Your writing' : 'Write your response'}>
          <WritingPad
            disabled={stage !== 'writing' || paused || timerPaused}
            characterCount={[...prompt.word.text].length}
            padState={pad}
            onPadStateChange={(update) => {
              if (!activityClock.paused) setPad(update)
            }}
            guide={
              teaching && stage === 'writing' ? (
                <g transform="scale(10)">
                  <Guide target={prompt.word} animated />
                </g>
              ) : undefined
            }
          />
        </section>
        {stage === 'review' && (
          <section className="stroke-correct-model" aria-label="Correct writing model">
            <p>
              Correct word: <span lang="zh-Hans">{prompt.word.text}</span>
            </p>
            <svg
              viewBox={`0 0 ${[...prompt.word.text].length * 100} 100`}
              role="img"
              aria-label="Numbered stroke order"
            >
              <Guide target={prompt.word} />
            </svg>
            {prompt.word.sentence && <p lang="zh-Hans">{prompt.word.sentence}</p>}
          </section>
        )}
      </div>
      {stage === 'review' && retryAnswer === null && (
        <div className="stroke-controls" aria-label="Self assessment">
          {teaching ? (
            <button disabled={paused || saving} onClick={() => assess(true)}>
              Continue
            </button>
          ) : (
            <>
              <button disabled={paused || saving} onClick={() => assess(false)}>
                Not yet
              </button>
              <button disabled={paused || saving} onClick={() => assess(true)}>
                Yes
              </button>
            </>
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {audioFailed && (
        <button disabled={paused} onClick={play}>
          Try audio again
        </button>
      )}
      {retryAnswer !== null && (
        <button disabled={paused || saving} onClick={() => assess(retryAnswer)}>
          {saving ? 'Saving reviewed response…' : 'Retry saving this response'}
        </button>
      )}
      <p>Your drawing stays in memory. Reloading repeats only this unfinished response with a blank pad.</p>
    </section>
  )
}
