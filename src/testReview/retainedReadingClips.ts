import type { EphemeralAudioClip } from '../readingPractice/contracts.ts'

export type RetainedReadingCapture = {
  readonly targetId: string
  readonly clip: EphemeralAudioClip | null
}

export function releaseRetainedReadingCaptures(captures: readonly RetainedReadingCapture[]) {
  captures.forEach((capture) => capture.clip?.dispose())
}

export function playRetainedReadingClip(clip: EphemeralAudioClip): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(clip.url)
    audio.onended = () => resolve()
    audio.onerror = () => reject(new Error('The child recording could not be played.'))
    void audio.play().catch(reject)
  })
}
