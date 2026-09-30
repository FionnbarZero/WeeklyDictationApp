export type ReadingRecordingStatus = 'idle' | 'requesting' | 'recording' | 'recorded' | 'error'

export type EphemeralAudioClip = {
  readonly url: string
  readonly mimeType: string
  readonly size: number
  dispose: () => void
}

export type ReadingRecorderErrorCode = 'unsupported' | 'permission-denied' | 'device-unavailable' | 'recording-failed'

export class ReadingRecorderError extends Error {
  readonly code: ReadingRecorderErrorCode

  constructor(code: ReadingRecorderErrorCode, message: string) {
    super(message)
    this.name = 'ReadingRecorderError'
    this.code = code
  }
}
