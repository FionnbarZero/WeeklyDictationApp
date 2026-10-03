import { isAppState, type AppState } from '../domain.ts'
import {
  ACQUISITION_PENDING_JOURNAL_KEY,
  readPendingAcquisitionJournal,
  type PendingAcquisitionCommit,
} from './acquisitionPendingJournal.ts'
import {
  readPendingWarmupJournal,
  WARMUP_PENDING_JOURNAL_KEY,
  type PendingWarmupCommit,
} from './warmup/pendingJournal.ts'

export const APPLICATION_BACKUP_SCHEMA = 'weekly-dictation-backup-v1' as const
export const VERIFIED_APPLICATION_BACKUP_SCHEMA = 'weekly-dictation-verified-backup-v1' as const

export type ApplicationBackup = {
  schema: typeof APPLICATION_BACKUP_SCHEMA
  createdAt: string
  state: AppState
  pendingAcquisition: PendingAcquisitionCommit[]
  pendingWarmup: PendingWarmupCommit[]
}

export type VerifiedApplicationBackupScope = {
  mode: 'local-browser'
  grade: 'Grade 2'
  dataScope: 'whole-local-practice-state'
  selectedChildId: string
  origin: string
}

export type VerifiedApplicationBackupPreviewContext = Pick<
  VerifiedApplicationBackupScope,
  'mode' | 'grade' | 'selectedChildId' | 'origin'
>

export type VerifiedApplicationBackupPayload = {
  applicationVersion: string
  scope: VerifiedApplicationBackupScope
  backup: ApplicationBackup
}

export type VerifiedApplicationBackupFile = {
  schema: typeof VERIFIED_APPLICATION_BACKUP_SCHEMA
  checksum: {
    algorithm: 'SHA-256'
    value: string
  }
  payload: VerifiedApplicationBackupPayload
}

export type ApplicationBackupPreview = {
  checksum: string
  payload: VerifiedApplicationBackupPayload
  summary: {
    createdAt: string
    applicationVersion: string
    stateVersion: number
    datasetCount: number
    resultCount: number
    scoreCount: number
    completedSessionCount: number
    acquisitionProgressCount: number
    warmupVisitCount: number
    pendingAcquisitionCount: number
    pendingWarmupCount: number
  }
  plannedStorageKeys: readonly [
    'weekly-dictation-state-v2',
    typeof ACQUISITION_PENDING_JOURNAL_KEY,
    typeof WARMUP_PENDING_JOURNAL_KEY,
  ]
}

export type BackupDigest = (value: string) => Promise<string>

function isCanonicalIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value
}

export function createApplicationBackup(
  state: AppState,
  pendingAcquisition: readonly PendingAcquisitionCommit[],
  pendingWarmupOrCreatedAt: readonly PendingWarmupCommit[] | string = [],
  explicitCreatedAt = new Date().toISOString(),
) {
  const pendingWarmup = typeof pendingWarmupOrCreatedAt === 'string' ? [] : pendingWarmupOrCreatedAt
  const createdAt = typeof pendingWarmupOrCreatedAt === 'string' ? pendingWarmupOrCreatedAt : explicitCreatedAt
  if (!isCanonicalIsoTimestamp(createdAt)) throw new Error('Backup timestamp must be canonical ISO time.')
  const backup: ApplicationBackup = {
    schema: APPLICATION_BACKUP_SCHEMA,
    createdAt,
    state,
    pendingAcquisition: [...pendingAcquisition],
    pendingWarmup: [...pendingWarmup],
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
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('The application backup must be an object.')
  const record = parsed as Record<string, unknown>
  if (
    record.schema !== APPLICATION_BACKUP_SCHEMA ||
    !isCanonicalIsoTimestamp(record.createdAt) ||
    !isAppState(record.state) ||
    !Array.isArray(record.pendingAcquisition) ||
    !Array.isArray(record.pendingWarmup || [])
  )
    throw new Error('The application backup has an unsupported or malformed structure.')

  // Reuse the production journal validator without writing to browser storage.
  const pendingRaw = JSON.stringify({ version: 1, entries: record.pendingAcquisition })
  const pending = readPendingAcquisitionJournal({
    getItem(key: string) {
      return key === ACQUISITION_PENDING_JOURNAL_KEY ? pendingRaw : null
    },
  })
  if (pending.error) throw new Error(pending.error)
  const warmupRaw = JSON.stringify({ version: 1, entries: record.pendingWarmup || [] })
  const pendingWarmup = readPendingWarmupJournal({
    getItem(key: string) {
      return key === WARMUP_PENDING_JOURNAL_KEY ? warmupRaw : null
    },
  })
  if (pendingWarmup.error) throw new Error(pendingWarmup.error)
  return {
    schema: APPLICATION_BACKUP_SCHEMA,
    createdAt: record.createdAt,
    state: record.state,
    pendingAcquisition: pending.entries,
    pendingWarmup: pendingWarmup.entries,
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('The backup contains a non-finite number.')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item === undefined ? null : item)).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const fields = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    return `{${fields.join(',')}}`
  }
  throw new Error('The backup contains a value that cannot be serialized as JSON.')
}

