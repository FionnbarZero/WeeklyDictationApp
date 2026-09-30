import { useRef } from 'react'
import { ArrowLeft, RotateCcw, Volume2 } from 'lucide-react'

export type WritingResponseCollectorProps = {
  readonly position: number
  readonly onReplay: () => void
  readonly onCollected: () => void
}

export function WritingResponseCollector({
  position,
  onReplay,
  onCollected,
}: WritingResponseCollectorProps) {
  const collectedRef = useRef(false)

  function collectOnce() {
    if (collectedRef.current) return
    collectedRef.current = true
    onCollected()
  }

  return <div className="deferred-writing-collector">
    <span className="speaker-orb"><span className="orb-ring" /><Volume2 size={32} strokeWidth={1.7} /></span>
    <h1>Listen, then write<br /><span>word {position}.</span></h1>
    <p className="practice-helper">Write the response on paper. The correct word will stay hidden until the final review page.</p>
    <button className="replay-button" type="button" onClick={onReplay}><RotateCcw size={16} /> Replay word</button>
    <button className="primary-button deferred-next-button" type="button" onClick={collectOnce}>Response written <ArrowLeft size={17} /></button>
  </div>
}
