import { useEffect, useRef, useState } from 'react'
import { Clock3, RotateCcw, Volume2 } from 'lucide-react'
import { createPracticeCountdown } from '../practice/countdown.ts'

export type WritingResponseCollectorProps = {
  readonly position: number
  readonly timerSeconds: number
  readonly onReplay: () => void
  readonly onCollected: (method: 'timer' | 'skip_timer') => void
}

export function WritingResponseCollector({
  position,
  timerSeconds,
  onReplay,
  onCollected,
}: WritingResponseCollectorProps) {
  const [seconds, setSeconds] = useState(timerSeconds)
  const collectedRef = useRef(false)
  const onCollectedRef = useRef(onCollected)
  useEffect(() => { onCollectedRef.current = onCollected }, [onCollected])

  function collectOnce(method: 'timer' | 'skip_timer') {
    if (collectedRef.current) return
    collectedRef.current = true
    onCollectedRef.current(method)
  }

  useEffect(() => {
    const countdown = createPracticeCountdown(timerSeconds, setSeconds, () => collectOnce('timer'))
    return () => countdown.cancel()
  }, [timerSeconds])

  return <div className="deferred-writing-collector">
    <div className="deferred-writing-timer"><Clock3 size={15} /> 00:{String(seconds).padStart(2, '0')}</div>
    <span className="speaker-orb"><span className="orb-ring" /><Volume2 size={32} strokeWidth={1.7} /></span>
    <h1>Listen, then write<br /><span>word {position}.</span></h1>
    <p className="practice-helper">Write the response on paper. The correct word will stay hidden until the final review page.</p>
    <button className="replay-button" type="button" onClick={onReplay}><RotateCcw size={16} /> Replay word</button>
    <button className="primary-button deferred-next-button" type="button" onClick={() => collectOnce('skip_timer')}>Skip Timer</button>
  </div>
}
