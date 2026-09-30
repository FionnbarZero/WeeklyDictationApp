import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Clock3, Headphones, RotateCcw, Sparkles, Volume2, X } from 'lucide-react'
import {
  activePracticeWord,
  timerSecondsFor,
  type Dataset,
  type LifecyclePhase,
  type PracticeSession,
  type Word,
} from '../domain'
import { createPracticeCountdown, practicePosition, wordIsVisibleDuringWriting } from '../practicePresentation'
import { SelfAssessmentActions } from './SelfAssessmentActions'

type StopSpeech = void | (() => void)

export type PracticeViewProps = {
  session: PracticeSession
  datasets: Dataset[]
  onExit: () => void
  onReplay: () => void
  onBeginWarmup: () => void
  onInterstitialComplete: () => void
  onDictationComplete: (method?: 'timer' | 'skip_timer') => void
  onStartReview: () => void
  onAnswer: (answer: boolean | 'skip-warmup' | 'continue-primary' | 'skip-test-review' | 'done') => void
  onSpeakWord: (word: Word, warmup: boolean) => StopSpeech
  onSpeakReviewInstruction: () => StopSpeech
  reviewInstruction: string
  timerSecondsOverride?: number
  warmupRequired?: boolean
}

function phaseLabel(phase: LifecyclePhase) {
  return phase === 'test-review' ? 'Test Review' : phase === 'warmup' ? 'Warmup' : 'Acquisition'
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

export function PracticeView({
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
  const term = activePracticeWord(session)
  const dataset = datasets.find((item) => item.id === term?.datasetId) || datasets.find((item) => item.id === session.primaryDatasetId)
  const isWarmup = session.segment === 'warmup'
  const acquisitionPrompt = session.segment === 'primary' ? session.acquisition?.prompt : undefined
  const showCopy = wordIsVisibleDuringWriting(acquisitionPrompt?.kind)
  const timerSeconds = acquisitionPrompt?.timerSeconds || timerSecondsOverride || timerSecondsFor(session.grade, session.segment, session.primaryPhase)
  const stageKey = `${session.id}:${session.segment}:${session.stage}:${session.index}:${acquisitionPrompt?.id || ''}`
  useEffect(() => {
    if (session.stage === 'warmup-intro') return
    if (session.stage === 'interstitial') {
      const transition = window.setTimeout(onInterstitialComplete, 1500)
      return () => window.clearTimeout(transition)
    }
    if (session.stage === 'complete') {
      if (session.primaryPhase === 'acquisition') return
      const stop = onSpeakReviewInstruction()
      return () => stop?.()
    }
    const stop = onSpeakWord(term, isWarmup)
    return () => stop?.()
  }, [stageKey, session.stage, session.primaryPhase, term, isWarmup, onInterstitialComplete, onSpeakReviewInstruction, onSpeakWord])
  const position = practicePosition(session)
  const progress = session.segment === 'warmup'
    ? Math.round((session.index / Math.max(session.queue.length, 1)) * 25)
    : session.stage === 'complete' ? 100
      : session.acquisition ? 50 + Math.round((session.acquisition.targetIndex / Math.max(session.primaryQueue.length, 1)) * 50)
        : 50 + Math.round((session.index / Math.max(session.queue.length, 1)) * 50)
  const promptLabel = acquisitionPrompt?.kind === 'familiar-dt' ? 'Familiar DT' : acquisitionPrompt?.kind === 'earned-dt' || acquisitionPrompt?.dtPoolType === 'earned' ? 'Earned DT' : phaseLabel(session.primaryPhase)
  return <div className="practice-page">
    <div className="practice-top">
      <button className="back-button" onClick={onExit}><X size={18} /> Exit practice</button>
      <span className="practice-count">{position.label}<span>{(session.stage === 'dictation' || session.stage === 'review') && position.total !== null ? ` of ${position.total}` : ''}</span></span>
      {session.segment === 'warmup' && !session.warmupOnly && session.warmupAnswers.length > 0 && <button className="replay-button" onClick={() => onAnswer('continue-primary')}>Continue to activity</button>}
      {session.primaryPhase === 'acquisition' && session.segment === 'primary' && <button className="replay-button" onClick={() => onAnswer('done')}>Done for today</button>}
      {session.primaryPhase === 'test-review' && <button className="replay-button" onClick={() => onAnswer('skip-test-review')}>Skip Test Review</button>}
    </div>
    <div className="practice-progress"><span style={{ width: `${progress}%` }} /></div>
    <section className={`prompt-card ${session.stage === 'warmup-intro' || session.stage === 'interstitial' || session.stage === 'complete' ? 'interstitial-card' : ''}`}>
      {session.stage === 'warmup-intro' && <><div className="interstitial-mark"><Sparkles size={25} /></div><p className="eyebrow">{warmupRequired ? 'Required before this activity' : 'Optional before this activity'}</p><h1>Warm up</h1><p className="practice-helper">{warmupRequired ? 'Complete these warmup words before continuing.' : 'Warm up first, or continue directly to the activity.'}</p><button className="primary-button" onClick={onBeginWarmup}>Begin Warmup <ArrowLeft size={17} /></button>{!warmupRequired && !session.warmupOnly && <button className="replay-button" onClick={() => onAnswer('skip-warmup')}>Skip Warmup</button>}</>}
      {session.stage === 'interstitial' && <><div className="interstitial-mark"><Volume2 size={25} /></div><p className="eyebrow">{isWarmup ? 'Warm up' : phaseLabel(session.primaryPhase)}</p><h1>{isWarmup ? `Warmup word ${session.index + 1}` : `Word ${session.index + 1}`}</h1><p className="practice-helper">Listen carefully, then write what you hear.</p>{term && <button className="replay-button" onClick={onReplay}><Volume2 size={16} /> Play word audio</button>}</>}
      {session.stage === 'complete' && session.primaryPhase === 'acquisition' && <><div className="complete-mark"><Check size={27} /></div><p className="eyebrow">Teaching sequence complete · {dataset?.dateRange}</p><h1>All targets are now Earned DTs</h1><p className="review-instruction">Return anytime for ongoing Familiar and Earned DT practice.</p><button className="primary-button review-start-button" onClick={() => onAnswer('done')}>Done for today <ArrowLeft size={17} /></button></>}
      {session.stage === 'complete' && session.primaryPhase === 'test-review' && <><div className="complete-mark"><Check size={27} /></div><p className="eyebrow">Dictation finished · {dataset?.dateRange}</p><h1>Test complete</h1><p className="review-instruction">{reviewInstruction}</p><button className="primary-button review-start-button" onClick={onStartReview}>Start review <ArrowLeft size={17} /></button><button className="replay-button" onClick={onReplay}><RotateCcw size={16} /> Replay instructions</button></>}
      {session.stage === 'dictation' && term && <><div className="prompt-meta"><span className={`set-chip chip-${isWarmup ? 'warmup' : session.primaryPhase}`}>{isWarmup ? 'Warmup' : promptLabel} · {dataset?.dateRange}</span><span className="timer"><Clock3 size={15} /> <PromptCountdown key={stageKey} durationSeconds={timerSeconds} onComplete={() => onDictationComplete('timer')} /></span></div><div className="speaker-orb"><div className="orb-ring" /><Volume2 size={32} strokeWidth={1.7} /></div>{showCopy ? <><h1>Look, listen, and<br /><span>copy this word.</span></h1><div className="copy-target">{term.text}</div><p className="practice-helper">Copy the word onto your paper before the timer ends.</p></> : <><h1>Listen, then write<br /><span>what you hear.</span></h1><p className="practice-helper">Write the word on paper. Review your answer when the timer ends.</p></>}<button className="replay-button" onClick={onReplay}><RotateCcw size={16} /> Replay sequence</button><button className="replay-button" onClick={() => onDictationComplete('skip_timer')}>Skip Timer</button><p className="dictation-status">The review frame appears when the timer ends or is skipped.</p></>}
      {session.stage === 'review' && term && <><div className="prompt-meta"><span className={`set-chip chip-${isWarmup ? 'warmup' : session.primaryPhase}`}>{isWarmup ? 'Warmup review' : `${promptLabel} review`} · {dataset?.dateRange}</span><span className="review-label">Check your paper</span></div><div className="review-heading"><p className="answer-label">The word was</p><div className="answer-word">{term.text}</div></div><button className="replay-button" onClick={onReplay}><RotateCcw size={16} /> Replay word sequence</button>{term.sentence.trim() ? <div className="context-box"><span>In a sentence</span><p>{term.sentence}</p></div> : <p className="context-unavailable">No approved context sentence is available for this word yet.</p>}<SelfAssessmentActions onIncorrect={() => onAnswer(false)} onCorrect={() => onAnswer(true)} /><p className="answer-note">Be honest with yourself — that’s how you grow.</p></>}
    </section>
    <p className="practice-footnote"><Headphones size={14} /> Mandarin audio plays automatically · You can replay it anytime</p>
  </div>
}
