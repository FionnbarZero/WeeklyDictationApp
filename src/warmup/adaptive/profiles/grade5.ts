import type { AdaptiveWarmupProfile } from '../contracts.ts'

export const grade5Tier1WritingAdaptiveWarmupProfile = {
  id: 'grade5-tier1-writing-adaptive-warmup-v1',
  version: 1,
  grade: 'Grade 5',
  activityModule: 'mandarin-tier1-writing',
  preActivityWarmupRequirement: 'required',
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
