import type { AcquisitionStrategy } from '../../acquisition/contracts.ts'

export type { AcquisitionSequenceToken } from '../../acquisition/contracts.ts'

export type WritingPracticeProfile = {
  readonly id: string
  readonly version: number
  readonly grade: string
  readonly lifecycle: {
    readonly primaryWarmupTrials: number
    readonly warmupTargetSize: number
    readonly recentReviewPromotionStreak: number
    readonly erroredWordPromotionStreak: number
  }
  readonly timers: {
    readonly warmup: number
    readonly testReview: number
  }
  readonly acquisition: AcquisitionStrategy
}
