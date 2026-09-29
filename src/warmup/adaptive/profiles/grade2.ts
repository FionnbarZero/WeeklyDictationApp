import type { AdaptiveWarmupProfile } from '../contracts.ts'

export const grade2Tier1WritingAdaptiveWarmupProfile = {
  id: 'grade2-tier1-writing-adaptive-warmup-v1',
  version: 1,
  grade: 'Grade 2',
  activityModule: 'mandarin-tier1-writing',
  preActivityWarmupRequirement: 'optional',
  recentEntryPromotionCorrect: 2,
  ordinaryDuplicatePolicy: 'unique',
  rotationPolicy: {
    exhaustBeforeReuse: true,
    advanceCycleWhenExhausted: true,
    promotedTermEligibility: 'next-cycle',
  },
  visits: {
    standalone: {
      maximum: 16,
      allocation: { 'mastery-rotation': 8, 'recent-entry': 4, 'needs-attention': 4 },
    },
    'pre-activity': {
      maximum: 6,
      allocation: { 'mastery-rotation': 3, 'recent-entry': 2, 'needs-attention': 1 },
    },
  },
  fillPriority: ['needs-attention', 'recent-entry', 'mastery-rotation'],
} as const satisfies AdaptiveWarmupProfile
