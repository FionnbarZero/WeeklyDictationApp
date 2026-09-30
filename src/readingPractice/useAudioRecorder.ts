import { useCallback, useEffect, useRef, useState } from 'react'
import {
  browserSupportsAudioRecording,
  startEphemeralAudioRecording,
  type ActiveAudioRecording,
  type AudioRecorderDependencies,
} from './audioRecorder.ts'
import { ReadingRecorderError, type EphemeralAudioClip, type ReadingRecordingStatus } from './contracts.ts'

export type AudioRecorderState = {
  readonly status: ReadingRecordingStatus
  readonly clip: EphemeralAudioClip | null
  readonly error: ReadingRecorderError | null
  readonly supported: boolean
  start: () => Promise<void>
  stop: () => void
  reset: () => void
}

export function useAudioRecorder(promptId: string, dependencies?: AudioRecorderDependencies): AudioRecorderState {
  const [status, setStatus] = useState<ReadingRecordingStatus>('idle')
  const [clip, setClip] = useState<EphemeralAudioClip | null>(null)
  const [error, setError] = useState<ReadingRecorderError | null>(null)
  const activeRef = useRef<ActiveAudioRecording | null>(null)
  const clipRef = useRef<EphemeralAudioClip | null>(null)
  const generationRef = useRef(0)
  const supported = dependencies !== undefined || browserSupportsAudioRecording()

  const releaseCurrent = useCallback(() => {
    generationRef.current += 1
    activeRef.current?.cancel()
    activeRef.current = null
    clipRef.current?.dispose()
    clipRef.current = null
  }, [])

  const reset = useCallback(() => {
    releaseCurrent()
    setClip(null)
    setError(null)
    setStatus('idle')
  }, [releaseCurrent])

  useEffect(() => {
    reset()
    return releaseCurrent
  }, [promptId, reset, releaseCurrent])

  const start = useCallback(async () => {
    releaseCurrent()
    setClip(null)
    setError(null)
    setStatus('requesting')
    const generation = generationRef.current

    try {
      const active = await startEphemeralAudioRecording(dependencies)
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
        const normalized = nextError instanceof ReadingRecorderError
          ? nextError
          : new ReadingRecorderError('recording-failed', 'The recording could not be completed.')
        setError(normalized)
        setStatus('error')
      })
    } catch (nextError) {
      if (generation !== generationRef.current) return
      const normalized = nextError instanceof ReadingRecorderError
        ? nextError
        : new ReadingRecorderError('recording-failed', 'The recording could not be started.')
      setError(normalized)
      setStatus('error')
    }
  }, [dependencies, releaseCurrent])

  const stop = useCallback(() => activeRef.current?.stop(), [])

  return { status, clip, error, supported, start, stop, reset }
}
