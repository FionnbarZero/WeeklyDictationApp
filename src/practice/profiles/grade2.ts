import type { WritingPracticeProfile } from './model.ts'

export const grade2PracticeProfile = {
  id: 'grade-2-writing-practice',
  version: 1,
  grade: 'Grade 2',
  lifecycle: {
    primaryWarmupTrials: 6,
    warmupTargetSize: 16,
    recentReviewPromotionStreak: 2,
    erroredWordPromotionStreak: 3,
  },
  timers: {
    warmup: 10,
    acquisition: 20,
    testReview: 10,
  },
  acquisition: {
    timers: {
      trueBmSeconds: 5,
      earnedBmSeconds: 5,
      introductionShowCopySeconds: 10,
      introductionHiddenTargetSeconds: 10,
      expandedStartSeconds: 10,
      expandedMinimumSeconds: 5,
      expandedDecrementSeconds: 1,
      correctionShowCopySeconds: 10,
      correctionHiddenSeconds: 10,
    },
    trueBmTexts: ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '大', '小', '人', '水'],
    introductionSequence: ['true-bm', 'true-bm', 'show-copy', 'target'],
    expandedSequence: ['target', 'bm', 'target', 'bm', 'bm', 'target', 'bm', 'bm', 'bm', 'target'],
    correctionSequence: ['show-copy', 'show-copy', 'show-copy', 'target', 'true-bm', 'target'],
  },
} as const satisfies WritingPracticeProfile
