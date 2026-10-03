import type { AppState } from '../../domain.ts'
import {
  createVerifiedApplicationBackup,
  previewVerifiedApplicationBackup,
  type ApplicationBackupPreview,
  type VerifiedApplicationBackupScope,
} from '../../persistence/applicationBackup.ts'
import type { PendingJournalReadResult } from '../../persistence/acquisitionPendingJournal.ts'
import type { PendingWarmupJournalReadResult } from '../../persistence/warmup/pendingJournal.ts'

export type LocalBackupReadCapabilities = {
  readPendingAcquisition: () => PendingJournalReadResult
  readPendingWarmup: () => PendingWarmupJournalReadResult
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

export function previewLocalApplicationBackup(raw: string): Promise<ApplicationBackupPreview> {
  return previewVerifiedApplicationBackup(raw)
}
