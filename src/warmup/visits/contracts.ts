import type {
  AdaptiveWarmupProfileIdentity,
  ChildMasteryState,
  MasteryActivityModule,
  MasteryLanguage,
  MasteryVocabularyTier,
  WarmupSchedulingBucket,
  WarmupVisitType,
} from '../adaptive/contracts.ts'

export const WARMUP_VISIT_SCHEMA_VERSION = 1 as const
export const WARMUP_VISIT_CONTRACT_ID = 'adaptive-warmup-visit-v1' as const

export type WarmupVisitStatus = 'in-progress' | 'partial' | 'completed' | 'skipped'
export type WarmupQueueEntryStatus = 'pending' | 'answered' | 'unavailable'

export type WarmupPromptSnapshot = {
  readonly wordId: string
  readonly datasetId: string
  readonly text: string
  readonly sentence: string
}

export type WarmupVisitQueueEntry = {
  readonly id: string
  readonly position: number
  readonly masteryTermId: string
  readonly sourceBucket: WarmupSchedulingBucket
  readonly occurrenceIds: readonly string[]
  readonly prompt: WarmupPromptSnapshot
  readonly status: WarmupQueueEntryStatus
  readonly attemptId?: string
  readonly unavailableReason?: 'active-curriculum-occurrence'
}

export type WarmupPrimaryActivity = {
  readonly phase: 'acquisition' | 'test-review'
  readonly datasetId: string
  readonly reviewGroupId?: string
  readonly reviewCycle?: number
}

export type WarmupVisit = {
  readonly schemaVersion: typeof WARMUP_VISIT_SCHEMA_VERSION
  readonly contractId: typeof WARMUP_VISIT_CONTRACT_ID
  readonly id: string
  readonly childId: string
  readonly grade: string
  readonly schoolYear: string
  readonly activityModule: MasteryActivityModule
  readonly tier: MasteryVocabularyTier
  readonly language: MasteryLanguage
  readonly visitType: WarmupVisitType
  readonly profile: AdaptiveWarmupProfileIdentity
  readonly associatedPrimaryActivity?: WarmupPrimaryActivity
  readonly configuredMaximum: number
  readonly assignedQueueSize: number
  readonly queue: readonly WarmupVisitQueueEntry[]
  readonly nextPosition: number
  readonly rotationCycle: number
  readonly revision: number
  readonly status: WarmupVisitStatus
  readonly attemptedCount: number
  readonly correctCount: number
  readonly percent: number
  readonly lastAppliedTransition?: WarmupTransitionReceipt
  readonly createdAt: string
  readonly updatedAt: string
  readonly finalizedAt?: string
}

export type VersionedChildMasteryState = {
  readonly revision: number
  readonly state: ChildMasteryState
  readonly lastAppliedTransition?: WarmupTransitionReceipt
}

export type WarmupAttempt = {
  readonly id: string
  readonly visitId: string
  readonly transitionId: string
  readonly childId: string
  readonly queueEntryId: string
  readonly queuePosition: number
  readonly masteryTermId: string
  readonly sourceBucket: WarmupSchedulingBucket
  readonly sourceOccurrenceIds: readonly string[]
  readonly wordId: string
  readonly datasetId: string
  readonly correct: boolean
  readonly revealMethod: 'timer' | 'skip_timer' | 'show_answer'
  readonly reviewedAt: string
}

export type WarmupGraphPoint = {
  readonly id: string
  readonly visitId: string
  readonly childId: string
  readonly localDate: string
  readonly grade: string
  readonly activityModule: MasteryActivityModule
  readonly visitType: WarmupVisitType
  readonly configuredMaximum: number
  readonly assignedQueueSize: number
  readonly attemptedCount: number
  readonly correctCount: number
  readonly percent: number
  readonly status: 'partial' | 'completed'
  readonly updatedAt: string
}

export type WarmupTransitionOperation = 'answer' | 'mark-unavailable' | 'finalize-partial' | 'skip'

export type WarmupTransitionReceipt = {
  readonly visitId: string
  readonly transitionId: string
  readonly payloadFingerprint: string
  readonly operation: WarmupTransitionOperation
  readonly queueEntryId?: string
  readonly expectedVisitRevision: number
  readonly appliedVisitRevision: number
  readonly expectedMasteryRevision?: number
  readonly appliedMasteryRevision?: number
  readonly masteryStateId?: string
  readonly attemptId?: string
  readonly graphPointId?: string
  readonly appliedAt: string
}

export type WarmupTransition = {
  readonly contractId: typeof WARMUP_VISIT_CONTRACT_ID
  readonly visitId: string
  readonly transitionId: string
  readonly payloadFingerprint: string
  readonly operation: WarmupTransitionOperation
  readonly queueEntryId?: string
  readonly expectedVisitRevision: number
  readonly nextVisitRevision: number
  readonly expectedMasteryRevision?: number
  readonly nextMasteryRevision?: number
  readonly occurredAt: string
  readonly correct?: boolean
  readonly revealMethod?: WarmupAttempt['revealMethod']
  readonly nextVisit: WarmupVisit
  readonly nextMastery?: VersionedChildMasteryState
  readonly attempt?: WarmupAttempt
  readonly graphPoint?: WarmupGraphPoint
}

export type WarmupTransitionApplyResult =
  | {
      readonly status: 'applied'
      readonly visit: WarmupVisit
      readonly mastery?: VersionedChildMasteryState
      readonly receipt: WarmupTransitionReceipt
      readonly attempt?: WarmupAttempt
      readonly graphPoint?: WarmupGraphPoint
    }
  | { readonly status: 'idempotent'; readonly visit: WarmupVisit }
  | { readonly status: 'conflict'; readonly reason: string; readonly visit: WarmupVisit }
