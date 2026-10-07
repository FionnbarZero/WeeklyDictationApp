import { type BetaResult, isBetaResult } from './model.ts'

/** Stable attempt identity, never daily aggregation, determines graph points. */
export function distinctAttempts(results: readonly BetaResult[], childId: string) {
  const unique = new Map<string, BetaResult>()
  for (const result of results) {
    if (!isBetaResult(result)) throw new Error('A completed attempt failed validation. Records were not changed.')
    if (result.childId !== childId) continue
    const existing = unique.get(result.id)
    if (
      existing &&
      Object.keys(result).some(
        (key) => JSON.stringify(existing[key as keyof BetaResult]) !== JSON.stringify(result[key as keyof BetaResult]),
      )
    )
      throw new Error('Two copies of this completed attempt disagree. Neither was replaced.')
    unique.set(result.id, result)
  }
  return [...unique.values()].sort((a, b) => a.completedAt.localeCompare(b.completedAt) || a.id.localeCompare(b.id))
}

export function attemptSeries(results: readonly BetaResult[], childId: string) {
  const groups = new Map<string, { key: string; label: string; attempts: BetaResult[] }>()
  for (const result of distinctAttempts(results, childId)) {
    // A reading, writing, Boss, or game score never becomes another activity's mastery point.
    const key = JSON.stringify([result.grade, result.channel, result.activity])
    const group = groups.get(key) || {
      key,
      label: `${result.grade} · ${result.activity} · ${result.channel}`,
      attempts: [],
    }
    group.attempts.push(result)
    groups.set(key, group)
  }
  return [...groups.values()]
}
