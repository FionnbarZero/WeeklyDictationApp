import type { WarmupVisit, WarmupVisitQueueEntry } from '../../warmup/visits/contracts.ts'

export const CLOUD_WARMUP_QUEUE_ENTRY_CONTRACT_ID = 'adaptive-warmup-queue-entry-v1' as const

export type CloudWarmupVisit = Omit<WarmupVisit, 'queue'> & {
  readonly queueEntryIds: readonly string[]
}

export type CloudWarmupQueueEntry = WarmupVisitQueueEntry & {
  readonly schemaVersion: 1
  readonly contractId: typeof CLOUD_WARMUP_QUEUE_ENTRY_CONTRACT_ID
  readonly visitId: string
  readonly childId: string
  readonly lastAppliedTransitionId?: string
}

export type CloudWarmupDecodeIssue = {
  readonly collection: 'visits' | 'queue-entries'
  readonly recordId: string
  readonly reason: string
  readonly raw: unknown
}

export type CloudWarmupDecodeResult = {
  readonly visits: WarmupVisit[]
  readonly issues: CloudWarmupDecodeIssue[]
}

export type CloudWarmupRotation = {
  readonly version: 1
  readonly id: string
  readonly childId: string
  readonly activityModule: string
  readonly cycle: number
}

export type WarmupCloudCollection =
  | 'warmupVisits'
  | 'warmupQueueEntries'
  | 'warmupMastery'
  | 'warmupTransitions'
  | 'warmupAttempts'
  | 'warmupGraphPoints'
  | 'warmupRotations'

export type WarmupCloudRecordWrite = {
  readonly collection: WarmupCloudCollection
  readonly id: string
  readonly value: Record<string, unknown>
  readonly precondition: 'create' | 'update'
}
