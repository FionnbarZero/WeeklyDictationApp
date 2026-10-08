/** A new, atomic workspace record keeps older clients from normalizing newer
 * datasets or replaying their journals. Legacy keys remain a recovery copy. */
import { isAppState, type AppState } from '../domain.ts'
import { partitionWorkspaceState, WORKSPACE_STATE_FIELDS } from './workspacePartition.ts'

type Store = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem'>
type Workspace = { schema: 1; childId: string; records: Record<string, string> }
const stateKey = 'weekly-dictation-state-v2'
const historyKey = 'weekly-dictation-history-v1'
const checkpointKey = 'weekly-dictation-checkpoint-v1'
export const MAX_WORKSPACE_RECORDS = 500
export const practiceWorkspaceKey = (childId: string) => `family-beta-activity:${childId}:lesson-workspace-v1`
export const legacyPracticeKey = (key: string, childId: string) =>
  key.startsWith(`family-beta-activity:${childId}:weekly-dictation-`)
const failure =
  'Saved practice could not be safely opened. Both old and new records are preserved. Please report this problem.'

type PartitionRecord = { schema: 1; childId: string; values: Record<string, unknown> }
const partitionKeys = new Set([historyKey, checkpointKey])

function exposedRecordKeys(records: Record<string, string>) {
  const keys = Object.keys(records).filter((key) => !partitionKeys.has(key))
  if (records[historyKey] !== undefined && records[checkpointKey] !== undefined && !keys.includes(stateKey))
    keys.push(stateKey)
  return keys
}

function partitionRecord(raw: string, childId: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw) as PartitionRecord
    if (
      !value ||
      value.schema !== 1 ||
      value.childId !== childId ||
      !value.values ||
      typeof value.values !== 'object' ||
      Array.isArray(value.values)
    )
      throw new Error(failure)
    return value.values
  } catch {
    throw new Error(failure)
  }
}

function stateFromRecords(records: Record<string, string>, childId: string) {
  const history = records[historyKey]
  const checkpoint = records[checkpointKey]
  if ((history === undefined) !== (checkpoint === undefined)) throw new Error(failure)
  if (history !== undefined && checkpoint !== undefined) {
    const values = { ...partitionRecord(history, childId), ...partitionRecord(checkpoint, childId) }
    const merged = Object.fromEntries(
      WORKSPACE_STATE_FIELDS.filter((field) => field in values).map((field) => [field, values[field]]),
    )
    if (!isAppState(merged)) throw new Error(failure)
    return JSON.stringify(merged)
  }
  return records[stateKey] ?? null
}

function stateRecords(records: Record<string, string>, childId: string, raw: string) {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = null
  }
  if (!isAppState(parsed)) {
    if (records[historyKey] !== undefined || records[checkpointKey] !== undefined) throw new Error(failure)
    return { ...records, [stateKey]: raw }
  }
  const partition = partitionWorkspaceState(parsed as AppState)
  const next = { ...records }
  delete next[stateKey]
  next[historyKey] = JSON.stringify({
    schema: 1,
    childId,
    values: { ...partition.metadata, ...partition.history },
  } satisfies PartitionRecord)
  next[checkpointKey] = JSON.stringify({
    schema: 1,
    childId,
    values: { ...partition.metadata, ...partition.checkpoint },
  } satisfies PartitionRecord)
  return next
}

function parse(raw: string, childId: string): Workspace {
  const value = JSON.parse(raw) as Workspace
  if (
    !value ||
    value.schema !== 1 ||
    value.childId !== childId ||
    !value.records ||
    typeof value.records !== 'object' ||
    Array.isArray(value.records) ||
    exposedRecordKeys(value.records).length > MAX_WORKSPACE_RECORDS ||
    Object.entries(value.records).some(
      ([key, item]) => !key.startsWith('weekly-dictation-') || typeof item !== 'string',
    )
  )
    throw new Error(failure)
  return value
}

/** Read-only lookup: never initialize/migrate while listing saved lessons. */
export function readPracticeWorkspaceState(storage: Pick<Storage, 'getItem'>, childId: string) {
  const raw = storage.getItem(practiceWorkspaceKey(childId))
  return raw === null
    ? storage.getItem(`family-beta-activity:${childId}:${stateKey}`)
    : stateFromRecords(parse(raw, childId).records, childId)
}

export function practiceWorkspaceStorage(storage: Store, childId: string): Storage {
  if (!/^[\w-]{1,160}$/.test(childId)) throw new Error(failure)
  const key = practiceWorkspaceKey(childId)
  const legacyPrefix = `family-beta-activity:${childId}:`
  const write = (value: Workspace, expected: string | null) => {
    if (storage.getItem(key) !== expected) throw new Error(failure)
    if (exposedRecordKeys(value.records).length > MAX_WORKSPACE_RECORDS)
      throw new Error(
        'Saved practice contains too many records for safe syncing. Existing device records are preserved.',
      )
    const raw = JSON.stringify(value)
    if (new TextEncoder().encode(raw).byteLength > 700_000)
      throw new Error('Saved practice exceeds its safe syncing limit. Keep this page and the original device records.')
    storage.setItem(key, raw)
    if (storage.getItem(key) !== raw) throw new Error(failure)
  }
  if (storage.getItem(key) === null) {
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i))
      .filter((name): name is string => !!name && legacyPracticeKey(name, childId))
      .sort()
    if (keys.length > MAX_WORKSPACE_RECORDS)
      throw new Error(
        'Saved practice contains too many records for safe syncing. Existing device records are preserved.',
      )
    const records: Record<string, string> = {}
    for (const name of keys) {
      const value = storage.getItem(name)
      if (value !== null) records[name.slice(legacyPrefix.length)] = value
    }
    // One write contains state AND pending journals. No partial copy is usable,
    // and neither successful migration nor retry deletes or rewrites legacy data.
    write({ schema: 1, childId, records }, null)
  }
  const read = () => {
    const raw = storage.getItem(key)
    if (raw === null) throw new Error(failure)
    return { raw, value: parse(raw, childId) }
  }
  read()
  return {
    get length() {
      return exposedRecordKeys(read().value.records).length
    },
    key: (index) => exposedRecordKeys(read().value.records)[index] ?? null,
    getItem: (name) => {
      if (partitionKeys.has(name)) return null
      return name === stateKey ? stateFromRecords(read().value.records, childId) : (read().value.records[name] ?? null)
    },
    setItem: (name, item) => {
      if (!name.startsWith('weekly-dictation-') || partitionKeys.has(name)) throw new Error(failure)
      const { raw, value } = read()
      const records =
        name === stateKey ? stateRecords(value.records, childId, item) : { ...value.records, [name]: item }
      write({ ...value, records }, raw)
    },
    removeItem: (name) => {
      if (partitionKeys.has(name)) throw new Error(failure)
      const { raw, value } = read()
      const records = { ...value.records }
      if (name === stateKey) {
        delete records[stateKey]
        delete records[historyKey]
        delete records[checkpointKey]
      } else delete records[name]
      write({ ...value, records }, raw)
    },
    clear: () => {
      throw new Error('Whole-workspace clearing is not supported. Use the reviewed restore workflow.')
    },
  }
}
