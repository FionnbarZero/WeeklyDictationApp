import { GRADE5_DECK_ID } from '../config.ts'
import type { SlidesPresentationPayload } from './model.ts'

export const GRADE5_CURRICULUM_SNAPSHOT_SCHEMA = 'weekly-dictation-grade5-curriculum-snapshot-v1' as const
export const GRADE5_CURRICULUM_SOURCE_PATH = 'curriculum/grade5-presentation.json'

export type Grade5CurriculumSnapshot = {
  schema: typeof GRADE5_CURRICULUM_SNAPSHOT_SCHEMA
  source: {
    type: 'google-slides'
    documentId: typeof GRADE5_DECK_ID
    documentUrl: string
    retrievedAt: string
    contentSha256: string
  }
  presentation: SlidesPresentationPayload
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeGrade5Presentation(value: unknown): SlidesPresentationPayload {
  if (!isRecord(value) || !Array.isArray(value.slides)) {
    throw new Error('The Grade 5 curriculum source must contain one presentation with slides.')
  }
  const presentationId = typeof value.presentationId === 'string' ? value.presentationId : GRADE5_DECK_ID
  return {
    sourceType: 'google-slides',
    presentationId,
    slides: value.slides as SlidesPresentationPayload['slides'],
  }
}

export function parseGrade5CurriculumSnapshot(value: unknown): Grade5CurriculumSnapshot {
  if (!isRecord(value) || value.schema !== GRADE5_CURRICULUM_SNAPSHOT_SCHEMA) {
    throw new Error('The automatic Grade 5 curriculum snapshot has an unsupported schema.')
  }
  const source = value.source
  if (
    !isRecord(source) ||
    source.type !== 'google-slides' ||
    source.documentId !== GRADE5_DECK_ID ||
    source.documentUrl !== `https://docs.google.com/presentation/d/${GRADE5_DECK_ID}` ||
    typeof source.retrievedAt !== 'string' ||
    !Number.isFinite(Date.parse(source.retrievedAt)) ||
    typeof source.contentSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(source.contentSha256)
  ) {
    throw new Error('The automatic Grade 5 curriculum snapshot has invalid source metadata.')
  }
  const presentation = normalizeGrade5Presentation(value.presentation)
  if (
    presentation.presentationId !== GRADE5_DECK_ID ||
    !presentation.slides?.length ||
    !presentation.slides.every(
      (slide) =>
        typeof (slide.objectId || slide.pageObjectId) === 'string' &&
        Boolean(slide.objectId || slide.pageObjectId) &&
        Array.isArray(slide.pageElements),
    )
  ) {
    throw new Error('The automatic Grade 5 curriculum snapshot is not a valid Slides presentation.')
  }
  return { ...value, presentation } as Grade5CurriculumSnapshot
}
