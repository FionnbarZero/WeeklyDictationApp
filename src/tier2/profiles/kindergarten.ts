import { kindergartenAcquisitionStrategy } from '../../acquisition/strategies/kindergarten.ts'
import { kindergartenUnitLifecycleStrategy } from '../../lifecycle/strategies/kindergartenUnitStrategy.ts'
import { acquisitionStrategyForTier2Reading } from '../acquisition.ts'
import { TIER2_READING_ACTIVITY_MODULE, TIER2_READING_RESPONSE_RULE, type Tier2ReadingProfile } from '../contracts.ts'

export const kindergartenTier2ReadingProfile = {
  id: 'kindergarten-tier-2-reading-v1',
  version: 1,
  grade: 'Kindergarten',
  schoolYearKey: '2026-27',
  activityModule: TIER2_READING_ACTIVITY_MODULE,
  responseRule: TIER2_READING_RESPONSE_RULE,
  lifecycleStrategy: kindergartenUnitLifecycleStrategy,
  acquisitionStrategy: acquisitionStrategyForTier2Reading({
    id: 'kindergarten-tier-2-reading-acquisition-v1',
    familiarDatasetId: '__kindergarten-tier-2-familiar-dt__',
    familiarTargetIdPrefix: 'kindergarten-tier-2-familiar-dt',
    pattern: kindergartenAcquisitionStrategy,
  }),
  preActivityWarmupRequirement: 'optional',
  releaseStatus: 'inactive',
} as const satisfies Tier2ReadingProfile
