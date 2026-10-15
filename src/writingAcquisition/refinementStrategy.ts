import { grade2AcquisitionStrategy } from '../acquisition/strategies/grade2.ts'
import type { AcquisitionStrategy } from '../acquisition/contracts.ts'

/** Isolated v7 only. The actual app continues selecting the approved v6 policy. */
export const writingRefinementStrategy = {
  ...grade2AcquisitionStrategy,
  id: 'grade2-writing-trace-independent-preview-v7',
  version: 7,
  introductionSequence: ['show-copy', 'target'],
  // After the one independent introduction, begin the existing expanding
  // distractor pattern immediately. Do not repeat its two initial target trials.
  expandedSequence: ['dt', 'target', 'dt', 'dt', 'target', 'dt', 'dt', 'dt', 'target'],
} as const satisfies AcquisitionStrategy
