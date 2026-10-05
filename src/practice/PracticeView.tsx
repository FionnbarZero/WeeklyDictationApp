import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Clock3, Headphones, RotateCcw, Sparkles, Volume2, X } from 'lucide-react'
import {
  activePracticeWord,
  timerSecondsFor,
  type Dataset,
  type LifecyclePhase,
  type PracticeSession,
  type Word,
} from '../domain'
import { createPracticeCountdown } from './countdown.ts'
import { practicePosition, wordIsVisibleDuringWriting } from '../practicePresentation'
import { SkyWritingAcquisition, emptyWritingPadState, type WritingPadState, type WritingPadStateUpdater } from '../skywriting/index.ts'
import { SelfAssessmentActions } from './SelfAssessmentActions'
import { DeferredTestReview } from '../testReview/DeferredTestReview.tsx'
import type { TestReviewCompletion } from '../testReview/contracts.ts'
import {
  promptAudioStarted,
  stopPromptAudio,
  type PromptAudioAttempt,
} from '../audio/promptAudio.ts'

export type PracticeViewProps = {
  session: PracticeSession
  datasets: Dataset[]
  onExit: () => void
  onReplay: () => PromptAudioAttempt
  onBeginWarmup: () => void
  onInterstitialComplete: () => void
  onDictationComplete: (method?: 'timer' | 'skip_timer') => void
  onStartReview: () => void
  onAnswer: (answer: PracticeAnswer) => void
  onSpeakWord: (word: Word, warmup: boolean) => PromptAudioAttempt
  onSpeakReviewInstruction: () => PromptAudioAttempt
  reviewInstruction: string
  timerSecondsOverride?: number
  warmupRequired?: boolean
}

export type PracticeAnswer =
  | boolean
  | 'skip-warmup'
  | 'continue-primary'
  | 'skip-test-review'
  | 'done'
  | { readonly kind: 'deferred-writing-test-review'; readonly completion: TestReviewCompletion<Word> }

function phaseLabel(phase: LifecyclePhase) {
  return phase === 'test-review' ? 'Test Review' : phase === 'warmup' ? 'Warmup' : 'Acquisition'
}

function skyWritingResponseId(session: PracticeSession, word: Word, promptId?: string) {
  const position = promptId || `${session.index}:${word.id}`
  return `${session.id}:${session.segment}:${session.primaryPhase}:${position}`
}

function PromptCountdown({ durationSeconds, active, onComplete }: { durationSeconds: number; active: boolean; onComplete: () => void }) {
  const [seconds, setSeconds] = useState(durationSeconds)
  const [paused, setPaused] = useState(false)
  const countdownRef = useRef<ReturnType<typeof createPracticeCountdown> | null>(null)
  const onCompleteRef = useRef(onComplete)
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])
  useEffect(() => {
    setPaused(false)
    if (!active) {
      setSeconds(durationSeconds)
      countdownRef.current = null
      return
    }
    const countdown = createPracticeCountdown(durationSeconds, setSeconds, () => onCompleteRef.current())
    countdownRef.current = countdown
    return () => {
      countdown.cancel()
      countdownRef.current = null
    }
  }, [durationSeconds, active])
  return <span className="countdown-controls">
    <span role="timer" aria-label={`${seconds} seconds remaining`}>00:{String(seconds).padStart(2, '0')}</span>
    {active && seconds > 0 && <>
      <button type="button" className="timer-control" onClick={() => {
        if (paused) countdownRef.current?.resume()
        else countdownRef.current?.pause()
        setPaused(!paused)
      }}>{paused ? 'Resume' : 'Pause'}</button>
      <button type="button" className="timer-control" onClick={() => countdownRef.current?.addSeconds(10)}>+10s</button>
    </>}
  </span>
}

