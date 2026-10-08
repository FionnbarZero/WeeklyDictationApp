/** A new, atomic workspace record keeps older clients from normalizing newer
 * datasets or replaying their journals. Legacy keys remain a recovery copy. */
type Store = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem'>
type Workspace = { schema: 1; childId: string; records: Record<string, string> }
const stateKey = 'weekly-dictation-state-v2'
export const MAX_WORKSPACE_RECORDS = 500
export const practiceWorkspaceKey = (childId: string) => `family-beta-activity:${childId}:lesson-workspace-v1`
export const legacyPracticeKey = (key: string, childId: string) =>
  key.startsWith(`family-beta-activity:${childId}:weekly-dictation-`)
const failure =
  'Saved practice could not be safely opened. Both old and new records are preserved. Please report this problem.'

function parse(raw: string, childId: string): Workspace {
  const value = JSON.parse(raw) as Workspace
  if (
    !value ||
    value.schema !== 1 ||
    value.childId !== childId ||
    !value.records ||
    typeof value.records !== 'object' ||
    Array.isArray(value.records) ||
    Object.keys(value.records).length > MAX_WORKSPACE_RECORDS ||
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
    : (parse(raw, childId).records[stateKey] ?? null)
}

export function practiceWorkspaceStorage(storage: Store, childId: string): Storage {
  if (!/^[\w-]{1,160}$/.test(childId)) throw new Error(failure)
  const key = practiceWorkspaceKey(childId)
  const legacyPrefix = `family-beta-activity:${childId}:`
  const write = (value: Workspace, expected: string | null) => {
    if (storage.getItem(key) !== expected) throw new Error(failure)
    if (Object.keys(value.records).length > MAX_WORKSPACE_RECORDS)
      throw new Error('Saved practice contains too many records for safe syncing. Existing device records are preserved.')
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
      throw new Error('Saved practice contains too many records for safe syncing. Existing device records are preserved.')
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
      return Object.keys(read().value.records).length
    },
    key: (index) => Object.keys(read().value.records)[index] ?? null,
    getItem: (name) => read().value.records[name] ?? null,
    setItem: (name, item) => {
      if (!name.startsWith('weekly-dictation-')) throw new Error(failure)
      const { raw, value } = read()
      write({ ...value, records: { ...value.records, [name]: item } }, raw)
    },
    removeItem: (name) => {
      const { raw, value } = read()
      const { [name]: _removed, ...records } = value.records
      write({ ...value, records }, raw)
    },
    clear: () => {
      throw new Error('Whole-workspace clearing is not supported. Use the reviewed restore workflow.')
    },
  }
}
