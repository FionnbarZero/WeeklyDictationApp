import { nativeWarmupStorage } from './nativeRuntime.ts'
import { Headphones } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { activityClock } from '../activity/activityLifecycle.ts'
import { promptAudioCompleted, stopPromptAudio, type PromptAudioAttempt } from '../audio/promptAudio.ts'
import { writingCharacterGuides } from '../application/writingAcquisition/lesson.ts'
import type { Word } from '../domain.ts'
import { previewProfile } from '../familyBeta/runtime.ts'
import { withScrollsWrite } from '../familyBeta/scrollsCompletion.ts'
import { createPracticeCountdown } from '../practice/countdown.ts'
import { SelfAssessmentActions } from '../practice/SelfAssessmentActions.tsx'
import { emptyWritingPadState, SkyWritingAcquisition, type WritingPadState } from '../skywriting/index.ts'
import { LearningGameShell } from '../strokeTeacherPrototype/original/GameShell.tsx'
import { GuidedCharacter } from './GuidedCharacter.tsx'
import {
  advanceWarmupDesign,
  newWarmupDesign,
  reopenWarmupDesign,
  validateWarmupDesign,
  type WarmupDesignAction,
  type WarmupDesignState,
} from './model.ts'
import { writeNativeWarmup } from './nativeVisit.ts'
import '../writingAcquisition/slayAcquisitionMockup.css'
import './styles.css'

function Countdown({ ready, onComplete }: { ready: boolean; onComplete: () => void }) {
  const [seconds, setSeconds] = useState(10)
  const finish = useRef(onComplete)
  finish.current = onComplete
  useEffect(() => {
    setSeconds(10)
    if (!ready) return
    const timer = createPracticeCountdown(10, setSeconds, () => finish.current())
    return () => timer.cancel()
  }, [ready])
  return (
    <span role="timer" aria-label={`${seconds} seconds remaining`}>
      00:{String(seconds).padStart(2, '0')}
    </span>
  )
}

