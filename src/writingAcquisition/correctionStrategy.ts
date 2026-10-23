import type { AcquisitionStrategy } from '../acquisition/contracts.ts'
import { writingRefinementStrategy } from './refinementStrategy.ts'

export const COPY_MEMORY_WRITING_POLICY = 'grade2-copy-memory-preview-v8' as const
export const writingCorrectionPreview =
  (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_WRITING_CORRECTION_PREVIEW === 'true'

/** New Grade 2 writing attempts only. Existing lessons keep their pinned rules. */
export const writingCorrectionStrategy = {
  ...writingRefinementStrategy,
  id: 'grade2-writing-copy-memory-v8',
  version: 8,
  correctionSequence: ['show-copy', 'target'],
  correctionPolicy: {
    assessmentMode: 'scored',
    finalExpandedFailure: 'complete-after-correction',
    repeatUntilCorrect: true,
  },
} as const satisfies AcquisitionStrategy
