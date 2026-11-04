import { connectedFamilyFixes } from './academyRelease.ts'
import { familyPreview } from './runtime.ts'

export type LessonChannel = 'writing' | 'reading'
export type FamilyContinuationWindow = Window & {
  familyContinueLesson?: (source: Window, channel: LessonChannel) => Promise<boolean>
}

/** Same-origin bridge; the parent verifies the active frame and child again. */
export async function continueFamilyLesson(channel: LessonChannel) {
  if (!connectedFamilyFixes || !familyPreview) return false
  const frame = window.frameElement as HTMLIFrameElement | null
  if (frame?.dataset.familyResumeChannel) return false
  const owner = (window.parent as FamilyContinuationWindow).familyContinueLesson
  if (!owner) throw new Error('Your lesson is still connecting. Please try again.')
  return owner(window, channel)
}