export default function NativeWarmupTrial({
  word,
  grade,
  visitId,
  position,
  total,
  onSpeakWord,
  onComplete,
  onExit,
  onContinue,
}: {
  word: Word
  grade: string
  visitId: string
  position: number
  total: number
  onSpeakWord: (word: Word) => PromptAudioAttempt
  onComplete: (correct: boolean) => void | Promise<void>
  onExit: () => void
  onContinue?: () => void
}) {
  const key = `native-writing-warmup-trial-v1:${grade}:${visitId}:${position}:${word.id}:${word.text}`
  const [state, setState] = useState<WarmupDesignState>(newWarmupDesign)
  const [loaded, setLoaded] = useState(false)
  const [pad, setPad] = useState<WritingPadState>(emptyWritingPadState)
  const [error, setError] = useState('')
  const [paused, setPaused] = useState(activityClock.paused)
  const [audio, setAudio] = useState<'loading' | 'ready' | 'error'>('loading')
  const [completedAudioKey, setCompletedAudioKey] = useState('')
  const savedRaw = useRef<string | null>(null)
  const saving = useRef(false)
  const mounted = useRef(false)
  const owner = useRef(previewProfile()?.id)
  const attempt = useRef<PromptAudioAttempt>(undefined)
  const request = useRef(0)
  const speak = useRef(onSpeakWord)
  speak.current = onSpeakWord
  const lengths = useMemo(() => [[...word.text].length], [word.text])
  const guideResult = useMemo(() => {
    try {
      return { guides: writingCharacterGuides(word.text), error: '' }
    } catch {
      return {
        guides: [],
        error: 'The stroke guide for this word is unavailable. Your place is saved; please report this word.',
      }
    }
  }, [word.text])
  const guides = guideResult.guides
  const stageKey = `${key}:${state.revision}`
  const stage = useRef(stageKey)
  stage.current = stageKey
  const audioReady = audio === 'ready' && completedAudioKey === stageKey
  const tracing = state.phase === 'trace'
  const comparing = state.phase === 'compare'

  function assertCurrent() {
    if (!mounted.current || activityClock.paused || owner.current !== previewProfile()?.id)
      throw new Error('Reopen this Warmup to continue. Your place is unchanged.')
  }
  useEffect(() => activityClock.subscribe(setPaused), [])
  useEffect(() => {
    mounted.current = true
    void withScrollsWrite(key, () => {
      assertCurrent()
      const storage = nativeWarmupStorage()
      savedRaw.current = storage.getItem(key)
      const next = savedRaw.current
        ? reopenWarmupDesign(validateWarmupDesign(JSON.parse(savedRaw.current), lengths))
        : newWarmupDesign()
      savedRaw.current = writeNativeWarmup(storage, key, savedRaw.current, next)
      return next
    })
      .then((next) => {
        if (mounted.current) {
          setState(next)
          setLoaded(true)
        }
      })
      .catch((e) => {
        if (mounted.current) setError(e instanceof Error ? e.message : 'Warmup could not open.')
      })
    return () => {
      mounted.current = false
    }
  }, [key, lengths])

  const hear = useCallback(() => {
    if (activityClock.paused) return
    const token = ++request.current
    const currentStage = stage.current
    stopPromptAudio(attempt.current)
    setAudio('loading')
    setCompletedAudioKey('')
    try {
      attempt.current = speak.current(word)
      void promptAudioCompleted(attempt.current)
        .then(() => {
          if (mounted.current && request.current === token) {
            setAudio('ready')
            setCompletedAudioKey(currentStage)
          }
        })
        .catch(() => {
          if (mounted.current && request.current === token) setAudio('error')
        })
    } catch {
      setAudio('error')
    }
  }, [word])
  useEffect(() => {
    if (!loaded || state.phase === 'complete') return
    hear()
    return () => {
      request.current++
      stopPromptAudio(attempt.current)
    }
  }, [loaded, state.revision, state.phase, hear])

  async function finish(next: WarmupDesignState) {
    assertCurrent()
    // Only the original independent response reaches grade-owned scoring.
    await onComplete(next.firstAnswers[0])
  }
  async function move(action: WarmupDesignAction) {
    if (!loaded || saving.current || activityClock.paused) return
    saving.current = true
    try {
      const next = await withScrollsWrite(key, () => {
        assertCurrent()
        if (JSON.parse(savedRaw.current || 'null')?.revision !== state.revision)
          throw new Error('This answer has already advanced. Reopen Warmup to continue.')
        const value = advanceWarmupDesign(state, action, lengths)
        savedRaw.current = writeNativeWarmup(nativeWarmupStorage(), key, savedRaw.current, value)
        return value
      })
      if (!mounted.current) return
      setState(next)
      if (next.phase === 'memory' || next.phase === 'trace') setPad(emptyWritingPadState)
      setError('')
      if (next.phase === 'complete') await finish(next)
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'Your place could not be saved. Please try again.')
    } finally {
      saving.current = false
    }
  }
  const exit = () => {
    if (saving.current || activityClock.paused) return
    request.current++
    stopPromptAudio(attempt.current)
    onExit()
  }
  return (
    <div
      id="slay-acquisition-root"
      className="warmup-design native-warmup"
      data-report-activity="Writing Warmup"
      data-report-phase={state.phase}
      data-report-target={word.id}
      data-report-position={position + 1}
      data-report-audio={audio}
    >
      <LearningGameShell
        title="Writing Warmup"
        eyebrow="Writing Warmup"
        progress={`${position + 1} / ${total}`}
        onExit={exit}
      >
        {!loaded ? (
          <section className="warmup-complete">
            <p>Opening your saved place…</p>
          </section>
        ) : state.phase === 'complete' ? (
          <section className="warmup-complete">
            <h2>Word complete</h2>
            <button
              className="lg-primary"
              disabled={paused}
              onClick={() => {
                if (saving.current) return
                saving.current = true
                void finish(state)
                  .catch((e) => setError(e instanceof Error ? e.message : 'Please try saving again.'))
                  .finally(() => {
                    saving.current = false
                  })
              }}
            >
              Continue
            </button>
          </section>
        ) : tracing && guideResult.error ? (
          <section className="warmup-complete" role="alert">
            <p>{guideResult.error}</p>
          </section>
        ) : tracing ? (
          <section
            className="lg-card lg-production-card lg-stroke-order-card warmup-trace"
            aria-label="Warmup stroke guide"
            data-character-index={state.character}
          >
            <div className="warmup-trace-heading">
              <strong>
                Trace · character {state.character + 1} of {lengths[0]}
              </strong>
              <button type="button" className="writing-hear-button" aria-label="Hear" onClick={hear}>
                <Headphones />
                <span>Hear</span>
              </button>
            </div>
            <GuidedCharacter
              key={`${state.index}:${state.character}:${state.revision}`}
              grade={grade}
              paused={paused}
              round={{
                id: `${word.id}:${state.character}`,
                targetId: word.id,
                targetText: [...word.text][state.character],
                word: word.text,
                pinyin: '',
                meaning: '',
                wordCharacterIndex: state.character,
                wordCharacterCount: lengths[0],
                audioText: word.text,
                strokes: guides[state.character],
              }}
              onComplete={() => move({ type: 'character-complete' })}
            />
          </section>
        ) : (
          <div className="practice-page has-skywriting-response">
            <section className={`prompt-card tier1-writing-card is-${comparing ? 'review' : 'dictation'}`}>
              <div className="prompt-meta">
                <strong>
                  {comparing
                    ? 'Compare the whole word'
                    : state.firstAnswers.length > state.index
                      ? 'Try the whole word again'
                      : 'Write from memory'}
                </strong>
                {!comparing && (
                  <Countdown
                    key={`${state.revision}`}
                    ready={audioReady}
                    onComplete={() => move({ type: 'compare' })}
                  />
                )}
              </div>
              <div className="tier1-writing-response">
                <SkyWritingAcquisition
                  word={word.text}
                  phase={comparing ? 'review' : 'writing'}
                  traceTarget={false}
                  presentation="grand-scroll"
                  padState={pad}
                  onPadStateChange={setPad}
                />
              </div>
              <div className={comparing ? 'tier1-review-controls' : 'tier1-writing-instructions'}>
                <div className="tier1-writing-audio-actions">
                  <button type="button" className="writing-hear-button" aria-label="Hear" onClick={hear}>
                    <Headphones />
                    <span>Hear</span>
                  </button>
                  {!comparing && (
                    <button
                      type="button"
                      className="replay-button"
                      disabled={!audioReady}
                      onClick={() => move({ type: 'compare' })}
                    >
                      Skip Timer
                    </button>
                  )}
                </div>
                {comparing && (
                  <SelfAssessmentActions
                    onCorrect={() => move({ type: 'answer', correct: true })}
                    onIncorrect={() => move({ type: 'answer', correct: false })}
                  />
                )}
              </div>
            </section>
          </div>
        )}{' '}
      </LearningGameShell>
      {onContinue && state.firstAnswers.length === 0 && (
        <button
          className="replay-button warmup-continue"
          disabled={paused}
          onClick={() => {
            if (!saving.current && !activityClock.paused) onContinue()
          }}
        >
          Continue to activity
        </button>
      )}
      {loaded && state.phase !== 'complete' && audio !== 'ready' && (
        <p
          className={`warmup-audio ${audio === 'error' ? 'is-error' : ''}`}
          role={audio === 'error' ? 'alert' : 'status'}
        >
          {audio === 'error' ? 'Audio could not finish. Tap Hear to retry; the timer is waiting.' : 'Playing the word…'}
        </p>
      )}
      {error && (
        <p className="warmup-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
