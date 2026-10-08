/** A new, atomic workspace record keeps older clients from normalizing newer
 * datasets or replaying their journals. Legacy keys remain a recovery copy. */
import { type AppState, isAppState } from '../domain.ts'
import { partitionActivityCheckpoints } from './workspaceActivityPartition.ts'
import { partitionWorkspaceState, WORKSPACE_CHECKPOINT_FIELDS, WORKSPACE_STATE_FIELDS } from './workspacePartition.ts'

type Store = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem'>
type Workspace = { schema: 1; childId: string; records: Record<string, string> }
const stateKey = 'weekly-dictation-state-v2'
const historyKey = 'weekly-dictation-history-v1'
const checkpointKey = 'weekly-dictation-checkpoint-v1'
const activityKeyPrefix = `${checkpointKey}:activity:`
const syncRecordPrefix = 'record:'
export const MAX_WORKSPACE_RECORDS = 500
export const practiceWorkspaceKey = (childId: string) => `family-beta-activity:${childId}:lesson-workspace-v1`
export const legacyPracticeKey = (key: string, childId: string) =>
  key.startsWith(`family-beta-activity:${childId}:weekly-dictation-`)
const failure =
  'Saved practice could not be safely opened. Both old and new records are preserved. Please report this problem.'
const bounded = (value: unknown): boolean =>
  !value ||
  typeof value !== 'object' ||
  Object.values(value).every((item) => !Array.isArray(item) || item.length <= MAX_WORKSPACE_RECORDS)

type PartitionRecord = { schema: 1; childId: string; values: Record<string, unknown> }
const partitionKeys = new Set([historyKey, checkpointKey])
const activityFields = new Set([
  'acquisitionProgressions',
  'acquisitionProgressEnvelopes',
  'acquisitionTransitionReceipts',
  'acquisitionPendingCheckpoints',
])
const isActivityKey = (key: string) => key.startsWith(activityKeyPrefix)
const isInternalKey = (key: string) => partitionKeys.has(key) || isActivityKey(key)

export const practiceWorkspaceSyncKey = (childId: string, record: string) =>
  `${practiceWorkspaceKey(childId)}:${syncRecordPrefix}${encodeURIComponent(record)}`

export function isPracticeWorkspaceSyncKey(key: string, childId: string) {
  return key.startsWith(`${practiceWorkspaceKey(childId)}:${syncRecordPrefix}`)
}

function activityKey(activityId: string) {
  return `${activityKeyPrefix}${encodeURIComponent(activityId)}`
}

function activityId(key: string) {
  return decodeURIComponent(key.slice(activityKeyPrefix.length))
}

function activityRevision(raw: string | undefined) {
  if (!raw) return null
  try {
    const envelopes = (JSON.parse(raw) as { values?: { acquisitionProgressEnvelopes?: unknown } }).values
      ?.acquisitionProgressEnvelopes
    if (!Array.isArray(envelopes)) return null
    const revisions = envelopes
      .filter((item): item is { revision: number } => Boolean(item && typeof item === 'object' && Number.isInteger((item as { revision?: unknown }).revision)))
      .map((item) => item.revision)
    return revisions.length ? Math.max(...revisions) : null
  } catch {
    return null
  }
}

