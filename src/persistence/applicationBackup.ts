import { isAppState, type AppState } from '../domain.ts'
import {
  ACQUISITION_PENDING_JOURNAL_KEY,
  readPendingAcquisitionJournal,
  type PendingAcquisitionCommit,
} from './acquisitionPendingJournal.ts'

export const APPLICATION_BACKUP_SCHEMA = 'weekly-dictation-backup-v1' as const

export type ApplicationBackup = {
  schema: typeof APPLICATION_BACKUP_SCHEMA
  createdAt: string
  state: AppState
  pendingAcquisition: PendingAcquisitionCommit[]
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value
}

export function createApplicationBackup(
  state: AppState,
  pendingAcquisition: readonly PendingAcquisitionCommit[],
  createdAt = new Date().toISOString(),
) {
  if (!isCanonicalIsoTimestamp(createdAt)) throw new Error('Backup timestamp must be canonical ISO time.')
  const backup: ApplicationBackup = {
    schema: APPLICATION_BACKUP_SCHEMA,
    createdAt,
    state,
    pendingAcquisition: [...pendingAcquisition],
  }
  return JSON.stringify(backup, null, 2)
}

export function restoreApplicationBackup(raw: string): ApplicationBackup {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('The application backup is not valid JSON.')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The application backup must be an object.')
  const record = parsed as Record<string, unknown>
  if (record.schema !== APPLICATION_BACKUP_SCHEMA || !isCanonicalIsoTimestamp(record.createdAt) || !isAppState(record.state) || !Array.isArray(record.pendingAcquisition)) throw new Error('The application backup has an unsupported or malformed structure.')

  // Reuse the production journal validator without writing to browser storage.
  const pendingRaw = JSON.stringify({ version: 1, entries: record.pendingAcquisition })
  const pending = readPendingAcquisitionJournal({
    getItem(key: string) { return key === ACQUISITION_PENDING_JOURNAL_KEY ? pendingRaw : null },
  })
  if (pending.error) throw new Error(pending.error)
  return {
    schema: APPLICATION_BACKUP_SCHEMA,
    createdAt: record.createdAt,
    state: record.state,
    pendingAcquisition: pending.entries,
  }
}
