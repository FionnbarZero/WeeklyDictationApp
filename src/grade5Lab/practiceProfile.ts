import { grade5PracticeProfile } from '../practice/profiles/grade5.ts'

// This profile is intentionally local to the Grade 5 lab. It is not registered
// as production-ready until lifecycle, Warmup, Test Review, and persistence are
// integrated and verified together.
export const grade5WritingLabProfile = {
  ...grade5PracticeProfile,
  warmupPreview: {
    preActivityMaximum: grade5PracticeProfile.lifecycle.primaryWarmupTrials,
    preActivityWarmupRequirement: grade5PracticeProfile.preActivityWarmupRequirement,
  },
} as const
