import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Clock3, Headphones, RotateCcw, Sparkles, Volume2, X } from 'lucide-react'
import {
  AUDIO_PAUSE_MS,
  activePracticeWord,
  audioPartsForWord,
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
import { browserSpeech, requireCompletedSpeech, type SpeechPlayback } from '../audio/browserSpeech.ts'

export type PracticeViewProps = {
  session: PracticeSession
  datasets: Dataset[]
  onExit: () => void
  onBeginWarmup: () => void
  onInterstitialComplete: () => void
  onDictationComplete: (method?: 'timer' | 'skip_timer') => void
  onStartReview: () => void
  onAnswer: (answer: PracticeAnswer) => void
  reviewInstruction: string
  timerSecondsOverride?: number
  warmupRequired?: boolean
  wordAudioMode?: 'dictation-sequence' | 'word-only'
  wordAudioRate?: number
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

function playWordAudio(
  word: Word,
  warmup: boolean,
  mode: 'dictation-sequence' | 'word-only',
  wordRate?: number,
  onFirstWordComplete?: () => void,
): SpeechPlayback {
  const parts = mode === 'word-only' ? [{ text: word.text, rate: wordRate ?? 0.55 }] : audioPartsForWord(word, warmup)
  return browserSpeech.play(
    parts.map((part) => ({
      text: part.text,
      language: 'zh-CN',
      rate: part.rate,
    })),
    {
      pauseMs: AUDIO_PAUSE_MS,
      onSegmentComplete: (index) => {
        if (index === 0) onFirstWordComplete?.()
      },
    },
  )
}

function playReviewInstruction(instruction: string) {
  return browserSpeech.play([{ text: instruction, language: 'en-GB', rate: 0.9 }])
}

function PromptCountdown({ durationSeconds, onComplete }: { durationSeconds: number; onComplete: () => void }) {
  const [seconds, setSeconds] = useState(durationSeconds)
  const onCompleteRef = useRef(onComplete)
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])
  useEffect(() => {
    const countdown = createPracticeCountdown(durationSeconds, setSeconds, () => onCompleteRef.current())
    return () => countdown.cancel()
  }, [durationSeconds])
  return <>00:{String(seconds).padStart(2, '0')}</>
}

