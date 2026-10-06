import { useEffect, useRef, useState } from 'react'
import { Clock3, Volume2 } from 'lucide-react'
import { createPracticeCountdown } from '../practice/countdown.ts'
import { SkyWritingAcquisition } from '../skywriting/skywritingacquisition.tsx'
import type { WritingPadState } from '../skywriting/model.ts'
import type { WritingPadStateUpdater } from '../skywriting/WritingPad.tsx'
import type { TestReviewTarget } from './contracts.ts'

export type WritingResponseCollectorProps = {
  readonly target: TestReviewTarget
  readonly position: number
  readonly timerSeconds: number
  readonly audioStatus: 'loading' | 'ready' | 'error'
  readonly audioError: string | null
  readonly padState: WritingPadState
  readonly onPadStateChange: (update: WritingPadStateUpdater) => void
  readonly onRetryAudio: () => void
  readonly onCollected: (method: 'timer' | 'skip_timer') => void
}

export function WritingResponseCollector({
  target,
  position,
  timerSeconds,
  audioStatus,
  audioError,
  padState,
  onPadStateChange,
  onRetryAudio,
  onCollected,
}: WritingResponseCollectorProps) {
  const [seconds, setSeconds] = useState(timerSeconds)
  const [paused, setPaused] = useState(false)
  const countdownRef = useRef<ReturnType<typeof createPracticeCountdown> | null>(null)
  const collectedRef = useRef(false)
  const onCollectedRef = useRef(onCollected)
  useEffect(() => { onCollectedRef.current = onCollected }, [onCollected])

  function collectOnce(method: 'timer' | 'skip_timer') {
    if (collectedRef.current) return
    collectedRef.current = true
    onCollectedRef.current(method)
  }

  useEffect(() => {
    setPaused(false)
    if (audioStatus !== 'ready') {
      setSeconds(timerSeconds)
      countdownRef.current = null
      return
    }
    const countdown = createPracticeCountdown(timerSeconds, setSeconds, () => collectOnce('timer'))
    countdownRef.current = countdown
    return () => {
      countdown.cancel()
      countdownRef.current = null
    }
  }, [timerSeconds, audioStatus])

  return <div className="deferred-writing-collector">
    <div className="deferred-writing-timer"><Clock3 size={15} /> <span role="timer" aria-label={`${seconds} seconds remaining`}>00:{String(seconds).padStart(2, '0')}</span>{audioStatus === 'ready' && seconds > 0 && <><button type="button" className="timer-control" onClick={() => {
      if (paused) countdownRef.current?.resume()
      else countdownRef.current?.pause()
      setPaused(!paused)
    }}>{paused ? 'Resume' : 'Pause'}</button><button type="button" className="timer-control" onClick={() => countdownRef.current?.addSeconds(10)}>+10s</button></>}</div>
    <span className="speaker-orb"><span className="orb-ring" /><Volume2 size={32} strokeWidth={1.7} /></span>
    <h1>Listen, then write<br /><span>word {position}.</span></h1>
    <p className="practice-helper">Write on the screen. The correct word will stay hidden until the final review page.</p>
    {audioStatus === 'loading' && <p className="practice-helper" role="status">Loading the spoken prompt…</p>}
    {audioStatus === 'error' && <div className="recording-fallback" role="alert">
      <strong>The spoken prompt did not play.</strong>
      <p>{audioError || 'Try the audio again.'} Ask a teacher for help if it still does not play.</p>
      <button className="replay-button" type="button" onClick={onRetryAudio}><Volume2 size={16} /> Try audio again</button>
    </div>}
    <div className="deferred-writing-pad">
      <SkyWritingAcquisition
        word={target.text}
        phase="writing"
        traceTarget={false}
        padState={padState}
        onPadStateChange={onPadStateChange}
      />
    </div>
    <button className="primary-button deferred-next-button" type="button" disabled={audioStatus !== 'ready'} onClick={() => collectOnce('skip_timer')}>Skip Timer</button>
  </div>
}
