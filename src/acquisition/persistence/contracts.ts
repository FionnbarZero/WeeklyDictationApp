import type {
  AcquisitionAssessment,
  AcquisitionResponse,
  AcquisitionStrategy,
  AcquisitionTarget,
  AcquisitionTargetSet,
  EngineAcquisitionFlow,
} from '../contracts.ts'

export const ACQUISITION_PROGRESS_SCHEMA_VERSION = 1 as const
export const ACQUISITION_PERSISTENCE_CONTRACT_ID = 'acquisition-persistence-v1' as const

export type AcquisitionExperienceId = 'writing' | 'stroke-order' | 'reading'

export type AcquisitionProgressIdentity = {
  readonly childId: string
  readonly datasetId: string
  readonly grade: string
  readonly schoolYear: string
  readonly activityModule: string
  readonly tier: 'tier-1' | 'tier-2' | 'tier-3'
  /** Legacy records omit this field and are interpreted as Writing. */
  readonly experienceId?: AcquisitionExperienceId
  /** One durable Acquisition attempt. Reopening an unfinished attempt retains this ID. */
  readonly visitId?: string
}

export type AcquisitionLifecycleStage =
  | { readonly kind: 'acquisition' }
  | { readonly kind: 'test-review'; readonly cycle: number }
export type AcquisitionProgressStatus = 'in-progress' | 'teaching-complete'

export type AcquisitionTransitionReceipt = {
  readonly progressionId: string
  readonly transitionId: string
  readonly payloadFingerprint: string
  readonly operation: AcquisitionCheckpoint['operation']
  readonly promptId: string
  readonly expectedRevision: number
  readonly appliedRevision: number
  readonly appliedAt: string
}

export type AcquisitionProgressEnvelope<TTarget extends AcquisitionTarget = AcquisitionTarget> = AcquisitionProgressIdentity & {
  readonly schemaVersion: typeof ACQUISITION_PROGRESS_SCHEMA_VERSION
  readonly contractId: typeof ACQUISITION_PERSISTENCE_CONTRACT_ID
  readonly id: string
  /** Informational snapshot only. Authoritative lifecycle comes from the current persistence context. */
  readonly lifecycleStageAtLastCheckpoint: AcquisitionLifecycleStage
  readonly applicationVersion: string
  readonly strategyId: string
  readonly strategyVersion: number
  readonly strategyFingerprint: string
  readonly targetSetFingerprint: string
  readonly targetOccurrenceIds: readonly string[]
  readonly revision: number
  readonly status: AcquisitionProgressStatus
  readonly flow: EngineAcquisitionFlow<TTarget>
  readonly lastAppliedTransition?: AcquisitionTransitionReceipt
  readonly createdAt: string
  readonly updatedAt: string
  readonly migratedFromProgressionId?: string
}

export type AcquisitionScoredAttemptFact = {
  readonly id: string
  readonly sessionId: string
  readonly promptId: string
  readonly targetOccurrenceId: string
  readonly kind: AcquisitionAssessment['kind']
  readonly correct: boolean
  readonly revealMethod: string
  readonly reviewedAt: string
}

export type AcquisitionDtObservationFact = {
  readonly id: string
  readonly sessionId: string
  readonly promptId: string
  readonly targetOccurrenceId: string
  readonly text: string
  readonly poolType: 'familiar' | 'earned'
  readonly correct: boolean
  readonly revealMethod: string
  readonly reviewedAt: string
}

export type AcquisitionCheckpoint<TTarget extends AcquisitionTarget = AcquisitionTarget> = {
  readonly contractId: typeof ACQUISITION_PERSISTENCE_CONTRACT_ID
  readonly progressionId: string
  readonly transitionId: string
  readonly payloadFingerprint: string
  readonly operation: 'answer' | 'resume-dt-practice'
  readonly expectedRevision: number
  readonly nextRevision: number
  readonly sessionId: string
  readonly promptId: string
  readonly occurredAt: string
  readonly response?: AcquisitionResponse<string>
  readonly randomValues: readonly number[]
  readonly nextFlow: EngineAcquisitionFlow<TTarget>
  readonly assessment?: AcquisitionAssessment<TTarget, string>
  readonly scoredAttempt?: AcquisitionScoredAttemptFact
  readonly dtObservation?: AcquisitionDtObservationFact
}

export type AcquisitionPersistenceContext<TTarget extends AcquisitionTarget = AcquisitionTarget> = {
  readonly identity: AcquisitionProgressIdentity
  readonly lifecycleStage: AcquisitionLifecycleStage
  readonly applicationVersion: string
  readonly targetSet: AcquisitionTargetSet<TTarget>
  readonly strategy: AcquisitionStrategy<TTarget>
  readonly strategyUpgrades?: readonly AcquisitionStrategyUpgrade<TTarget>[]
}

export type AcquisitionStrategyUpgrade<TTarget extends AcquisitionTarget = AcquisitionTarget> = {
  readonly id: string
  readonly fromStrategyId: string
  readonly fromStrategyVersion: number
  readonly fromStrategyFingerprint: string
  readonly toStrategyId: string
  readonly toStrategyVersion: number
  readonly upgrade: (
    flow: EngineAcquisitionFlow<TTarget>,
    targetSet: AcquisitionTargetSet<TTarget>,
    strategy: AcquisitionStrategy<TTarget>,
  ) => EngineAcquisitionFlow<TTarget>
}

export type LegacyAcquisitionProgressRecord<TTarget extends AcquisitionTarget = AcquisitionTarget> = {
  readonly id: string
  readonly childId: string
  readonly datasetId: string
  readonly grade: string
  readonly flow: EngineAcquisitionFlow<TTarget>
  readonly updatedAt: string
}

export type AcquisitionProgressMigrationResult<TTarget extends AcquisitionTarget = AcquisitionTarget> =
  | { readonly status: 'migrated' | 'already-current'; readonly envelope: AcquisitionProgressEnvelope<TTarget> }
  | { readonly status: 'quarantined'; readonly reason: string; readonly raw: unknown }

export type AcquisitionProgressCollectionMigrationResult<TTarget extends AcquisitionTarget = AcquisitionTarget> = {
  readonly envelopes: readonly AcquisitionProgressEnvelope<TTarget>[]
  readonly quarantined: readonly { readonly index: number; readonly reason: string; readonly raw: unknown }[]
}

export type AcquisitionCheckpointApplyResult<TTarget extends AcquisitionTarget = AcquisitionTarget> =
  | { readonly status: 'applied'; readonly envelope: AcquisitionProgressEnvelope<TTarget> }
  | { readonly status: 'idempotent'; readonly envelope: AcquisitionProgressEnvelope<TTarget> }
  | { readonly status: 'conflict'; readonly reason: string; readonly envelope: AcquisitionProgressEnvelope<TTarget> }

export type AcquisitionRepositoryCommitResult<TTarget extends AcquisitionTarget = AcquisitionTarget> =
  | { readonly status: 'applied' | 'idempotent'; readonly envelope: AcquisitionProgressEnvelope<TTarget> }
  | { readonly status: 'conflict'; readonly reason: string; readonly current?: AcquisitionProgressEnvelope<TTarget> }

export interface AcquisitionProgressRepository<TTarget extends AcquisitionTarget = AcquisitionTarget> {
  load(progressionId: string): Promise<unknown | null>
  commit(checkpoint: AcquisitionCheckpoint<TTarget>): Promise<AcquisitionRepositoryCommitResult<TTarget>>
}
