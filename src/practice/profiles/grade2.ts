import type { WritingPracticeProfile } from './model.ts'

export const grade2PracticeProfile = {
  id: 'grade-2-writing-practice',
  version: 2,
  grade: 'Grade 2',
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
  acquisition: {
    timers: {
      establishedDtSeconds: 5,
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
    establishedDtTexts: ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '大', '小', '上', '下', '人', '水'],
    introductionSequence: ['established-dt', 'established-dt', 'show-copy', 'target'],
    expandedSequence: ['target', 'target', 'dt', 'target', 'dt', 'dt', 'target', 'dt', 'dt', 'dt', 'target'],
    correctionSequence: ['show-copy', 'show-copy', 'target', 'established-dt', 'target'],
  },
} as const satisfies WritingPracticeProfile
