import { grade5AcquisitionStrategy } from '../../acquisition/strategies/grade5.ts'
import type { WritingPracticeProfile } from './model.ts'

/**
 * Grade 5 keeps its two-review lifecycle while sharing the same teaching,
 * Warmup sizing, promotion, recovery, and timing contracts as writing practice.
 */
export const grade5PracticeProfile = {
  id: 'grade-5-writing-practice',
  version: 1,
  grade: 'Grade 5',
  preActivityWarmupRequirement: 'required',
  lifecycle: {
    primaryWarmupTrials: 6,
    warmupTargetSize: 16,
    recentReviewPromotionStreak: 2,
    erroredWordPromotionStreak: 3,
  },
  timers: {
    warmup: 10,
    testReview: 10,
  },
  acquisition: grade5AcquisitionStrategy,
} as const satisfies WritingPracticeProfile
