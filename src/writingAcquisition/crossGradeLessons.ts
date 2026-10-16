import grade5 from '../../public/curriculum/beta/grade5.json' with { type: 'json' }
import kindergarten from '../../public/curriculum/beta/kindergarten.json' with { type: 'json' }
import {
  createWritingLesson,
  GRADE5_WRITING_POLICY,
  KINDERGARTEN_WRITING_POLICY,
} from '../application/writingAcquisition/lesson.ts'
import { type CurriculumSnapshot, inspectSnapshot } from '../familyBeta/curriculum.ts'

export type CrossGrade = 'Kindergarten' | 'Grade 5'
export const CROSS_GRADE_PREVIEW_OWNER = 'synthetic-cross-grade-writing'
export const CROSS_GRADE_PREVIEW_VERSION = 'Cross-grade writing prototype 1'

/** Full teacher-source cohorts: no truncation, substitutions or guide filtering. */
export function crossGradeLessons(grade: CrossGrade) {
  const source = grade === 'Kindergarten' ? kindergarten : grade5
  const policy = grade === 'Kindergarten' ? KINDERGARTEN_WRITING_POLICY : GRADE5_WRITING_POLICY
  return inspectSnapshot(source as CurriculumSnapshot).datasets.map((dataset) => createWritingLesson(dataset, policy))
}
export function crossGradePreviewKey(grade: string, datasetId: string) {
  return `ninja-cross-grade-writing-preview-v1:${grade}:${datasetId}`
}
