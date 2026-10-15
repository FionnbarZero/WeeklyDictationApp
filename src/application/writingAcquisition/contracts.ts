import type { AcquisitionAssessment } from '../../acquisition/contracts.ts'
import type { AcquisitionProgressEnvelope } from '../../acquisition/persistence/contracts.ts'
import type { Dataset, Word } from '../../domain/contracts.ts'

export type WritingLesson = {
  schema: 1
  policy: 'grade2-six-step-v4' | 'grade2-five-step-preview-v6' | 'grade2-trace-independent-preview-v7'
  dataset: Dataset
  targets: { id: string; text: string; pinyin: string; meaning: string; guideFingerprint: string }[]
  fingerprint: string
}

export type WritingProgress = {
  contract: 'grade2-writing-progress-v1'
  owner: string
  attemptId: string
  revision: number
  createdAt: string
  updatedAt: string
  lesson: WritingLesson
  /** An already-started legacy target finishes under its original rules. */
  firstTeacherTargetIndex: number
  initialAcquisitionRevision: number
  completedTeachingSteps: number[]
  acquisition: AcquisitionProgressEnvelope<Word>
  assessments: AcquisitionAssessment<Word, string>[]
  lastCommand?: { id: string; fingerprint: string }
}
