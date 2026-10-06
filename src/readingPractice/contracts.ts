export type ReadingRecordingStatus = 'idle' | 'requesting' | 'recording' | 'recorded' | 'error'

export type ReadingSpeechSegment = {
  readonly text: string
  readonly language: 'en-GB' | 'zh-CN'
  readonly rate: number
}

export function readingShowCopyInstruction(target: string | { readonly text: string; readonly sentence?: string }): readonly ReadingSpeechSegment[] {
  const targetText = typeof target === 'string' ? target : target.text
  const context = typeof target === 'string' ? '' : target.sentence?.trim() || ''
  return [
    { text: 'Read and record', language: 'en-GB', rate: 0.9 },
    { text: targetText, language: 'zh-CN', rate: 0.55 },
    ...(context ? [{ text: context, language: 'zh-CN' as const, rate: 0.55 }] : []),
    { text: targetText, language: 'zh-CN', rate: 0.55 },
    { text: targetText, language: 'zh-CN', rate: 0.55 },
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
