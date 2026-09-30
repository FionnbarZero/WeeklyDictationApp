export type ReadingRecordingStatus = 'idle' | 'requesting' | 'recording' | 'recorded' | 'error'

export type ReadingSpeechSegment = {
  readonly text: string
  readonly language: 'en-GB' | 'zh-CN'
  readonly rate: number
}

export function readingShowCopyInstruction(targetText: string): readonly ReadingSpeechSegment[] {
  return [
    { text: "Let's learn a new one. This word is…", language: 'en-GB', rate: 0.9 },
    { text: targetText, language: 'zh-CN', rate: 0.55 },
    { text: 'Now you say it and record it.', language: 'en-GB', rate: 0.9 },
  ]
}

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
