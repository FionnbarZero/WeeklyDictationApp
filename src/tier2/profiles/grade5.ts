import { grade5AcquisitionStrategy } from '../../acquisition/strategies/grade5.ts'
import { grade5ProgressionLifecycleStrategy } from '../../lifecycle/strategies/grade5ProgressionStrategy.ts'
import { acquisitionStrategyForTier2Reading } from '../acquisition.ts'
import { TIER2_READING_ACTIVITY_MODULE, TIER2_READING_RESPONSE_RULE, type Tier2ReadingProfile } from '../contracts.ts'

export const grade5Tier2ReadingProfile = {
  id: 'grade-5-tier-2-reading-v1',
  version: 1,
  grade: 'Grade 5',
  schoolYearKey: '2026-27',
  activityModule: TIER2_READING_ACTIVITY_MODULE,
  responseRule: TIER2_READING_RESPONSE_RULE,
  lifecycleStrategy: grade5ProgressionLifecycleStrategy,
  acquisitionStrategy: acquisitionStrategyForTier2Reading({
    id: 'grade-5-tier-2-reading-acquisition-v2',
    familiarDatasetId: '__grade-5-tier-2-familiar-dt__',
    familiarTargetIdPrefix: 'grade-5-tier-2-familiar-dt',
    pattern: grade5AcquisitionStrategy,
  }),
  preActivityWarmupRequirement: 'undecided',
  availability: 'development',
  results: 'session-only',
  recording: 'prompt-local',
  productionEligibility: 'blocked',
} as const satisfies Tier2ReadingProfile
