import snapshot from '../../public/curriculum/grade2-presentation.json' with { type: 'json' }
import type { WritingLesson } from '../application/writingAcquisition/contracts.ts'
import { createWritingLesson } from '../application/writingAcquisition/lesson.ts'
import { parseSlide } from '../slidesImporter.ts'

/** The preserved teacher-source week used by approved v4, in its original order. */
export function writingPreviewLesson(policy?: WritingLesson['policy']) {
  const slide = snapshot.presentation.slides.find((item) => item.text.startsWith('Week 9/29-10/2'))
  if (!slide) throw new Error('The reference Grade 2 curriculum week is unavailable.')
  const parsed = parseSlide(slide)
  if (parsed.status !== 'imported' || !parsed.dataset) throw new Error('The reference curriculum did not validate.')
  return createWritingLesson(parsed.dataset, policy)
}

export const WRITING_PREVIEW_VERSION = 'Grade 2 writing preview 6 · Five teaching steps'
export const WRITING_PREVIEW_POLICY = 'grade2-five-step-preview-v6' as const
export const WRITING_PREVIEW_KEY = 'ninja-writing-integration-preview-v6:synthetic-owner'
export const WRITING_PREVIEW_OWNER = 'synthetic-writing-preview'

export const REFINEMENT_PREVIEW_VERSION =
  'Grade 2 writing preview 7 · Large scrolls · Trace → independent → distractors'
export const REFINEMENT_PREVIEW_KEY = 'ninja-writing-integration-preview-v7:synthetic-owner'
export const REFINEMENT_PREVIEW_POLICY = 'grade2-trace-independent-preview-v7' as const

export const IPAD_PREVIEW_KEY = 'ninja-writing-integration-preview-v8:synthetic-owner'
export const IPAD_PREVIEW_VERSION = 'Grade 2 preview 8 · iPad scrolls & audio'
