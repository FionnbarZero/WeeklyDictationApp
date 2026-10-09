const exactKeys = new Set([
  'beta-preview-profiles',
  'family-beta-preview-results-v1',
  'family-beta-preview-pending-v1',
  'weekly-dictation-state-v2',
  'weekly-dictation-acquisition-pending-v1',
  'weekly-dictation-warmup-pending-v1',
])
const prefixes = [
  'family-beta-preview-results-v1:',
  'family-beta-preview-pending-v1:',
  'family-beta-acquisition-v1:',
  'family-beta-activity:',
  'family-beta-mastery-v1:',
  'family-beta-games-v1:',
  'family-beta-problem-report-v1:',
]

// Explicit application data only: never dump all browser storage (auth tokens
// may live alongside it). Preserve raw records, including damaged ones, without
// interpreting or replacing them. Import/migration is a separate reviewed action.
export function deviceExport(
  storage: Pick<Storage, 'length' | 'key' | 'getItem'>,
  origin: string,
  createdAt = new Date().toISOString(),
) {
  const records: Record<string, string> = {}
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (!key || (!exactKeys.has(key) && !prefixes.some((prefix) => key.startsWith(prefix)))) continue
    const value = storage.getItem(key)
    if (value !== null) records[key] = value
  }
  return {
    format: 'weekly-dictation-device-export',
    schema: 1,
    origin,
    createdAt,
    notice: 'Private learner data. Keep this file safe. It does not enable automatic syncing or automatic restore.',
    records,
  }
}
