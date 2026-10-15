import snapshot from '../../public/curriculum/grade2-presentation.json' with { type: 'json' }
import { parseSlide } from '../slidesImporter.ts'
import { createWritingLesson } from './lesson.ts'

/** The preserved teacher-source week used by approved v4, in its original order. */
export function writingPreviewLesson() {
  const slide = snapshot.presentation.slides.find((item) => item.text.startsWith('Week 9/29-10/2'))
  if (!slide) throw new Error('The reference Grade 2 curriculum week is unavailable.')
  const parsed = parseSlide(slide)
  if (parsed.status !== 'imported' || !parsed.dataset) throw new Error('The reference curriculum did not validate.')
  return createWritingLesson(parsed.dataset)
}

export const WRITING_PREVIEW_VERSION = 'Grade 2 writing integration preview 5'
export const WRITING_PREVIEW_KEY = 'ninja-writing-integration-preview-v5:synthetic-owner'
export const WRITING_PREVIEW_OWNER = 'synthetic-writing-preview'