function SequentialPracticeView({
  session,
  datasets,
  onExit,
  onReplay,
  onBeginWarmup,
  onInterstitialComplete,
  onDictationComplete,
  onStartReview,
  onAnswer,
  onSpeakWord,
  onSpeakReviewInstruction,
  reviewInstruction,
  timerSecondsOverride,
  warmupRequired = false,
}: PracticeViewProps) {
  const [writingByResponse, setWritingByResponse] = useState<Record<string, WritingPadState>>({})
  const [audioStatus, setAudioStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [audioMessage, setAudioMessage] = useState('')
  const [audibleStageKey, setAudibleStageKey] = useState('')
  const activeAudioRef = useRef<PromptAudioAttempt>(undefined)
  const term = activePracticeWord(session)
  const dataset = datasets.find((item) => item.id === term?.datasetId) || datasets.find((item) => item.id === session.primaryDatasetId)
  const isWarmup = session.segment === 'warmup'
  const allowOptionalReplay = isWarmup
  const acquisitionPrompt = session.segment === 'primary' ? session.acquisition?.prompt : undefined
  const showCopy = wordIsVisibleDuringWriting(acquisitionPrompt?.kind)
  const timerSeconds = acquisitionPrompt?.timerSeconds || timerSecondsOverride || timerSecondsFor(session.grade, session.segment, session.primaryPhase)
  const stageKey = `${session.id}:${session.segment}:${session.stage}:${session.index}:${acquisitionPrompt?.id || ''}`
  const writingResponseId = term ? skyWritingResponseId(session, term, acquisitionPrompt?.id) : null
  const writingPadState = writingResponseId ? writingByResponse[writingResponseId] || emptyWritingPadState : emptyWritingPadState
  const showingWritingResponse = Boolean(term && writingResponseId && (session.stage === 'dictation' || session.stage === 'review'))
  function updateWritingPad(update: WritingPadStateUpdater) {
    if (!writingResponseId) return
    setWritingByResponse((current) => {
      const existing = current[writingResponseId] || emptyWritingPadState
      const next = update(existing)
      return next === existing ? current : { ...current, [writingResponseId]: next }
    })
  }
  const observeAudio = useCallback((attempt: PromptAudioAttempt) => {
    stopPromptAudio(activeAudioRef.current)
    activeAudioRef.current = attempt
    setAudioStatus('loading')
    setAudioMessage('')
    void promptAudioStarted(attempt).then(() => {
      if (activeAudioRef.current === attempt) {
        setAudioStatus('ready')
        setAudibleStageKey(stageKey)
      }
    }).catch((audioError) => {
      if (activeAudioRef.current !== attempt) return
      setAudioStatus('error')
      setAudioMessage(audioError instanceof Error ? audioError.message : 'The prompt audio could not play.')
    })
  }, [stageKey])
  const replayAudio = useCallback(() => observeAudio(onReplay()), [observeAudio, onReplay])
  useEffect(() => { setWritingByResponse({}) }, [session.id])
  useEffect(() => () => stopPromptAudio(activeAudioRef.current), [])
  useEffect(() => {
    if (session.stage === 'warmup-intro') return
    if (session.stage === 'interstitial') {
      const transition = window.setTimeout(onInterstitialComplete, 1500)
      return () => window.clearTimeout(transition)
    }
    if (session.stage === 'complete') {
      if (session.primaryPhase === 'acquisition') return
      const attempt = onSpeakReviewInstruction()
      observeAudio(attempt)
      return () => stopPromptAudio(attempt)
    }
    const attempt = onSpeakWord(term, isWarmup)
    observeAudio(attempt)
    return () => stopPromptAudio(attempt)
  }, [stageKey, session.stage, session.primaryPhase, term, isWarmup, onInterstitialComplete, onSpeakReviewInstruction, onSpeakWord, observeAudio])
  const position = practicePosition(session)
  const progress = session.segment === 'warmup'
    ? Math.round((session.index / Math.max(session.queue.length, 1)) * 25)
    : session.stage === 'complete' ? 100
      : session.acquisition ? 50 + Math.round((session.acquisition.targetIndex / Math.max(session.primaryQueue.length, 1)) * 50)
        : 50 + Math.round((session.index / Math.max(session.queue.length, 1)) * 50)
  const promptLabel = acquisitionPrompt?.kind === 'familiar-dt' ? 'Familiar DT' : acquisitionPrompt?.kind === 'earned-dt' || acquisitionPrompt?.dtPoolType === 'earned' ? 'Earned DT' : phaseLabel(session.primaryPhase)
  return <div className={`practice-page${showingWritingResponse ? ' has-skywriting-response' : ''}`}>
    <div className="practice-top">
      <button className="back-button" onClick={onExit}><X size={18} /> Exit practice</button>
      <span className="practice-count">{position.label}<span>{(session.stage === 'dictation' || session.stage === 'review') && position.total !== null ? ` of ${position.total}` : ''}</span></span>
      {session.segment === 'warmup' && !session.warmupOnly && session.warmupAnswers.length > 0 && <button className="replay-button" onClick={() => onAnswer('continue-primary')}>Continue to activity</button>}
      {session.primaryPhase === 'acquisition' && session.segment === 'primary' && <button className="replay-button" onClick={() => onAnswer('done')}>Done for today</button>}
      {session.primaryPhase === 'test-review' && <button className="replay-button" onClick={() => onAnswer('skip-test-review')}>Exit without saving</button>}
    </div>
    <div className="practice-progress" role="progressbar" aria-label="Practice progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
    <section className={`prompt-card ${session.stage === 'warmup-intro' || session.stage === 'interstitial' || session.stage === 'complete' ? 'interstitial-card' : ''}${showingWritingResponse ? ` tier1-writing-card is-${session.stage}` : ''}`}>
      {session.stage === 'warmup-intro' && <><div className="interstitial-mark"><Sparkles size={25} /></div><p className="eyebrow">{warmupRequired ? 'Required before this activity' : 'Optional before this activity'}</p><h1>Warm up</h1><p className="practice-helper">{warmupRequired ? 'Complete these warmup words before continuing.' : 'Warm up first, or continue directly to the activity.'}</p><button className="primary-button" onClick={onBeginWarmup}>Begin Warmup <ArrowLeft size={17} /></button>{!warmupRequired && !session.warmupOnly && <button className="replay-button" onClick={() => onAnswer('skip-warmup')}>Skip Warmup</button>}</>}
      {session.stage === 'interstitial' && <><div className="interstitial-mark"><Volume2 size={25} /></div><p className="eyebrow">{isWarmup ? 'Warm up' : phaseLabel(session.primaryPhase)}</p><h1>{isWarmup ? `Warmup word ${session.index + 1}` : `Word ${session.index + 1}`}</h1><p className="practice-helper">Listen carefully, then write what you hear.</p>{term && allowOptionalReplay && <button className="replay-button" onClick={replayAudio}><Volume2 size={16} /> Play word audio</button>}</>}
      {session.stage === 'complete' && session.primaryPhase === 'acquisition' && <><div className="complete-mark"><Check size={27} /></div><p className="eyebrow">Teaching sequence complete · {dataset?.dateRange}</p><h1>All targets are now Earned DTs</h1><p className="review-instruction">Return anytime for ongoing Familiar and Earned DT practice.</p><button className="primary-button review-start-button" onClick={() => onAnswer('done')}>Done for today <ArrowLeft size={17} /></button></>}
      {session.stage === 'complete' && session.primaryPhase === 'test-review' && <><div className="complete-mark"><Check size={27} /></div><p className="eyebrow">Dictation finished · {dataset?.dateRange}</p><h1>Test complete</h1><p className="review-instruction">{reviewInstruction}</p><button className="primary-button review-start-button" onClick={onStartReview}>Start review <ArrowLeft size={17} /></button><button className="replay-button" onClick={replayAudio}><RotateCcw size={16} /> Replay instructions</button></>}
      {session.stage === 'dictation' && term && writingResponseId && <>
        <div className="prompt-meta"><span className={`set-chip chip-${isWarmup ? 'warmup' : session.primaryPhase}`}>{isWarmup ? 'Warmup' : promptLabel} · {dataset?.dateRange}</span><span className="timer"><Clock3 size={15} /> <PromptCountdown key={stageKey} durationSeconds={timerSeconds} active={audibleStageKey === stageKey} onComplete={() => onDictationComplete('timer')} /></span></div>
        <div className="tier1-writing-instructions">
          <div className="speaker-orb"><div className="orb-ring" /><Volume2 size={24} strokeWidth={1.7} /></div>
          <div><h1>{showCopy ? <>Trace the word<br /><span>as you listen.</span></> : <>Listen, then write<br /><span>what you hear.</span></>}</h1><p className="practice-helper">{showCopy ? 'Write directly over the Songti characters.' : 'Write the word on the screen before the timer ends.'}</p></div>
          <div className="tier1-writing-audio-actions">{allowOptionalReplay && <button className="replay-button" onClick={replayAudio}><RotateCcw size={16} /> Replay sequence</button>}<button className="replay-button" onClick={() => onDictationComplete('skip_timer')}>Skip Timer</button></div>
        </div>
        <div className="tier1-writing-response"><SkyWritingAcquisition key={writingResponseId} word={term.text} phase="writing" traceTarget={showCopy} padState={writingPadState} onPadStateChange={updateWritingPad} /></div>
        <p className="dictation-status">Your writing stays on this device only. The comparison appears when the timer ends or is skipped.</p>
      </>}
      {session.stage === 'review' && term && writingResponseId && <>
        <div className="prompt-meta"><span className={`set-chip chip-${isWarmup ? 'warmup' : session.primaryPhase}`}>{isWarmup ? 'Warmup review' : `${promptLabel} review`} · {dataset?.dateRange}</span><span className="review-label">Compare your writing</span></div>
        <div className="tier1-writing-response"><SkyWritingAcquisition key={writingResponseId} word={term.text} phase="review" traceTarget={showCopy} padState={writingPadState} onPadStateChange={updateWritingPad} /></div>
        <div className="tier1-review-controls">{allowOptionalReplay && <button className="replay-button" onClick={replayAudio}><RotateCcw size={16} /> Replay word sequence</button>}{term.sentence.trim() ? <div className="context-box"><span>In a sentence</span><p>{term.sentence}</p></div> : <p className="context-unavailable">No approved context sentence is available for this word yet.</p>}<SelfAssessmentActions onIncorrect={() => onAnswer(false)} onCorrect={() => onAnswer(true)} /><p className="answer-note">Be honest with yourself — that’s how you grow.</p></div>
      </>}
    </section>
    {audioStatus === 'error'
      ? <p className="practice-footnote audio-playback-error" role="alert"><Headphones size={14} /> <span>{audioMessage}</span> <button type="button" onClick={replayAudio}>Try audio again</button></p>
      : <p className="practice-footnote" aria-live="polite"><Headphones size={14} /> {audioStatus === 'loading' ? 'Loading prompt audio…' : allowOptionalReplay ? 'Prompt audio plays automatically · Replay is available in Warmup' : 'Prompt audio plays automatically'}</p>}
  </div>
}

export function PracticeView(props: PracticeViewProps) {
  const { session } = props
  if (session.segment === 'primary' && session.primaryPhase === 'test-review') {
    const timerSeconds = props.timerSecondsOverride || timerSecondsFor(session.grade, session.segment, session.primaryPhase)
    return <DeferredTestReview
      key={session.id}
      mode="writing"
      targets={session.primaryQueue}
      activityLabel="Writing Test Review"
      writingTimerSeconds={timerSeconds}
      onPlayReference={async (word) => { await promptAudioStarted(props.onSpeakWord(word, false)) }}
      onPlayWritingPrompt={(word) => props.onSpeakWord(word, false)}
      onDiscard={() => props.onAnswer('skip-test-review')}
      onComplete={(completion) => props.onAnswer({ kind: 'deferred-writing-test-review', completion })}
    />
  }
  return <SequentialPracticeView {...props} />
}
