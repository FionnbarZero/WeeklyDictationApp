import { kindergartenAcquisitionStrategy } from '../../acquisition/strategies/kindergarten.ts'
import type { WritingPracticeProfile } from './model.ts'

/**
 * Kindergarten owns every value in this profile. The current Warmup numbers
 * deliberately match the approved Grade 2 values, but no profile object or
 * nested policy object is shared by identity.
 */
export const kindergartenWritingPracticeProfile = {
  id: 'kindergarten-tier-1-writing-practice',
  version: 1,
  grade: 'Kindergarten',
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
  acquisition: kindergartenAcquisitionStrategy,
  presentation: {
    homeEyebrow: 'Weekly teaching modules',
    homeHeading: 'Enter the Dojo',
    homeDescription: 'Learn this week’s writing characters and high-frequency reading words.',
    acquisitionLabel: 'Writing characters',
    acquisitionAction: 'Start writing practice',
    testReviewLabel: 'Prepare for your test',
    testReviewAction: 'Prepare for your test',
  },
} as const satisfies WritingPracticeProfile