function SequentialPracticeView({
  session,
  datasets,
  onExit,
  onBeginWarmup,
  onInterstitialComplete,
  onDictationComplete,
  onStartReview,
  onAnswer,
  reviewInstruction,
  timerSecondsOverride,
  warmupRequired = false,
  wordAudioMode = 'dictation-sequence',
  wordAudioRate,
}: PracticeViewProps) {
  const [writingByResponse, setWritingByResponse] = useState<Record<string, WritingPadState>>({})
  const [interstitialAudioStatus, setInterstitialAudioStatus] = useState<'idle' | 'playing' | 'error'>('idle')
  const [interstitialAudioAttempt, setInterstitialAudioAttempt] = useState(0)
  const announcedWritingResponse = useRef<string | null>(null)
  const term = activePracticeWord(session)
  const dataset = datasets.find((item) => item.id === term?.datasetId) || datasets.find((item) => item.id === session.primaryDatasetId)
  const isWarmup = session.segment === 'warmup'
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
  useEffect(() => { setWritingByResponse({}) }, [session.id])
  useEffect(() => () => browserSpeech.cancel(), [])
  useEffect(() => {
    if (session.stage === 'warmup-intro') return
    if (session.stage === 'interstitial') {
      let transition: number | undefined
      let watchdog: number | undefined
      let active = true
      let handedOff = false
      const revealWriting = () => {
        if (!active) return
        if (watchdog) window.clearTimeout(watchdog)
        transition = window.setTimeout(() => {
          handedOff = true
          onInterstitialComplete()
        }, 250)
      }
      announcedWritingResponse.current = writingResponseId
      setInterstitialAudioStatus('playing')
      const playback = term ? playWordAudio(term, isWarmup, wordAudioMode, wordAudioRate, revealWriting) : undefined
      if (!playback) setInterstitialAudioStatus('error')
      else {
        watchdog = window.setTimeout(() => {
          if (!active) return
          playback.cancel()
          setInterstitialAudioStatus('error')
        }, 8000)
        void playback.finished.then((result) => {
          if (!active || result.completedSegments > 0 || result.status === 'cancelled') return
          if (watchdog) window.clearTimeout(watchdog)
          setInterstitialAudioStatus('error')
        })
      }
      return () => {
        active = false
        if (transition) window.clearTimeout(transition)
        if (watchdog) window.clearTimeout(watchdog)
        if (!handedOff) playback?.cancel()
      }
    }
    if (session.stage === 'complete') {
      if (session.primaryPhase === 'acquisition') return
      const playback = playReviewInstruction(reviewInstruction)
      return playback.cancel
    }
    if (session.stage === 'dictation' && announcedWritingResponse.current === writingResponseId) {
      announcedWritingResponse.current = null
      return
    }
    const playback = playWordAudio(term, isWarmup, wordAudioMode, wordAudioRate)
    return playback.cancel
  }, [
    stageKey,
    session.stage,
    session.primaryPhase,
    term,
    isWarmup,
    writingResponseId,
    interstitialAudioAttempt,
    onInterstitialComplete,
    reviewInstruction,
    wordAudioMode,
    wordAudioRate,
  ])
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
    <div className="practice-progress"><span style={{ width: `${progress}%` }} /></div>
    <section className={`prompt-card ${session.stage === 'warmup-intro' || session.stage === 'interstitial' || session.stage === 'complete' ? 'interstitial-card' : ''}${showingWritingResponse ? ` tier1-writing-card is-${session.stage}` : ''}`}>
      {session.stage === 'warmup-intro' && <><div className="interstitial-mark"><Sparkles size={25} /></div><p className="eyebrow">{warmupRequired ? 'Required before this activity' : 'Optional before this activity'}</p><h1>Warm up</h1><p className="practice-helper">{warmupRequired ? 'Complete these warmup words before continuing.' : 'Warm up first, or continue directly to the activity.'}</p><button className="primary-button" onClick={() => { browserSpeech.unlock(); onBeginWarmup() }}>Begin Warmup <ArrowLeft size={17} /></button>{!warmupRequired && !session.warmupOnly && <button className="replay-button" onClick={() => { browserSpeech.unlock(); onAnswer('skip-warmup') }}>Skip Warmup</button>}</>}
      {session.stage === 'interstitial' && <><div className="interstitial-mark"><Volume2 size={25} /></div><p className="eyebrow">{isWarmup ? 'Warm up' : phaseLabel(session.primaryPhase)}</p><h1>{isWarmup ? `Warmup word ${session.index + 1}` : `Word ${session.index + 1}`}</h1><p className="practice-helper">{interstitialAudioStatus === 'playing' ? 'Listen carefully. Writing opens after you hear the word.' : 'Listen carefully, then write what you hear.'}</p>{interstitialAudioStatus === 'error' && <p className="recording-error" role="alert">The word audio did not play. Check the device volume, then try again.</p>}{term && <button className="replay-button" onClick={() => { browserSpeech.unlock(); setInterstitialAudioAttempt((attempt) => attempt + 1) }}><Volume2 size={16} /> {interstitialAudioStatus === 'error' ? 'Try word audio again' : 'Play word audio again'}</button>}</>}
      {session.stage === 'complete' && session.primaryPhase === 'acquisition' && <><div className="complete-mark"><Check size={27} /></div><p className="eyebrow">Teaching sequence complete · {dataset?.dateRange}</p><h1>All targets are now Earned DTs</h1><p className="review-instruction">Return anytime for ongoing Familiar and Earned DT practice.</p><button className="primary-button review-start-button" onClick={() => onAnswer('done')}>Done for today <ArrowLeft size={17} /></button></>}
      {session.stage === 'complete' && session.primaryPhase === 'test-review' && <><div className="complete-mark"><Check size={27} /></div><p className="eyebrow">Dictation finished · {dataset?.dateRange}</p><h1>Test complete</h1><p className="review-instruction">{reviewInstruction}</p><button className="primary-button review-start-button" onClick={() => { browserSpeech.unlock(); onStartReview() }}>Start review <ArrowLeft size={17} /></button><button className="replay-button" onClick={() => playReviewInstruction(reviewInstruction)}><RotateCcw size={16} /> Replay instructions</button></>}
      {session.stage === 'dictation' && term && writingResponseId && <>
        <div className="prompt-meta"><span className={`set-chip chip-${isWarmup ? 'warmup' : session.primaryPhase}`}>{isWarmup ? 'Warmup' : promptLabel} · {dataset?.dateRange}</span><span className="timer"><Clock3 size={15} /> <PromptCountdown key={stageKey} durationSeconds={timerSeconds} onComplete={() => onDictationComplete('timer')} /></span></div>
        <div className="tier1-writing-instructions">
          <div className="speaker-orb"><div className="orb-ring" /><Volume2 size={24} strokeWidth={1.7} /></div>
          <div><h1>{showCopy ? <>Trace the word<br /><span>as you listen.</span></> : <>Listen, then write<br /><span>what you hear.</span></>}</h1><p className="practice-helper">{showCopy ? 'Write directly over the Songti characters.' : 'Write the word on the screen before the timer ends.'}</p></div>
          <div className="tier1-writing-audio-actions"><button className="replay-button" onClick={() => playWordAudio(term, isWarmup, wordAudioMode, wordAudioRate)}><RotateCcw size={16} /> Replay sequence</button><button className="replay-button" onClick={() => onDictationComplete('skip_timer')}>Skip Timer</button></div>
        </div>
        <div className="tier1-writing-response"><SkyWritingAcquisition key={writingResponseId} word={term.text} phase="writing" traceTarget={showCopy} padState={writingPadState} onPadStateChange={updateWritingPad} /></div>
        <p className="dictation-status">Your writing stays on this device only. The comparison appears when the timer ends or is skipped.</p>
      </>}
      {session.stage === 'review' && term && writingResponseId && <>
        <div className="prompt-meta"><span className={`set-chip chip-${isWarmup ? 'warmup' : session.primaryPhase}`}>{isWarmup ? 'Warmup review' : `${promptLabel} review`} · {dataset?.dateRange}</span><span className="review-label">Compare your writing</span></div>
        <div className="tier1-writing-response"><SkyWritingAcquisition key={writingResponseId} word={term.text} phase="review" traceTarget={showCopy} padState={writingPadState} onPadStateChange={updateWritingPad} /></div>
        <div className="tier1-review-controls"><button className="replay-button" onClick={() => playWordAudio(term, isWarmup, wordAudioMode, wordAudioRate)}><RotateCcw size={16} /> Replay word sequence</button>{term.sentence.trim() ? <div className="context-box"><span>In a sentence</span><p>{term.sentence}</p></div> : <p className="context-unavailable">No approved context sentence is available for this word yet.</p>}<SelfAssessmentActions onIncorrect={() => onAnswer(false)} onCorrect={() => onAnswer(true)} /><p className="answer-note">Be honest with yourself — that’s how you grow.</p></div>
      </>}
    </section>
    <p className="practice-footnote"><Headphones size={14} /> Mandarin audio plays automatically · You can replay it anytime</p>
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
      onPlayReference={(word) =>
        requireCompletedSpeech(
          playWordAudio(word, false, props.wordAudioMode || 'dictation-sequence', props.wordAudioRate),
        )
      }
      onDiscard={() => props.onAnswer('skip-test-review')}
      onComplete={(completion) => props.onAnswer({ kind: 'deferred-writing-test-review', completion })}
    />
  }
  return <SequentialPracticeView {...props} />
}