function exposedRecordKeys(records: Record<string, string>) {
  const keys = Object.keys(records).filter((key) => !isInternalKey(key))
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

function activityRecord(raw: string, childId: string, key: string) {
  try {
    const value = JSON.parse(raw) as PartitionRecord & { activityId?: unknown }
    if (value.activityId !== activityId(key)) throw new Error(failure)
    return partitionRecord(JSON.stringify(value), childId)
  } catch {
    throw new Error(failure)
  }
}

function stateFromRecords(records: Record<string, string>, childId: string) {
  const history = records[historyKey]
  const checkpoint = records[checkpointKey]
  const activityKeys = Object.keys(records).filter(isActivityKey).sort()
  if (
    (history === undefined) !== (checkpoint === undefined) ||
    (activityKeys.length > 0 && (history === undefined || checkpoint === undefined))
  )
    throw new Error(failure)
  if (history !== undefined && checkpoint !== undefined) {
    const values = { ...partitionRecord(history, childId), ...partitionRecord(checkpoint, childId) }
    const activities = activityKeys.map((key) => activityRecord(records[key], childId, key))
    for (const field of activityFields) {
      const legacy = values[field]
      if (activities.length) {
        if (legacy !== undefined) throw new Error(failure)
        values[field] = activities.flatMap((activity) => (Array.isArray(activity[field]) ? activity[field] : []))
      } else if (legacy === undefined) values[field] = []
    }
    const merged = Object.fromEntries(
      WORKSPACE_STATE_FIELDS.filter((field) => field in values).map((field) => [field, values[field]]),
    )
    if (!isAppState(merged) || !bounded(merged)) throw new Error(failure)
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
    if (
      records[historyKey] !== undefined ||
      records[checkpointKey] !== undefined ||
      Object.keys(records).some(isActivityKey)
    )
      throw new Error(failure)
    return { ...records, [stateKey]: raw }
  }
  if (!bounded(parsed)) throw new Error(failure)
  const partition = partitionWorkspaceState(parsed as AppState)
  const activities = partitionActivityCheckpoints(parsed as AppState)
  if (activities.status !== 'ready') throw new Error(failure)
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
    values: {
      ...partition.metadata,
      ...Object.fromEntries(Object.entries(partition.checkpoint).filter(([field]) => !activityFields.has(field))),
    },
  } satisfies PartitionRecord)
  for (const key of Object.keys(next)) if (isActivityKey(key)) delete next[key]
  for (const activity of activities.activities) {
    const values = Object.fromEntries(
      WORKSPACE_CHECKPOINT_FIELDS.filter((field) => activityFields.has(field)).map((field) => [
        field,
        activity[
          field === 'acquisitionProgressions'
            ? 'progressions'
            : field === 'acquisitionProgressEnvelopes'
              ? 'envelopes'
              : field === 'acquisitionTransitionReceipts'
                ? 'transitionReceipts'
                : 'pendingCheckpoints'
        ],
      ]),
    )
    next[activityKey(activity.activityId)] = JSON.stringify({
      schema: 1,
      childId,
      activityId: activity.activityId,
      values,
    })
  }
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

export type PracticeWorkspaceSyncAdapter = {
  keys: () => readonly string[]
  read: (key: string) => string | null
  stage: (key: string, payload: string) => void
  commit: () => void
}

/**
 * Presents the atomic workspace's internal records as independently syncable
 * cloud records. Changes are staged in memory and committed as one workspace
 * write so the application never observes a half-reconstructed partition.
 */
