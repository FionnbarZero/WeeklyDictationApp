import { GRADE2_DECK_ID } from '../config.ts'
import { slideText, type PresentationLike } from '../slidesImporter.ts'

export const GRADE2_CURRICULUM_SNAPSHOT_SCHEMA = 'weekly-dictation-grade2-curriculum-snapshot-v1' as const
export const GRADE2_CURRICULUM_SOURCE_PATH = 'curriculum/grade2-presentation.json'

export type Grade2CurriculumSnapshot = {
  schema: typeof GRADE2_CURRICULUM_SNAPSHOT_SCHEMA
  source: {
    type: 'google-slides'
    documentId: typeof GRADE2_DECK_ID
    documentUrl: string
    retrievedAt: string
    contentSha256: string
  }
  presentation: PresentationLike
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function projectGrade2CurriculumText(raw: string) {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const cutoff = lines.findIndex((line, index) => index > 0 && /^(?:ELA|Math)\s*$/i.test(line.trim()))
  return lines
    .slice(0, cutoff < 0 ? undefined : cutoff)
    .join('\n')
    .trim()
}

export function projectGrade2CurriculumPresentation(presentation: PresentationLike): PresentationLike {
  return {
    presentationId: presentation.presentationId,
    slides: (presentation.slides || []).map((slide) => ({
      objectId: slide.objectId || slide.pageObjectId,
      text: projectGrade2CurriculumText(slideText(slide)),
    })),
  }
}

export function parseGrade2CurriculumSnapshot(value: unknown): Grade2CurriculumSnapshot {
  if (!isRecord(value) || value.schema !== GRADE2_CURRICULUM_SNAPSHOT_SCHEMA) {
    throw new Error('The automatic Grade 2 curriculum snapshot has an unsupported schema.')
  }
  const source = value.source
  const presentation = value.presentation
  if (
    !isRecord(source) ||
    source.type !== 'google-slides' ||
    source.documentId !== GRADE2_DECK_ID ||
    typeof source.documentUrl !== 'string' ||
    source.documentUrl !== `https://docs.google.com/presentation/d/${GRADE2_DECK_ID}` ||
    typeof source.retrievedAt !== 'string' ||
    !Number.isFinite(Date.parse(source.retrievedAt)) ||
    typeof source.contentSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(source.contentSha256)
  ) {
    throw new Error('The automatic Grade 2 curriculum snapshot has invalid source metadata.')
  }
  if (
    !isRecord(presentation) ||
    presentation.presentationId !== GRADE2_DECK_ID ||
    !Array.isArray(presentation.slides) ||
    presentation.slides.length === 0 ||
    !presentation.slides.every(
      (slide) =>
        isRecord(slide) &&
        typeof slide.objectId === 'string' &&
        slide.objectId.length > 0 &&
        typeof slide.text === 'string' &&
        slide.text.trim().length > 0,
    )
  ) {
    throw new Error('The automatic Grade 2 curriculum snapshot is not a valid projected presentation.')
  }
  return value as Grade2CurriculumSnapshot
}
