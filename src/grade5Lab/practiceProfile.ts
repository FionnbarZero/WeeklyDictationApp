import { grade5AcquisitionStrategy } from '../acquisition/strategies/grade5.ts'

// This profile is intentionally local to the Grade 5 lab. It is not registered
// as production-ready until lifecycle, Warmup, Test Review, and persistence are
// integrated and verified together.
export const grade5WritingLabProfile = {
  id: 'grade-5-writing-lab-v1',
  version: 1,
  grade: 'Grade 5',
  requiredWarmupTrials: 6,
  testReviewTimerSeconds: 10,
  acquisition: grade5AcquisitionStrategy,
} as const
