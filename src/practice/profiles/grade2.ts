import { grade2AcquisitionStrategy } from '../../acquisition/strategies/grade2.ts'
import type { WritingPracticeProfile } from './model.ts'

export const grade2PracticeProfile = {
  id: 'grade-2-writing-practice',
  version: 2,
  grade: 'Grade 2',
  preActivityWarmupRequirement: 'optional',
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
  acquisition: grade2AcquisitionStrategy,
} as const satisfies WritingPracticeProfile
