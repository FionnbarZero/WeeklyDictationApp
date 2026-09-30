import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Headphones, Mic, RotateCcw, Square } from 'lucide-react'
import {
  browserSupportsAudioRecording,
  startEphemeralAudioRecording,
  type ActiveAudioRecording,
} from '../readingPractice/audioRecorder.ts'
import { ReadingRecorderError, type EphemeralAudioClip } from '../readingPractice/contracts.ts'
import type { TestReviewTarget } from './contracts.ts'
import { playRetainedReadingClip, type RetainedReadingCapture } from './retainedReadingClips.ts'

type RecordingStatus = 'idle' | 'requesting' | 'recording' | 'recorded' | 'error'

export type ReadingResponseCollectorProps = {
  readonly target: TestReviewTarget
  readonly onCollected: (capture: RetainedReadingCapture) => void
}

export function ReadingResponseCollector({ target, onCollected }: ReadingResponseCollectorProps) {
  const [status, setStatus] = useState<RecordingStatus>('idle')
  const [clip, setClip] = useState<EphemeralAudioClip | null>(null)
  const [error, setError] = useState<string | null>(null)
  const activeRef = useRef<ActiveAudioRecording | null>(null)
  const clipRef = useRef<EphemeralAudioClip | null>(null)
  const transferredRef = useRef(false)
  const collectedRef = useRef(false)
  const generationRef = useRef(0)
  const supported = browserSupportsAudioRecording()

  function releaseLocalClip() {
    if (clipRef.current && !transferredRef.current) clipRef.current.dispose()
    clipRef.current = null
    setClip(null)
  }

  async function startRecording() {
    generationRef.current += 1
    const generation = generationRef.current
    activeRef.current?.cancel()
    activeRef.current = null
    releaseLocalClip()
    transferredRef.current = false
    setError(null)
    setStatus('requesting')
    try {
      const active = await startEphemeralAudioRecording()
      if (generation !== generationRef.current) {
        active.cancel()
        return
      }
      activeRef.current = active
      setStatus('recording')
      void active.finished.then((nextClip) => {
        if (generation !== generationRef.current) {
          nextClip.dispose()
          return
        }
        activeRef.current = null
        clipRef.current = nextClip
        setClip(nextClip)
        setStatus('recorded')
      }).catch((nextError: unknown) => {
        if (generation !== generationRef.current) return
        activeRef.current = null
        setStatus('error')
        setError(nextError instanceof ReadingRecorderError
          ? nextError.message
          : 'The recording could not be completed.')
      })
    } catch (nextError) {
      if (generation !== generationRef.current) return
      setStatus('error')
      setError(nextError instanceof ReadingRecorderError
        ? nextError.message
        : 'The recording could not be started.')
    }
  }

  function keepAndContinue() {
    if (!clip || collectedRef.current) return
    collectedRef.current = true
    transferredRef.current = true
    onCollected({ targetId: target.id, clip })
  }

  function continueWithoutRecording() {
    if (collectedRef.current) return
    collectedRef.current = true
    onCollected({ targetId: target.id, clip: null })
  }

  useEffect(() => () => {
    generationRef.current += 1
    activeRef.current?.cancel()
    if (clipRef.current && !transferredRef.current) clipRef.current.dispose()
  }, [])

  return <div className="deferred-reading-collector">
    <p className="answer-label">Read this word aloud</p>
    <div className="deferred-reading-word" lang="zh-Hans">{target.text}</div>
    {status === 'idle' && supported && <button className="record-reading-button" type="button" onClick={() => void startRecording()}>
      <Mic size={18} /> Record my reading
    </button>}
    {status === 'requesting' && <p className="recording-status"><Mic size={18} /> Waiting for microphone permission…</p>}
    {status === 'recording' && <>
      <p className="recording-status recording-live"><span className="recording-dot" /> Say the word, then tap Stop.</p>
      <button className="stop-recording-button" type="button" onClick={() => activeRef.current?.stop()}><Square size={16} /> Stop recording</button>
    </>}
    {status === 'recorded' && clip && <>
      <p className="deferred-captured"><Check size={17} /> Recording captured. It will be compared on the final page.</p>
      <div className="deferred-inline-actions">
        <button className="replay-button" type="button" onClick={() => void playRetainedReadingClip(clip)}><Headphones size={16} /> Check recording</button>
        <button className="replay-button" type="button" onClick={() => void startRecording()}><RotateCcw size={16} /> Record again</button>
      </div>
      <button className="primary-button deferred-next-button" type="button" onClick={keepAndContinue}>Save response and continue <ArrowLeft size={17} /></button>
    </>}
    {(!supported || status === 'error') && <div className="recording-fallback" role="alert">
      <strong>Microphone recording is unavailable.</strong>
      <p>{error || 'This browser cannot record microphone audio.'}</p>
      <button className="replay-button" type="button" onClick={continueWithoutRecording}>Continue without a recording</button>
    </div>}
    <p className="deferred-collection-rule">The model pronunciation and correctness buttons stay hidden until every response is collected.</p>
  </div>
}
