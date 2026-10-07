import { RESULT_PAGE_SIZE } from './cloud.ts'
import { type BetaResult, isBetaResult } from './model.ts'

const compareAttempts = (a: BetaResult, b: BetaResult) =>
  a.completedAt.localeCompare(b.completedAt) || a.id.localeCompare(b.id)

const sameAttempt = (a: BetaResult, b: BetaResult) =>
  Object.keys(a).every(
    (key) => JSON.stringify(a[key as keyof BetaResult]) === JSON.stringify(b[key as keyof BetaResult]),
  )

/** Read-only integrity gate shared by recent refreshes and explicit older-page loads. */
export function assertSavedAttemptsMatch(
  results: readonly BetaResult[],
  storage: Pick<Storage, 'getItem'>,
  ledgerKey: string,
) {
  const legacy: unknown = JSON.parse(storage.getItem(ledgerKey) ?? '[]')
  if (!Array.isArray(legacy) || !legacy.every(isBetaResult))
    throw new Error('Stored completed scores failed validation. Device records are unchanged.')
  const incoming = new Map<string, BetaResult>()
  const checkCopy = (result: BetaResult, existing: unknown) => {
    if (!isBetaResult(existing))
      throw new Error('A stored completed score failed validation. Device records are unchanged.')
    if (!sameAttempt(result, existing))
      throw new Error('An online score differs from this device’s record. Both copies are preserved.')
  }
  for (const result of results) {
    if (!isBetaResult(result)) throw new Error('A completed attempt failed validation. Records were not changed.')
    const duplicate = incoming.get(result.id)
    if (duplicate) checkCopy(result, duplicate)
    incoming.set(result.id, result)
    const raw = storage.getItem(`${ledgerKey}:${result.id}`)
    if (raw !== null) checkCopy(result, JSON.parse(raw))
  }
  // Check the legacy copy too; a matching per-attempt key must not hide a conflict.
  for (const existing of legacy) {
    const result = incoming.get(existing.id)
    if (result) checkCopy(result, existing)
  }
}

/** Stable attempt identity, never daily aggregation, determines graph points. */
export function distinctAttempts(results: readonly BetaResult[], childId: string) {
  const unique = new Map<string, BetaResult>()
  for (const result of results) {
    if (!isBetaResult(result)) throw new Error('A completed attempt failed validation. Records were not changed.')
    if (result.childId !== childId) continue
    const existing = unique.get(result.id)
    if (existing && !sameAttempt(existing, result))
      throw new Error('Two copies of this completed attempt disagree. Neither was replaced.')
    unique.set(result.id, result)
  }
  return [...unique.values()].sort(compareAttempts)
}

/** Read the current device ledger after a stable boundary, never an offset into refreshed online results. */
export function olderLocalAttempts(results: readonly BetaResult[], childId: string, after: BetaResult) {
  const remaining = distinctAttempts(results, childId)
    .reverse()
    .filter((result) => compareAttempts(result, after) < 0)
  return { results: remaining.slice(0, RESULT_PAGE_SIZE), hasOlderLocal: remaining.length > RESULT_PAGE_SIZE }
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
