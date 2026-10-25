import { Headphones } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { activityClock } from '../activity/activityLifecycle.ts'
import { gradeAudioProfileFor } from '../audio/gradeAudioProfile.ts'
import {
  type PromptAudioAttempt,
  playCachedWordAudio,
  promptAudioCompleted,
  stopPromptAudio,
} from '../audio/promptAudio.ts'
import { ProblemReporter } from '../familyBeta/ProblemReporter.tsx'
import { withScrollsWrite } from '../familyBeta/scrollsCompletion.ts'
import { createPracticeCountdown } from '../practice/countdown.ts'
import { SelfAssessmentActions } from '../practice/SelfAssessmentActions.tsx'
import { emptyWritingPadState, SkyWritingAcquisition, type WritingPadState } from '../skywriting/index.ts'
import { teacherProfileForGrade } from '../strokeTeacherPrototype/gradeProfiles.ts'
import { LearningGameShell } from '../strokeTeacherPrototype/original/GameShell.tsx'
import { enablePreviewSpeechFromTap } from '../writingAcquisition/previewSpeech.ts'
import { GuidedCharacter } from './GuidedCharacter.tsx'
import {
  advanceWarmupDesign,
  newWarmupDesign,
  reopenWarmupDesign,
  validateWarmupDesign,
  type WarmupDesignAction,
  type WarmupDesignState,
} from './model.ts'
import { type WarmupGrade, warmupGrades, warmupSamples, warmupSlugs } from './samples.ts'
import '../styles.css'
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

