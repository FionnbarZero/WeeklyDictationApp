export type AcquisitionSequenceToken = 'true-bm' | 'bm' | 'show-copy' | 'target'

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
    readonly acquisition: number
    readonly testReview: number
  }
  readonly acquisition: {
    readonly timers: {
      readonly trueBmSeconds: number
      readonly earnedBmSeconds: number
      readonly introductionShowCopySeconds: number
      readonly introductionHiddenTargetSeconds: number
      readonly expandedStartSeconds: number
      readonly expandedMinimumSeconds: number
      readonly expandedDecrementSeconds: number
      readonly correctionShowCopySeconds: number
      readonly correctionHiddenSeconds: number
    }
    readonly trueBmTexts: readonly string[]
    readonly introductionSequence: readonly AcquisitionSequenceToken[]
    readonly expandedSequence: readonly AcquisitionSequenceToken[]
    readonly correctionSequence: readonly AcquisitionSequenceToken[]
  }
}
