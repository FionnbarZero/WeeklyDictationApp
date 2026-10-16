import { grade2AcquisitionStrategy } from '../acquisition/strategies/grade2.ts'
import type { AcquisitionStrategy } from '../acquisition/contracts.ts'

/** Owner-approved trace → independent → distractors policy. New integrated
 * Grade 2 pilot attempts opt in; existing lessons keep their pinned strategy. */
export const writingRefinementStrategy = {
  ...grade2AcquisitionStrategy,
  id: 'grade2-writing-trace-independent-preview-v7',
  version: 7,
  introductionSequence: ['show-copy', 'target'],
  // After the one independent introduction, begin the existing expanding
  // distractor pattern immediately. Do not repeat its two initial target trials.
  expandedSequence: ['dt', 'target', 'dt', 'dt', 'target', 'dt', 'dt', 'dt', 'target'],
} as const satisfies AcquisitionStrategy
