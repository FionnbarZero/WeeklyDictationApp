import type { AppState } from '../../domain.ts'
import {
  createVerifiedApplicationBackup,
  previewVerifiedApplicationBackup,
  type ApplicationBackupPreview,
  type VerifiedApplicationBackupPreviewContext,
  type VerifiedApplicationBackupScope,
} from '../../persistence/applicationBackup.ts'
import type { PendingJournalReadResult } from '../../persistence/acquisitionPendingJournal.ts'
import type { PendingWarmupJournalReadResult } from '../../persistence/warmup/pendingJournal.ts'
import {
  planSelectedChildRestore,
  type SelectedChildRestoreReport,
  type SelectedChildRestoreSnapshot,
} from './selectedChildRestore.ts'

export type LocalBackupReadCapabilities = {
  readPendingAcquisition: () => PendingJournalReadResult
  readPendingWarmup: () => PendingWarmupJournalReadResult
}

export type LocalBackupRestoreCapabilities = LocalBackupReadCapabilities & {
  commitRestore: (input: {
    snapshot: SelectedChildRestoreSnapshot
    transactionId: string
    backupChecksum: string
    childId: string
    origin: string
    createdAt: string
  }) => 'applied' | 'idempotent'
}

export type LocalApplicationRestorePreview = ApplicationBackupPreview & {
  restore: SelectedChildRestoreReport
}

function backupFileName(createdAt: string) {
  return `weekly-dictation-grade2-backup-${createdAt.replace(/[:.]/g, '-')}.json`
}

export async function exportLocalApplicationBackup(input: {
  state: AppState
  createdAt: string
  applicationVersion: string
  scope: VerifiedApplicationBackupScope
  capabilities: LocalBackupReadCapabilities
}) {
  const acquisition = input.capabilities.readPendingAcquisition()
  if (acquisition.error)
    throw new Error(
      `Backup stopped because the Acquisition recovery journal is not safe to export. ${acquisition.error}`,
    )
  const warmup = input.capabilities.readPendingWarmup()
  if (warmup.error)
    throw new Error(`Backup stopped because the Warmup recovery journal is not safe to export. ${warmup.error}`)

  const artifact = await createVerifiedApplicationBackup({
    state: input.state,
    pendingAcquisition: acquisition.entries,
    pendingWarmup: warmup.entries,
    createdAt: input.createdAt,
    applicationVersion: input.applicationVersion,
    scope: input.scope,
  })
  return {
    ...artifact,
    fileName: backupFileName(input.createdAt),
  }
}

export function previewLocalApplicationBackup(
  raw: string,
  expectedScope: VerifiedApplicationBackupPreviewContext,
): Promise<ApplicationBackupPreview> {
  return previewVerifiedApplicationBackup(raw, { expectedScope })
}

function currentSnapshot(state: AppState, capabilities: LocalBackupReadCapabilities): SelectedChildRestoreSnapshot {
  const acquisition = capabilities.readPendingAcquisition()
  if (acquisition.error)
    throw new Error(`Restore stopped because the current Acquisition recovery journal is unsafe. ${acquisition.error}`)
  const warmup = capabilities.readPendingWarmup()
  if (warmup.error)
    throw new Error(`Restore stopped because the current Warmup recovery journal is unsafe. ${warmup.error}`)
  return { state, pendingAcquisition: acquisition.entries, pendingWarmup: warmup.entries }
}

export async function previewLocalApplicationRestore(input: {
  raw: string
  currentState: AppState
  expectedScope: VerifiedApplicationBackupPreviewContext
  capabilities: LocalBackupReadCapabilities
}): Promise<LocalApplicationRestorePreview> {
  const preview = await previewVerifiedApplicationBackup(input.raw, { expectedScope: input.expectedScope })
  const plan = planSelectedChildRestore({
    current: currentSnapshot(input.currentState, input.capabilities),
    backup: preview.payload.backup,
    childId: input.expectedScope.selectedChildId,
  })
  return { ...preview, restore: plan.report }
}

export async function applyLocalApplicationRestore(input: {
  raw: string
  previewChecksum: string
  currentState: AppState
  expectedScope: VerifiedApplicationBackupPreviewContext
  capabilities: LocalBackupRestoreCapabilities
  transactionId: string
  createdAt: string
}) {
  const preview = await previewVerifiedApplicationBackup(input.raw, { expectedScope: input.expectedScope })
  if (preview.checksum !== input.previewChecksum)
    throw new Error('The selected backup changed after preview. Select and verify it again.')
  const plan = planSelectedChildRestore({
    current: currentSnapshot(input.currentState, input.capabilities),
    backup: preview.payload.backup,
    childId: input.expectedScope.selectedChildId,
  })
  const status = input.capabilities.commitRestore({
    snapshot: plan.snapshot,
    transactionId: input.transactionId,
    backupChecksum: preview.checksum,
    childId: input.expectedScope.selectedChildId,
    origin: input.expectedScope.origin,
    createdAt: input.createdAt,
  })
  return { status, report: plan.report, state: plan.snapshot.state }
}
