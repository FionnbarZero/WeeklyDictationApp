import { grade2AcquisitionStrategy } from '../../acquisition/strategies/grade2.ts'
import { grade2ReplacementLifecycleStrategy } from '../../lifecycle/strategies/grade2ReplacementStrategy.ts'
import { acquisitionStrategyForTier2Reading } from '../acquisition.ts'
import { TIER2_READING_ACTIVITY_MODULE, TIER2_READING_RESPONSE_RULE, type Tier2ReadingProfile } from '../contracts.ts'

export const grade2Tier2ReadingProfile = {
  id: 'grade-2-tier-2-reading-v1',
  version: 1,
  grade: 'Grade 2',
  schoolYearKey: '2026-27',
  activityModule: TIER2_READING_ACTIVITY_MODULE,
  responseRule: TIER2_READING_RESPONSE_RULE,
  lifecycleStrategy: grade2ReplacementLifecycleStrategy,
  acquisitionStrategy: acquisitionStrategyForTier2Reading({
    id: 'grade-2-tier-2-reading-acquisition-v3',
    familiarDatasetId: '__grade-2-tier-2-familiar-dt__',
    familiarTargetIdPrefix: 'grade-2-tier-2-familiar-dt',
    pattern: grade2AcquisitionStrategy,
  }),
  preActivityWarmupRequirement: 'optional',
  availability: 'main-app',
  results: 'durable',
  recording: 'prompt-local',
  productionEligibility: 'eligible',
} as const satisfies Tier2ReadingProfile
