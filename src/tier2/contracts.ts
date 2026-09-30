import type { AcquisitionStrategy } from '../acquisition/contracts.ts'
import type { Word } from '../domain/contracts.ts'
import type { LifecycleStrategy } from '../lifecycle/contracts.ts'

export const TIER2_READING_ACTIVITY_MODULE = 'mandarin-tier2-reading' as const

/** Shared response rule for every Tier 2 lifecycle pathway and grade. */
export const TIER2_READING_RESPONSE_RULE = {
  targetPresentation: 'visible',
  response: 'read-aloud',
  assessment: 'self-assessment',
  recording: 'none',
} as const

export type Tier2ReadingTarget = Word & {
  language: 'mandarin'
  tier: 'tier-2'
  activityType: 'reading'
}

export type Tier2ReadingProfile = {
  readonly id: string
  readonly version: number
  readonly grade: string
  readonly schoolYearKey: string
  readonly activityModule: typeof TIER2_READING_ACTIVITY_MODULE
  readonly responseRule: typeof TIER2_READING_RESPONSE_RULE
  readonly lifecycleStrategy: LifecycleStrategy
  readonly acquisitionStrategy: AcquisitionStrategy<Tier2ReadingTarget>
  readonly preActivityWarmupRequirement: 'optional' | 'required' | 'undecided'
  readonly releaseStatus: 'inactive'
}

export type Tier2ReadingCohort = {
  readonly datasetId: string
  readonly targets: readonly Tier2ReadingTarget[]
  readonly available: boolean
  readonly unavailableReason?: string
}

export type Tier2ReadingPathway = {
  readonly kind: 'acquisition' | 'test-review' | 'mastery'
  readonly cycle?: number
  readonly reviewGroupId?: string
  readonly cohorts: readonly Tier2ReadingCohort[]
  readonly available: boolean
  readonly unavailableReason?: string
}

export type Tier2ReadingLifecycle = {
  readonly grade: string
  readonly schoolYearKey: string
  readonly activityModule: typeof TIER2_READING_ACTIVITY_MODULE
  readonly acquisition: Tier2ReadingPathway | null
  readonly testReviews: readonly Tier2ReadingPathway[]
  readonly mastery: Tier2ReadingPathway
  readonly futureDatasetIds: readonly string[]
  readonly noInstructionDatasetIds: readonly string[]
}
