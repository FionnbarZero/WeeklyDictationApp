import type { EphemeralAudioClip } from '../readingPractice/contracts.ts'
import { playManagedMediaElement } from '../audio/promptAudio.ts'

export type RetainedReadingCapture = {
  readonly targetId: string
  readonly clip: EphemeralAudioClip | null
}

export function releaseRetainedReadingCaptures(captures: readonly RetainedReadingCapture[]) {
  captures.forEach((capture) => capture.clip?.dispose())
}

export function playRetainedReadingClip(clip: EphemeralAudioClip): Promise<void> {
  return playManagedMediaElement(new Audio(clip.url))
}
