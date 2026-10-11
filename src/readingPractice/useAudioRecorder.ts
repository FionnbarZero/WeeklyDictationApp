import { useCallback, useEffect, useRef, useState } from 'react'
import {
  browserSupportsAudioRecording,
  startEphemeralAudioRecording,
  type ActiveAudioRecording,
  type AudioRecorderDependencies,
} from './audioRecorder.ts'
import { ReadingRecorderError, type EphemeralAudioClip, type ReadingRecordingStatus } from './contracts.ts'
import { activityClock } from '../activity/activityLifecycle.ts'

export type AudioRecorderState = {
  readonly status: ReadingRecordingStatus
  readonly clip: EphemeralAudioClip | null
  readonly error: ReadingRecorderError | null
  readonly supported: boolean
  readonly pauseNotice: string | null
  start: () => Promise<void>
  stop: () => void
  reset: () => void
}

export function useAudioRecorder(promptId: string, dependencies?: AudioRecorderDependencies,
  options?: { maximumDurationMs: number; preserveOnPause: boolean }): AudioRecorderState {
  const [status, setStatus] = useState<ReadingRecordingStatus>('idle')
  const [clip, setClip] = useState<EphemeralAudioClip | null>(null)
  const [error, setError] = useState<ReadingRecorderError | null>(null)
  const [pauseNotice, setPauseNotice] = useState<string | null>(null)
  const activeRef = useRef<ActiveAudioRecording | null>(null)
  const clipRef = useRef<EphemeralAudioClip | null>(null)
  const generationRef = useRef(0)
  const permissionRef = useRef<AbortController | null>(null)
  const statusRef = useRef(status)
  statusRef.current = status
  const supported = dependencies !== undefined || browserSupportsAudioRecording()

  const releaseCurrent = useCallback(() => {
    generationRef.current += 1
    permissionRef.current?.abort()
    permissionRef.current = null
    activeRef.current?.cancel()
    activeRef.current = null
    clipRef.current?.dispose()
    clipRef.current = null
  }, [])

  const reset = useCallback(() => {
    releaseCurrent()
    statusRef.current = 'idle'
    setClip(null)
    setError(null)
    setStatus('idle')
  }, [releaseCurrent])

  useEffect(() => {
    reset()
    return releaseCurrent
  }, [promptId, reset, releaseCurrent])

  useEffect(() => activityClock.subscribe(paused => {
    if (paused && statusRef.current === 'requesting') reset()
    else if (paused && statusRef.current === 'recording') {
      if (!options?.preserveOnPause || !activeRef.current?.pause()) {
        reset()
        if (options?.preserveOnPause) setPauseNotice('This browser could not pause the microphone safely. Please record this unfinished word again; your reviewed work is saved.')
      }
    } else if (!paused && options?.preserveOnPause) activeRef.current?.resume()
  }), [reset, options?.preserveOnPause])

  const start = useCallback(async () => {
    if (activityClock.paused) return
    releaseCurrent()
    setClip(null)
    setError(null)
    setPauseNotice(null)
    setStatus('requesting')
    statusRef.current = 'requesting'
    const generation = generationRef.current
    const permission = new AbortController()
    permissionRef.current = permission

    try {
      const active = await startEphemeralAudioRecording(dependencies, options?.maximumDurationMs, permission.signal)
      if (generation !== generationRef.current) {
        active.cancel()
        return
      }
      activeRef.current = active
      permissionRef.current = null
      statusRef.current = 'recording'
      setStatus('recording')
      void active.finished.then((nextClip) => {
        if (generation !== generationRef.current) {
          nextClip.dispose()
          return
        }
        activeRef.current = null
        statusRef.current = 'recorded'
        clipRef.current = nextClip
        setClip(nextClip)
        setStatus('recorded')
      }).catch((nextError: unknown) => {
        if (generation !== generationRef.current) return
        activeRef.current = null
        statusRef.current = 'error'
        const normalized = nextError instanceof ReadingRecorderError
          ? nextError
          : new ReadingRecorderError('recording-failed', 'The recording could not be completed.')
        setError(normalized)
        setStatus('error')
      })
    } catch (nextError) {
      if (generation !== generationRef.current) return
      permissionRef.current = null
      statusRef.current = 'error'
      const normalized = nextError instanceof ReadingRecorderError
        ? nextError
        : new ReadingRecorderError('recording-failed', 'The recording could not be started.')
      setError(normalized)
      setStatus('error')
    }
  }, [dependencies, releaseCurrent, options?.maximumDurationMs])

  const stop = useCallback(() => activeRef.current?.stop(), [])

  return { status, clip, error, supported, pauseNotice, start, stop, reset }
}