function WarmupDesign() {
  const [grade, setGrade] = useState<WarmupGrade>(
    () =>
      warmupGrades.find((g) => warmupSlugs[g] === new URLSearchParams(location.search).get('grade')) || 'Kindergarten',
  )
  const [state, setState] = useState<WarmupDesignState>(newWarmupDesign)
  const [active, setActive] = useState(false)
  const [pad, setPad] = useState<WritingPadState>(emptyWritingPadState)
  const [error, setError] = useState('')
  const [paused, setPaused] = useState(activityClock.paused)
  const [audio, setAudio] = useState<'loading' | 'ready' | 'error'>('loading')
  const [completedAudioKey, setCompletedAudioKey] = useState('')
  const attemptRef = useRef<PromptAudioAttempt>(undefined)
  const audioRequest = useRef(0)
  const savedRaw = useRef<string | null>(null)
  const saving = useRef(false)
  const samples = useMemo(() => warmupSamples(grade), [grade])
  const lengths = samples.map((s) => [...s.word.text].length)
  const word = samples[state.index]?.word
  const key = `ninja-warmup-design-v1:${warmupSlugs[grade]}`
  const signature = samples.map((s) => `${s.word.id}:${s.word.text}`).join('|')
  const revision = import.meta.env.VITE_GIT_REVISION || 'development'
  const stageKey = `${grade}:${state.revision}`
  const stageRef = useRef(stageKey)
  stageRef.current = stageKey
  const audioReady = audio === 'ready' && completedAudioKey === stageKey

  useEffect(() => activityClock.subscribe(setPaused), [])
  async function store(next: WarmupDesignState) {
    // Only this explicitly isolated sample key is writable. A second tab cannot
    // silently overwrite a newer reviewed result. Never serialize handwriting.
    await withScrollsWrite(key, () => {
      if (activityClock.paused) throw new Error('Close the report before continuing. Your place is unchanged.')
      if (localStorage.getItem(key) !== savedRaw.current)
        throw new Error('This prototype changed in another tab. Exit and reopen to use its saved place.')
      const raw = JSON.stringify({ signature, state: next })
      localStorage.setItem(key, raw)
      if (localStorage.getItem(key) !== raw) throw new Error('Your place could not be saved. Please try again.')
      savedRaw.current = raw
    })
    // Publish the next controls only after the lock has been released. Otherwise
    // a fast click can reach a new screen while its previous save is still busy.
    setState(next)
  }
  async function begin(again = false) {
    if (activityClock.paused || saving.current) return
    saving.current = true
    enablePreviewSpeechFromTap()
    try {
      savedRaw.current = localStorage.getItem(key)
      let next = newWarmupDesign()
      if (savedRaw.current && !again) {
        const stored = JSON.parse(savedRaw.current)
        if (stored.signature !== signature)
          throw new Error('This saved prototype uses a different sample set. It has been preserved.')
        next = reopenWarmupDesign(validateWarmupDesign(stored.state, lengths))
      }
      await store(next)
      setPad(emptyWritingPadState)
      setCompletedAudioKey('')
      setError('')
      setActive(true)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Your place could not be read or saved.')
    } finally {
      saving.current = false
    }
  }
  function exit() {
    if (activityClock.paused || saving.current) return
    audioRequest.current += 1
    stopPromptAudio(attemptRef.current)
    setActive(false)
    setCompletedAudioKey('')
    setPad(emptyWritingPadState)
  }
  async function move(action: WarmupDesignAction) {
    if (activityClock.paused || saving.current) return
    saving.current = true
    try {
      const next = advanceWarmupDesign(state, action, lengths)
      if (next === state) return
      // Reject repeated clicks from a render whose result has already committed.
      const saved = savedRaw.current && JSON.parse(savedRaw.current)
      if (!saved || saved.state.revision !== state.revision) return
      await store(next)
      if (next.phase === 'memory' || next.phase === 'trace') setPad(emptyWritingPadState)
      setError('')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Your place could not be saved. Try again.')
    } finally {
      saving.current = false
    }
  }
  const hear = useCallback(() => {
    if (!word) return
    const request = ++audioRequest.current
    const key = stageRef.current
    stopPromptAudio(attemptRef.current)
    setAudio('loading')
    setCompletedAudioKey('')
    const profile = gradeAudioProfileFor(grade)
    const attempt = playCachedWordAudio(word, true, {
      playbackRate: profile.dictationRate,
      sentenceRate: profile.dictationRate,
      pauseMs: profile.segmentGapMs,
    })
    attemptRef.current = attempt
    void promptAudioCompleted(attempt)
      .then(() => {
        if (audioRequest.current === request) {
          setAudio('ready')
          setCompletedAudioKey(key)
        }
      })
      .catch(() => {
        if (audioRequest.current === request) setAudio('error')
      })
    // The memoized sample identity prevents drawing/input rerenders from
    // restarting narration.
  }, [grade, word])
  useEffect(() => {
    if (!active || state.phase === 'complete') return
    hear()
    return () => {
      audioRequest.current += 1
      stopPromptAudio(attemptRef.current)
    }
  }, [active, state.revision, state.phase, hear])

  const tracing = state.phase === 'trace'
  const comparing = state.phase === 'compare'
  return (
    <div
      id="slay-acquisition-root"
      className="warmup-design"
      data-report-grade={grade}
      data-report-revision={revision}
      data-report-screen={active ? 'Writing Warmup design prototype' : 'Warmup prototype menu'}
      data-report-activity="Writing Warmup prototype"
      data-report-phase={active ? state.phase : 'menu'}
      data-report-target={active ? word?.id : undefined}
      data-report-position={state.index + 1}
      data-report-audio={audio}
    >
      <header className="slay-comparison-banner">
        <span>
          {grade} · Warmup prototype 1 · {revision.slice(0, 7)}
        </span>
        <div id="problem-reporter-controls" />
      </header>
      {!active ? (
        <main className="warmup-menu">
          <h1>Writing Warmup</h1>
          <p>
            Hear → write from memory → compare. If needed, trace each character once, then try the whole word again.
          </p>
          <label>
            Grade{' '}
            <select
              aria-label="Grade"
              value={grade}
              onChange={(event) => {
                const next = event.target.value as WarmupGrade
                setGrade(next)
                setError('')
                const url = new URL(location.href)
                url.searchParams.set('grade', warmupSlugs[next])
                history.replaceState(null, '', url)
              }}
            >
              {warmupGrades.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <p>Teacher-source sample words: {samples.map((s) => s.word.text).join(' · ')}</p>
          <button type="button" className="primary-button" onClick={() => begin()}>
            Start or resume Warmup
          </button>
          <p className="warmup-scope">
            Isolated design test. These samples are not the child’s scheduled Warmup. First-attempt results and your
            place save only in this browser. Writing is temporary. Regular lessons, mastery records and reading are
            unchanged.
          </p>
          <a href={`/family-beta-preview.html?grade=${warmupSlugs[grade]}`}>Back to the combined test app</a>
        </main>
      ) : (
        <LearningGameShell
          gameId={`stroke-order-slay-${teacherProfileForGrade(grade).id}`}
          title="Writing Warmup"
          eyebrow={`${grade} writing Warmup`}
          progress={`${Math.min(state.index + 1, samples.length)}/${samples.length} words`}
          onExit={exit}
        >
          {state.phase === 'complete' ? (
            <section className="lg-card warmup-complete">
              <h2>Warmup complete!</h2>
              <p data-testid="mastery-result">
                {state.firstAnswers.filter(Boolean).length} of {samples.length} words correct on the first try.
              </p>
              <p>Guided corrections were practice, not extra mastery scores.</p>
              <button type="button" className="lg-primary" onClick={exit}>
                Done
              </button>
              <button type="button" className="lg-stroke-replay" onClick={() => begin(true)}>
                Practice these samples again
              </button>
            </section>
          ) : tracing ? (
            <section
              className="lg-card lg-production-card lg-stroke-order-card warmup-trace"
              aria-label="Warmup stroke guide"
              data-character-index={state.character}
            >
              <div className="warmup-trace-heading">
                <strong>
                  Trace · character {state.character + 1} of {lengths[state.index]}
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
                  wordCharacterCount: lengths[state.index],
                  audioText: word.text,
                  strokes: samples[state.index].guides[state.character],
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
          )}
        </LearningGameShell>
      )}
      {active && state.phase !== 'complete' && audio !== 'ready' && (
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
      <ProblemReporter grade={grade} />
    </div>
  )
}

createRoot(document.getElementById('warmup-design-root')!).render(<WarmupDesign />)