export function practiceWorkspaceSyncAdapter(storage: Store, childId: string): PracticeWorkspaceSyncAdapter | null {
  const key = practiceWorkspaceKey(childId)
  const raw = storage.getItem(key)
  if (raw === null) return null
  let value: Workspace
  try {
    value = parse(raw, childId)
  } catch {
    // The sync layer still has to preserve opaque legacy/current copies. The
    // application adapter remains fail-closed when it is opened directly.
    return null
  }
  if (value.records[stateKey] !== undefined && !value.records[historyKey] && !value.records[checkpointKey]) {
    value = { ...value, records: stateRecords(value.records, childId, value.records[stateKey]) }
    const migrated = JSON.stringify(value)
    storage.setItem(key, migrated)
    if (storage.getItem(key) !== migrated) throw new Error(failure)
  }
  const initial = JSON.stringify(value)
  const records = { ...value.records }
  const names = () => Object.keys(records).filter(isInternalKey).sort()
  const assertPayload = (name: string, payload: string) => {
    if (!isInternalKey(name)) throw new Error(failure)
    if (name === historyKey || name === checkpointKey) partitionRecord(payload, childId)
    else activityRecord(payload, childId, name)
  }
  return {
    keys: () => names().map((name) => practiceWorkspaceSyncKey(childId, name)),
    read: (syncKey) => {
      const name = decodeURIComponent(syncKey.slice(`${key}:${syncRecordPrefix}`.length))
      if (!isPracticeWorkspaceSyncKey(syncKey, childId) || !isInternalKey(name)) throw new Error(failure)
      return records[name] ?? null
    },
    stage: (syncKey, payload) => {
      if (!isPracticeWorkspaceSyncKey(syncKey, childId)) throw new Error(failure)
      const name = decodeURIComponent(syncKey.slice(`${key}:${syncRecordPrefix}`.length))
      assertPayload(name, payload)
      records[name] = payload
    },
    commit: () => {
      const next = JSON.stringify({ ...value, records })
      if (next === initial) return
      if (storage.getItem(key) !== initial) throw new Error(failure)
      storage.setItem(key, next)
      if (storage.getItem(key) !== next) throw new Error(failure)
    },
  }
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
  const initial = read()
  // Each kept-alive activity gets its own wrapper. Remember the records it
  // observed so a later write can overlay only the records changed by that
  // activity, preserving another retained week's checkpoint in the same
  // atomic workspace.
  let baselineRecords = (() => {
    if (!initial.value.records[stateKey]) return { ...initial.value.records }
    const state = stateFromRecords(initial.value.records, childId)
    return stateRecords(initial.value.records, childId, state)
  })()
  return {
    allowConcurrentMerge: true,
    get length() {
      return exposedRecordKeys(read().value.records).length
    },
    key: (index) => exposedRecordKeys(read().value.records)[index] ?? null,
    getItem: (name) => {
      if (isInternalKey(name)) return null
      return name === stateKey ? stateFromRecords(read().value.records, childId) : (read().value.records[name] ?? null)
    },
    setItem: (name, item) => {
      if (!name.startsWith('weekly-dictation-') || isInternalKey(name)) throw new Error(failure)
      const { raw, value } = read()
      if (name !== stateKey) {
        const records = { ...value.records, [name]: item }
        write({ ...value, records }, raw)
        baselineRecords = records
        return
      }
      const incoming = stateRecords(baselineRecords, childId, item)
      const records = { ...value.records }
      // A complete AppState write supersedes the legacy bundled copy. Opaque
      // legacy state remains untouched so old clients can still recover it.
      if (incoming[stateKey] === undefined && incoming[historyKey] !== undefined && incoming[checkpointKey] !== undefined)
        delete records[stateKey]
      const keys = new Set([...Object.keys(baselineRecords), ...Object.keys(incoming)])
      for (const recordKey of keys) {
        const before = baselineRecords[recordKey]
        const next = incoming[recordKey]
        if (next === before) continue
        // A kept-alive frame can omit another frame's activity from its
        // stale AppState snapshot. Never interpret that omission as deletion;
        // reviewed progress is retired explicitly through its own marker.
        if (next !== undefined) {
          const currentRevision = isActivityKey(recordKey) ? activityRevision(records[recordKey]) : null
          const incomingRevision = isActivityKey(recordKey) ? activityRevision(next) : null
          if (currentRevision !== null && incomingRevision !== null && currentRevision > incomingRevision) continue
          records[recordKey] = next
        }
      }
      write({ ...value, records }, raw)
      baselineRecords = records
    },
    removeItem: (name) => {
      if (isInternalKey(name)) throw new Error(failure)
      const { raw, value } = read()
      const records = { ...value.records }
      if (name === stateKey) {
        delete records[stateKey]
        delete records[historyKey]
        delete records[checkpointKey]
        for (const key of Object.keys(records)) if (isActivityKey(key)) delete records[key]
      } else delete records[name]
      write({ ...value, records }, raw)
    },
    clear: () => {
      throw new Error('Whole-workspace clearing is not supported. Use the reviewed restore workflow.')
    },
  }
}