export async function sha256Hex(value: string) {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 backup verification is unavailable in this browser.')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function validBackupScope(value: unknown): value is VerifiedApplicationBackupScope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const scope = value as Record<string, unknown>
  if (scope.mode !== 'local-browser' || scope.grade !== 'Grade 2' || scope.dataScope !== 'whole-local-practice-state')
    return false
  if (typeof scope.selectedChildId !== 'string' || !scope.selectedChildId.trim()) return false
  if (typeof scope.origin !== 'string') return false
  try {
    return new URL(scope.origin).origin === scope.origin
  } catch {
    return false
  }
}

function verifiedBackupFile(value: unknown): value is VerifiedApplicationBackupFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const file = value as Record<string, unknown>
  if (
    file.schema !== VERIFIED_APPLICATION_BACKUP_SCHEMA ||
    !file.checksum ||
    typeof file.checksum !== 'object' ||
    Array.isArray(file.checksum)
  )
    return false
  const checksum = file.checksum as Record<string, unknown>
  if (checksum.algorithm !== 'SHA-256' || typeof checksum.value !== 'string' || !/^[a-f0-9]{64}$/.test(checksum.value))
    return false
  if (!file.payload || typeof file.payload !== 'object' || Array.isArray(file.payload)) return false
  const payload = file.payload as Record<string, unknown>
  return (
    typeof payload.applicationVersion === 'string' &&
    Boolean(payload.applicationVersion.trim()) &&
    validBackupScope(payload.scope) &&
    Boolean(payload.backup) &&
    typeof payload.backup === 'object' &&
    !Array.isArray(payload.backup)
  )
}

export async function createVerifiedApplicationBackup(
  input: {
    state: AppState
    pendingAcquisition: readonly PendingAcquisitionCommit[]
    pendingWarmup: readonly PendingWarmupCommit[]
    createdAt: string
    applicationVersion: string
    scope: VerifiedApplicationBackupScope
  },
  digest: BackupDigest = sha256Hex,
) {
  if (!input.applicationVersion.trim()) throw new Error('The application version is required for a verified backup.')
  if (!validBackupScope(input.scope)) throw new Error('The verified backup scope is invalid.')
  const backup = restoreApplicationBackup(
    createApplicationBackup(input.state, input.pendingAcquisition, input.pendingWarmup, input.createdAt),
  )
  const payload: VerifiedApplicationBackupPayload = {
    applicationVersion: input.applicationVersion,
    scope: input.scope,
    backup,
  }
  const checksum = await digest(canonicalJson(payload))
  if (!/^[a-f0-9]{64}$/.test(checksum))
    throw new Error('The backup checksum generator returned an invalid SHA-256 value.')
  const file: VerifiedApplicationBackupFile = {
    schema: VERIFIED_APPLICATION_BACKUP_SCHEMA,
    checksum: { algorithm: 'SHA-256', value: checksum },
    payload,
  }
  return {
    file,
    checksum,
    serialized: JSON.stringify(file, null, 2),
  }
}

export async function previewVerifiedApplicationBackup(
  raw: string,
  options: {
    expectedScope?: VerifiedApplicationBackupPreviewContext
    digest?: BackupDigest
  } = {},
): Promise<ApplicationBackupPreview> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('The verified backup is not valid JSON.')
  }
  if (!verifiedBackupFile(parsed)) throw new Error('The file is not a supported checksum-verified Grade 2 backup.')
  const expectedChecksum = await (options.digest || sha256Hex)(canonicalJson(parsed.payload))
  if (expectedChecksum !== parsed.checksum.value)
    throw new Error('The backup checksum does not match. The file may be incomplete or changed.')

  const backup = restoreApplicationBackup(JSON.stringify(parsed.payload.backup))
  const payload: VerifiedApplicationBackupPayload = { ...parsed.payload, backup }
  if (options.expectedScope) {
    if (payload.scope.origin !== options.expectedScope.origin) {
      throw new Error('This backup belongs to a different browser origin and cannot be previewed here.')
    }
    if (payload.scope.selectedChildId !== options.expectedScope.selectedChildId) {
      throw new Error('This backup was created with a different Grade 2 profile selected.')
    }
    if (payload.scope.mode !== options.expectedScope.mode || payload.scope.grade !== options.expectedScope.grade) {
      throw new Error('This backup does not match the current Grade 2 browser mode.')
    }
  }
  return {
    checksum: parsed.checksum.value,
    payload,
    summary: {
      createdAt: backup.createdAt,
      applicationVersion: payload.applicationVersion,
      stateVersion: backup.state.version,
      datasetCount: backup.state.datasets.length,
      resultCount: backup.state.results.length,
      scoreCount: backup.state.scores.length,
      completedSessionCount: backup.state.completedSessions.length,
      acquisitionProgressCount: (backup.state.acquisitionProgressEnvelopes || []).length,
      warmupVisitCount: (backup.state.warmupVisitsV1 || []).length,
      pendingAcquisitionCount: backup.pendingAcquisition.length,
      pendingWarmupCount: backup.pendingWarmup.length,
    },
    plannedStorageKeys: ['weekly-dictation-state-v2', ACQUISITION_PENDING_JOURNAL_KEY, WARMUP_PENDING_JOURNAL_KEY],
  }
}
