/** JSON object order is not part of a game record's identity; array order is.
 * Keep this game boundary independent of acquisition-engine persistence. */
export function serializeGameRecord(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : entry,
  )
}
