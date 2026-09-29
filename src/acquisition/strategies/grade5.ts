import type { AcquisitionStrategy } from '../contracts.ts'
import { grade2AcquisitionStrategy } from './grade2.ts'

// Grade 5 currently uses the approved Acquisition v3 teaching contract. The
// values are explicit here so a later Grade 2 calibration cannot silently
// reinterpret Grade 5 progress. The familiar seed list is intentionally shared
// until child-specific mastery-bank targets replace it.
export const grade5AcquisitionStrategy = {
  id: 'grade5-acquisition-v1',
  version: 1,
  timers: {
    familiarDtSeconds: 5,
    earnedDtSeconds: 5,
    introductionShowCopySeconds: 10,
    introductionHiddenTargetSeconds: 10,
    expandedStartSeconds: 10,
    expandedMinimumSeconds: 5,
    expandedDecrementSeconds: 1,
    correctionShowCopySeconds: 10,
    correctionHiddenSeconds: 10,
  },
  dtObservationMode: 'collect',
  familiarDtTargets: grade2AcquisitionStrategy.familiarDtTargets,
  introductionSequence: ['familiar-dt', 'familiar-dt', 'show-copy', 'target'],
  expandedSequence: ['target', 'dt', 'target', 'dt', 'dt', 'target', 'dt', 'dt', 'dt', 'target'],
  correctionSequence: ['show-copy', 'show-copy', 'show-copy', 'target', 'familiar-dt', 'target'],
} as const satisfies AcquisitionStrategy
