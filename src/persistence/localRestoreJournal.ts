import { APP_STATE_KEY } from '../domain.ts'
import { ACQUISITION_PENDING_JOURNAL_KEY } from './acquisitionPendingJournal.ts'
import { WARMUP_PENDING_JOURNAL_KEY } from './warmup/pendingJournal.ts'

export const LOCAL_RESTORE_JOURNAL_KEY = 'weekly-dictation-restore-journal-v1'

export const LOCAL_RESTORE_TARGET_KEYS = [
  APP_STATE_KEY,
  ACQUISITION_PENDING_JOURNAL_KEY,
  WARMUP_PENDING_JOURNAL_KEY,
] as const

type RestoreTargetKey = (typeof LOCAL_RESTORE_TARGET_KEYS)[number]
type RestoreValues = Record<RestoreTargetKey, string | null>

export type LocalRestoreStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

type LocalRestoreJournal = {
  schema: typeof LOCAL_RESTORE_JOURNAL_KEY
  transactionId: string
  backupChecksum: string
  childId: string
  origin: string
  createdAt: string
  stage: 'prepared' | RestoreTargetKey
  before: RestoreValues
  after: RestoreValues
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validValues(value: unknown): value is RestoreValues {
  return (
    record(value) && LOCAL_RESTORE_TARGET_KEYS.every((key) => value[key] === null || typeof value[key] === 'string')
  )
}

function parseJournal(raw: string): LocalRestoreJournal | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (
      !record(value) ||
      value.schema !== LOCAL_RESTORE_JOURNAL_KEY ||
      typeof value.transactionId !== 'string' ||
      typeof value.backupChecksum !== 'string' ||
      typeof value.childId !== 'string' ||
      typeof value.origin !== 'string' ||
      typeof value.createdAt !== 'string' ||
      !['prepared', ...LOCAL_RESTORE_TARGET_KEYS].includes(String(value.stage)) ||
      !validValues(value.before) ||
      !validValues(value.after)
    )
      return null
    return value as LocalRestoreJournal
  } catch {
    return null
  }
}

function readValues(storage: LocalRestoreStorage): RestoreValues {
  return Object.fromEntries(LOCAL_RESTORE_TARGET_KEYS.map((key) => [key, storage.getItem(key)])) as RestoreValues
}

function writeValue(storage: LocalRestoreStorage, key: RestoreTargetKey, value: string | null) {
  if (value === null) storage.removeItem(key)
  else storage.setItem(key, value)
}

function valuesMatch(left: RestoreValues, right: RestoreValues) {
  return LOCAL_RESTORE_TARGET_KEYS.every((key) => left[key] === right[key])
}

function writeAll(storage: LocalRestoreStorage, values: RestoreValues) {
  for (const key of LOCAL_RESTORE_TARGET_KEYS) writeValue(storage, key, values[key])
  if (!valuesMatch(readValues(storage), values))
    throw new Error('Browser storage did not retain the complete restore snapshot.')
}

function saveJournal(storage: LocalRestoreStorage, journal: LocalRestoreJournal) {
  storage.setItem(LOCAL_RESTORE_JOURNAL_KEY, JSON.stringify(journal))
}

export function recoverInterruptedLocalRestore(storage: LocalRestoreStorage): 'none' | 'replayed' {
  const raw = storage.getItem(LOCAL_RESTORE_JOURNAL_KEY)
  if (!raw) return 'none'
  const journal = parseJournal(raw)
  if (!journal) throw new Error('A malformed restore journal was preserved. Browser data was not changed.')
  const current = readValues(storage)
  const known = LOCAL_RESTORE_TARGET_KEYS.every(
    (key) => current[key] === journal.before[key] || current[key] === journal.after[key],
  )
  if (known) {
    writeAll(storage, journal.after)
    storage.removeItem(LOCAL_RESTORE_JOURNAL_KEY)
    return 'replayed'
  }
  throw new Error('Restore recovery found unexpected browser changes. The journal and browser data were preserved.')
}

export function applyLocalRestoreTransaction(input: {
  storage: LocalRestoreStorage
  after: RestoreValues
  transactionId: string
  backupChecksum: string
  childId: string
  origin: string
  createdAt: string
}): 'applied' | 'idempotent' {
  recoverInterruptedLocalRestore(input.storage)
  const before = readValues(input.storage)
  if (valuesMatch(before, input.after)) return 'idempotent'
  const journal: LocalRestoreJournal = {
    schema: LOCAL_RESTORE_JOURNAL_KEY,
    transactionId: input.transactionId,
    backupChecksum: input.backupChecksum,
    childId: input.childId,
    origin: input.origin,
    createdAt: input.createdAt,
    stage: 'prepared',
    before,
    after: input.after,
  }
  saveJournal(input.storage, journal)
  try {
    for (const key of LOCAL_RESTORE_TARGET_KEYS) {
      writeValue(input.storage, key, input.after[key])
      journal.stage = key
      saveJournal(input.storage, journal)
    }
    if (!valuesMatch(readValues(input.storage), input.after))
      throw new Error('The restored browser data did not verify after writing.')
    input.storage.removeItem(LOCAL_RESTORE_JOURNAL_KEY)
    return 'applied'
  } catch (error) {
    try {
      writeAll(input.storage, before)
      input.storage.removeItem(LOCAL_RESTORE_JOURNAL_KEY)
    } catch {
      throw new Error(
        'Restore was interrupted and automatic rollback could not finish. Keep this browser open for recovery.',
      )
    }
    throw new Error(
      `Restore stopped and the previous browser data was restored. ${error instanceof Error ? error.message : ''}`.trim(),
    )
  }
}

export function localRestoreValues(input: {
  state: unknown
  pendingAcquisition: readonly unknown[]
  pendingWarmup: readonly unknown[]
}): RestoreValues {
  return {
    [APP_STATE_KEY]: JSON.stringify(input.state),
    [ACQUISITION_PENDING_JOURNAL_KEY]: JSON.stringify({ version: 1, entries: input.pendingAcquisition }),
    [WARMUP_PENDING_JOURNAL_KEY]: JSON.stringify({ version: 1, entries: input.pendingWarmup }),
  }
}
