import type {
  AcquisitionProgressRecord,
  AppState,
  Dataset,
  DatasetLifecycleResolution,
  DatasetScore,
  DistractorTargetObservation,
  Word,
} from '../../domain.ts'
import type { AcquisitionCheckpoint, AcquisitionProgressEnvelope } from '../../acquisition/persistence/contracts.ts'
import type { PendingAcquisitionCommit, PendingJournalReadResult } from '../../persistence/acquisitionPendingJournal.ts'
import type {
  CloudWarmupQueueEntry,
  CloudWarmupRotation,
  CloudWarmupVisit,
} from '../../persistence/warmup/cloudContracts.ts'
import type { PendingWarmupCommit, PendingWarmupJournalReadResult } from '../../persistence/warmup/pendingJournal.ts'
import type {
  ChildProfile,
  CloudAdaptiveState,
  CloudAttempt,
  CloudSession,
  FamilyRecord,
} from '../../persistence/cloudRecords.ts'
import type {
  VersionedChildMasteryState,
  WarmupAttempt,
  WarmupGraphPoint,
  WarmupTransition,
  WarmupTransitionReceipt,
  WarmupVisit,
} from '../../warmup/visits/contracts.ts'
import type { Tier2ReadingProgressRecord } from '../../readingPractice/contracts.ts'

export type ChildWorkspaceScope = {
  familyId: string
  childId: string
  grade: string
  schoolYear: string
}

export type ChildWorkspaceRecords = {
  datasets: Dataset[]
  sessions: CloudSession[]
  attempts: CloudAttempt[]
  scores: DatasetScore[]
  adaptiveState: CloudAdaptiveState | null
  acquisitionProgressions: Array<AcquisitionProgressRecord | AcquisitionProgressEnvelope<Word>>
  distractorTargetObservations: DistractorTargetObservation[]
  readingProgress: Tier2ReadingProgressRecord[]
  warmup: {
    visits: CloudWarmupVisit[]
    queueEntries: CloudWarmupQueueEntry[]
    mastery: VersionedChildMasteryState[]
    receipts: WarmupTransitionReceipt[]
    attempts: WarmupAttempt[]
    graphPoints: WarmupGraphPoint[]
    rotations: CloudWarmupRotation[]
  }
}

export type ChildWorkspaceReadPort = {
  listDatasets: (signal: AbortSignal) => Promise<Dataset[]>
  listDatasetWords: (signal: AbortSignal) => Promise<Word[]>
  listSessions: (scope: ChildWorkspaceScope, signal: AbortSignal) => Promise<CloudSession[]>
  listAttempts: (scope: ChildWorkspaceScope, signal: AbortSignal) => Promise<CloudAttempt[]>
  listScores: (scope: ChildWorkspaceScope, signal: AbortSignal) => Promise<DatasetScore[]>
  readAdaptiveState: (scope: ChildWorkspaceScope, signal: AbortSignal) => Promise<CloudAdaptiveState | null>
  listAcquisitionProgressions: (
    scope: ChildWorkspaceScope,
    signal: AbortSignal,
  ) => Promise<Array<AcquisitionProgressRecord | AcquisitionProgressEnvelope<Word>>>
  listDistractorTargetObservations: (
    scope: ChildWorkspaceScope,
    signal: AbortSignal,
  ) => Promise<DistractorTargetObservation[]>
  listTier2ReadingProgress: (scope: ChildWorkspaceScope, signal: AbortSignal) => Promise<Tier2ReadingProgressRecord[]>
  listWarmupVisits: (scope: ChildWorkspaceScope, signal: AbortSignal) => Promise<CloudWarmupVisit[]>
  listWarmupQueueEntries: (scope: ChildWorkspaceScope, signal: AbortSignal) => Promise<CloudWarmupQueueEntry[]>
  listWarmupMastery: (scope: ChildWorkspaceScope, signal: AbortSignal) => Promise<VersionedChildMasteryState[]>
  listWarmupReceipts: (scope: ChildWorkspaceScope, signal: AbortSignal) => Promise<WarmupTransitionReceipt[]>
  listWarmupAttempts: (scope: ChildWorkspaceScope, signal: AbortSignal) => Promise<WarmupAttempt[]>
  listWarmupGraphPoints: (scope: ChildWorkspaceScope, signal: AbortSignal) => Promise<WarmupGraphPoint[]>
  listWarmupRotations: (scope: ChildWorkspaceScope, signal: AbortSignal) => Promise<CloudWarmupRotation[]>
}

export type ChildWorkspaceAssemblyPort = {
  assembleCloudState: (records: ChildWorkspaceRecords, scope: ChildWorkspaceScope) => AppState
}

export type OpenSessionReconciliationPort = {
  markAcquisitionPartial: (scope: ChildWorkspaceScope, session: CloudSession) => Promise<void>
  abandonTestReview: (scope: ChildWorkspaceScope, session: CloudSession) => Promise<void>
}

export type PendingTransitionRecoveryPort = {
  readPendingAcquisition: () => PendingJournalReadResult
  acquisitionAlreadyCommitted: (scope: ChildWorkspaceScope, checkpoint: AcquisitionCheckpoint<Word>) => Promise<boolean>
  commitAcquisitionCheckpoint: (
    scope: ChildWorkspaceScope,
    envelope: AcquisitionProgressEnvelope<Word>,
    checkpoint: AcquisitionCheckpoint<Word>,
  ) => Promise<'applied' | 'idempotent'>
  acknowledgeAcquisition: (transitionId: string) => void
  readPendingWarmup: () => PendingWarmupJournalReadResult
  warmupTransitionAlreadyCommitted: (scope: ChildWorkspaceScope, transition: WarmupTransition) => Promise<boolean>
  ensureWarmupSeed: (
    scope: ChildWorkspaceScope,
    visit: WarmupVisit,
    mastery: readonly VersionedChildMasteryState[],
    rotations: readonly CloudWarmupRotation[],
  ) => Promise<void>
  commitWarmupTransition: (
    scope: ChildWorkspaceScope,
    transition: WarmupTransition,
  ) => Promise<'applied' | 'idempotent'>
  acknowledgeWarmup: (transitionId: string) => void
  resolveLifecycle: (
    scope: ChildWorkspaceScope,
    datasets: readonly Dataset[],
    at: Date,
  ) => DatasetLifecycleResolution | null
}

export type ChildWorkspaceCapabilities = {
  reads: ChildWorkspaceReadPort
  assembly: ChildWorkspaceAssemblyPort
  reconciliation: OpenSessionReconciliationPort
  recovery: PendingTransitionRecoveryPort
}

export type FamilyWorkspace<TUser> = {
  family: FamilyRecord
  children: Array<ChildProfile & { name: string; color: string; initials: string }>
}

export type FamilyWorkspacePort<TUser> = {
  ensureFamily: (user: TUser) => Promise<FamilyRecord>
  listChildren: (familyId: string) => Promise<ChildProfile[]>
}

export type LocalWorkspacePort = {
  readApplicationState: () => string | null
  readLegacyAttempts: () => string | null
  writeApplicationState: (state: AppState) => boolean
  readPendingAcquisition: () => PendingJournalReadResult
  acknowledgeAcquisition: (transitionId: string) => void
  readPendingWarmup: () => PendingWarmupJournalReadResult
  acknowledgeWarmup: (transitionId: string) => void
}

export type PendingTransitionEntries = {
  acquisition: readonly PendingAcquisitionCommit[]
  warmup: readonly PendingWarmupCommit[]
}
