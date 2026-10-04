import { ReadingRecorderError, type EphemeralAudioClip } from './contracts.ts'
import { stopActiveAudio } from '../audio/promptAudio.ts'

export const READING_RECORDING_LIMIT_MS = 8_000
export const READING_AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
] as const

export type AudioMediaStream = {
  getTracks: () => Array<{ stop: () => void }>
}

export type AudioMediaRecorder = {
  state: string
  mimeType: string
  ondataavailable: ((event: { data: Blob }) => void) | null
  onerror: ((event: Event) => void) | null
  onstop: (() => void) | null
  start: () => void
  stop: () => void
}

export type AudioRecorderDependencies = {
  getUserMedia: () => Promise<AudioMediaStream>
  createRecorder: (stream: AudioMediaStream, mimeType?: string) => AudioMediaRecorder
  createObjectURL: (blob: Blob) => string
  revokeObjectURL: (url: string) => void
  schedule: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  cancelSchedule: (timer: ReturnType<typeof setTimeout>) => void
}

export type ActiveAudioRecording = {
  readonly finished: Promise<EphemeralAudioClip>
  stop: () => void
  cancel: () => void
}

export function selectReadingAudioMimeType(isTypeSupported: (mimeType: string) => boolean): string | undefined {
  return READING_AUDIO_MIME_CANDIDATES.find((mimeType) => isTypeSupported(mimeType))
}

export function browserSupportsAudioRecording() {
  return typeof navigator !== 'undefined'
    && typeof navigator.mediaDevices?.getUserMedia === 'function'
    && typeof MediaRecorder !== 'undefined'
}

export function browserAudioRecorderDependencies(): AudioRecorderDependencies {
  if (!browserSupportsAudioRecording()) {
    throw new ReadingRecorderError('unsupported', 'Audio recording is not available in this browser.')
  }

  const mimeType = typeof MediaRecorder.isTypeSupported === 'function'
    ? selectReadingAudioMimeType((candidate) => MediaRecorder.isTypeSupported(candidate))
    : undefined
  return {
    getUserMedia: () => navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: { ideal: 1 },
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true },
      },
      video: false,
    }),
    createRecorder: (stream) => new MediaRecorder(
      stream as MediaStream,
      mimeType ? { mimeType } : undefined,
    ) as unknown as AudioMediaRecorder,
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
    cancelSchedule: (timer) => window.clearTimeout(timer),
  }
}

function recorderError(error: unknown): ReadingRecorderError {
  if (error instanceof ReadingRecorderError) return error
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return new ReadingRecorderError('permission-denied', 'Microphone permission was not granted.')
    }
    if (error.name === 'NotFoundError' || error.name === 'NotReadableError') {
      return new ReadingRecorderError('device-unavailable', 'A working microphone could not be found.')
    }
  }
  return new ReadingRecorderError('recording-failed', 'The recording could not be completed.')
}

export async function startEphemeralAudioRecording(
  dependencies: AudioRecorderDependencies = browserAudioRecorderDependencies(),
  maximumDurationMs = READING_RECORDING_LIMIT_MS,
): Promise<ActiveAudioRecording> {
  // A microphone must never compete with an instruction, model, or game cue.
  stopActiveAudio()
  let stream: AudioMediaStream
  try {
    stream = await dependencies.getUserMedia()
  } catch (error) {
    throw recorderError(error)
  }

  let recorder: AudioMediaRecorder
  try {
    recorder = dependencies.createRecorder(stream)
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop())
    throw recorderError(error)
  }

  const chunks: Blob[] = []
  let discarded = false
  let settled = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let resolveFinished!: (clip: EphemeralAudioClip) => void
  let rejectFinished!: (error: ReadingRecorderError) => void

  const releaseMicrophone = () => stream.getTracks().forEach((track) => track.stop())
  const clearLimit = () => {
    if (timer !== undefined) dependencies.cancelSchedule(timer)
    timer = undefined
  }

  const finished = new Promise<EphemeralAudioClip>((resolve, reject) => {
    resolveFinished = resolve
    rejectFinished = reject
  })

  function rejectOnce(error: unknown) {
    if (settled) return
    settled = true
    clearLimit()
    releaseMicrophone()
    rejectFinished(recorderError(error))
  }

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }
  recorder.onerror = () => rejectOnce(new ReadingRecorderError('recording-failed', 'The recording stopped unexpectedly.'))
  recorder.onstop = () => {
    if (settled) return
    clearLimit()
    releaseMicrophone()
    if (discarded) {
      settled = true
      rejectFinished(new ReadingRecorderError('recording-failed', 'The recording was cancelled.'))
      return
    }

    try {
      const mimeType = recorder.mimeType || chunks[0]?.type || 'audio/webm'
      const blob = new Blob(chunks, { type: mimeType })
      const url = dependencies.createObjectURL(blob)
      let disposed = false
      settled = true
      resolveFinished({
        url,
        mimeType,
        size: blob.size,
        dispose: () => {
          if (disposed) return
          disposed = true
          dependencies.revokeObjectURL(url)
        },
      })
    } catch (error) {
      settled = true
      rejectFinished(recorderError(error))
    }
  }

  try {
    recorder.start()
  } catch (error) {
    settled = true
    clearLimit()
    releaseMicrophone()
    throw recorderError(error)
  }

  const stop = () => {
    if (recorder.state === 'inactive') return
    try {
      recorder.stop()
    } catch (error) {
      rejectOnce(error)
    }
  }
  const cancel = () => {
    discarded = true
    if (recorder.state === 'inactive') {
      rejectOnce(new ReadingRecorderError('recording-failed', 'The recording was cancelled.'))
      return
    }
    try {
      recorder.stop()
    } catch (error) {
      rejectOnce(error)
    }
  }

  timer = dependencies.schedule(stop, maximumDurationMs)
  return { finished, stop, cancel }
}
