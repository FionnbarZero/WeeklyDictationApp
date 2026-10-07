import type { AcquisitionProgressEnvelope } from '../acquisition/persistence/contracts.ts'
import { rememberLessonLaunch } from './lessonLaunch.ts'
import { familyPreview, previewProfile } from './runtime.ts'

export function rememberFamilyLesson(envelope: AcquisitionProgressEnvelope) {
  if (!familyPreview) return
  const frame = window.frameElement as HTMLIFrameElement | null
  const profile = previewProfile()
  if (!profile || !frame?.dataset.familySource || !frame.dataset.familyWeek)
    throw new Error('The family lesson source is unavailable. Your saved work is unchanged.')
  rememberLessonLaunch(
    localStorage,
    profile,
    envelope,
    JSON.parse(frame.dataset.familySource),
    frame.dataset.familyWeek,
  )
  window.parent.postMessage({ type: 'family-beta-result-ready' }, location.origin)
}
