export type MasteryNormalizerVersion = 'mastery-normalizer-v1'

export type MasteryLanguage = 'mandarin' | 'english'
export type MasteryVocabularyTier = 'tier-1' | 'tier-2' | 'tier-3'
export type MasteryActivityModule = string

export type MasteryIdentityTuple = {
  normalizerVersion: MasteryNormalizerVersion
  activityModule: MasteryActivityModule
  tier: MasteryVocabularyTier
  language: MasteryLanguage
  normalizedTerm: string
}

export type MasteryOccurrenceStage =
  | { kind: 'future' }
  | { kind: 'acquisition' }
  | { kind: 'test-review'; cycle: number }
  | { kind: 'mastery' }
  | { kind: 'no-instruction' }
  | { kind: 'malformed' }
  | { kind: 'legacy-active' }

export type MasteryOccurrence = {
  occurrenceId: string
  wordId: string
  datasetId: string
  grade: string
  schoolYear: string
  displayText: string
  identity: MasteryIdentityTuple
  masteryTermId: string
}

export type MasteryTermDefinition = {
  id: string
  identity: MasteryIdentityTuple
  occurrences: MasteryOccurrence[]
}

export type MasteryDatasetLifecycleAssignment = {
  datasetId: string
  profileId: string
  stage: MasteryOccurrenceStage
  finalTestReviewCycle: number
}

export type MasteryCurriculumScope = {
  grade: string
  schoolYear: string
}

export type MasteryLifecycleAssignment =
  | {
      occurrenceId: string
      status: 'resolved'
      profileId: string
      stage: MasteryOccurrenceStage
      finalTestReviewCycle: number
    }
  | {
      occurrenceId: string
      status: 'unresolved'
      reason: 'missing' | 'conflicting' | 'invalid' | 'strategy-mismatch'
    }

export type MasteryEvidence = 'unassessed' | 'demonstrated' | 'support-needed'
export type WarmupSchedulingBucket = 'recent-entry' | 'needs-attention' | 'mastery-rotation'

export type FinalReviewEvidenceStatus = 'completed' | 'provisional' | 'abandoned' | 'skipped' | 'unanswered'

export type FinalReviewEvidenceCandidate = {
  attemptId: string
  childId: string
  occurrenceId: string
  reviewCycle: number
  reviewedAt: string
  status: FinalReviewEvidenceStatus
  correct?: boolean
}

export type OccurrenceIntegrationEvidence = 'correct' | 'incorrect' | 'none'

export type OccurrenceIntegrationRecord = {
  occurrenceId: string
  evidence: OccurrenceIntegrationEvidence
  eligibilityBasis: {
    kind: 'verified-mastery'
    lifecycleProfileId: string
    finalTestReviewCycle: number
  }
  sourceAttemptId?: string
  sourceReviewedAt?: string
}

export type AdaptiveWarmupProfileIdentity = {
  id: string
  version: number
}

export type LegacyMasteryCheckpoint = {
  kind: 'timestamp' | 'unknown-cutoff'
  sourceRecordIds: string[]
  through?: string
}

export type AppliedLegacyWarmupAttempt = {
  attemptId: string
  reviewedAt: string
  correct: boolean
  payloadFingerprint: string
}

export type ChildMasteryState = {
  version: 1
  id: string
  childId: string
  masteryTermId: string
  evidence: MasteryEvidence
  bucket: WarmupSchedulingBucket
  consecutiveCorrect: number
  schedulingProfile: {
    id: string
    version: number
    sourceOccurrenceId: string
  }
  integratedOccurrences: OccurrenceIntegrationRecord[]
  legacyCheckpoint?: LegacyMasteryCheckpoint
  appliedLegacyWarmupAttempts?: AppliedLegacyWarmupAttempt[]
  rotationEligibleFromCycle?: number
  lastConsumedRotationCycle?: number
  lastReviewedAt?: string
  lastIncorrectAt?: string
}

export type MasteryRotationState = {
  version: 1
  id: string
  childId: string
  activityModule: MasteryActivityModule
  cycle: number
}

export type WarmupAssessmentOutcome = 'correct' | 'incorrect' | 'skipped' | 'unanswered'

export type WarmupAssessment = {
  outcome: WarmupAssessmentOutcome
  reviewedAt?: string
}

export const NEEDS_ATTENTION_RECOVERY_CORRECT = 3

export type WarmupPromotedTermEligibility = 'current-cycle' | 'next-cycle'

export type WarmupOrdinaryDuplicatePolicy = 'unique' | 'repeat-after-unique-exhaustion'

export type WarmupRotationPolicy = {
  exhaustBeforeReuse: boolean
  advanceCycleWhenExhausted: boolean
  promotedTermEligibility: WarmupPromotedTermEligibility
}

export type WarmupBucketAllocation = Record<WarmupSchedulingBucket, number>
export type WarmupVisitType = 'standalone' | 'pre-activity'

export type AdaptiveWarmupProfile = {
  id: string
  version: number
  grade: string
  activityModule: MasteryActivityModule
  preActivityWarmupRequirement: 'optional' | 'required'
  recentEntryPromotionCorrect: number
  ordinaryDuplicatePolicy: WarmupOrdinaryDuplicatePolicy
  rotationPolicy: WarmupRotationPolicy
  visits: Record<WarmupVisitType, {
    maximum: number
    allocation: WarmupBucketAllocation
  }>
  fillPriority: readonly WarmupSchedulingBucket[]
}

export type AdaptiveWarmupActiveProfile = {
  grade: string
  activityModule: MasteryActivityModule
  profile: AdaptiveWarmupProfileIdentity
}

export type AdaptiveWarmupProfileUpgrade = {
  id: string
  kind: 'version-upgrade' | 'grade-rebind'
  from: AdaptiveWarmupProfileIdentity
  to: AdaptiveWarmupProfileIdentity
}

export type AdaptiveWarmupProfileRegistry = {
  definitions: readonly AdaptiveWarmupProfile[]
  activeProfiles: readonly AdaptiveWarmupActiveProfile[]
  upgrades: readonly AdaptiveWarmupProfileUpgrade[]
}

export type AdaptiveWarmupQueueEntry = {
  masteryTermId: string
  sourceBucket: WarmupSchedulingBucket
  occurrenceIds: string[]
}

export type AdaptiveWarmupSelection = {
  visitType: WarmupVisitType
  profile: AdaptiveWarmupProfileIdentity
  configuredMaximum: number
  entries: AdaptiveWarmupQueueEntry[]
  rotationCycle: number
  rotationAdvanced: boolean
}
