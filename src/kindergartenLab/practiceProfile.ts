import { kindergartenAcquisitionStrategy } from '../acquisition/strategies/kindergarten.ts'

// This profile is intentionally local to the development lab. It is not added
// to the production practice registry. Warmup policy is still unresolved.
export const kindergartenWritingLabProfile = {
  id: 'kindergarten-writing-lab-v1',
  version: 1,
  grade: 'Kindergarten',
  warmup: 'not-connected',
  testReviewTimerSeconds: 10,
  acquisition: kindergartenAcquisitionStrategy,
} as const
