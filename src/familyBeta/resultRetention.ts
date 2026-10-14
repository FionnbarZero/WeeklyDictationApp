import { type BetaResult, isBetaResult } from './model.ts'
import { sameCompletedResult } from './resultLedger.ts'

export type ResultRetentionBucket = 'detail' | 'summary' | 'unknown'

/** Retention is stricter than display/legacy curriculum normalization. Never
 * infer a deletion-relevant year from a substring or the completion date. */
function retentionYear(value: unknown) {
  if (typeof value !== 'string' || value.length > 32) return null
  const match = value.trim().match(/^(20\d{2})\s*[-–—/]\s*(\d{4}|\d{2})$/)
  if (!match) return null
  const start = Number(match[1])
  const expectedEnd = String(start + 1)
  if (match[2] !== expectedEnd && match[2] !== expectedEnd.slice(-2)) return null
  return { start, key: `${start}-${expectedEnd.slice(-2)}` }
}

/** `summary` means review linked old detail; it NEVER authorizes score deletion. */
export function resultRetentionBucket(result: BetaResult, currentSchoolYear: string): ResultRetentionBucket {
  const year = retentionYear(result.schoolYear)
  const current = retentionYear(currentSchoolYear)
  if (!year || !current || year.start > current.start) return 'unknown'
  return year.start >= current.start - 1 ? 'detail' : 'summary'
}

export const RETENTION_PREVIEW_LIMIT = 500
type RetentionReason = 'current-or-previous-year' | 'older-year' | 'missing-year' | 'invalid-year' | 'future-year'
export type RetentionPreviewEntry = {
  attemptId: string
  grade: BetaResult['grade']
  activity: string
  channel: BetaResult['channel']
  completedAt: string
  correct: number
  attempted: number
  schoolYear: string | null
  bucket: ResultRetentionBucket
  reason: RetentionReason
  preserveCompletedScore: true
  detailDisposition: 'retain' | 'review-linked-detail' | 'hold'
}

/** Pure planning over caller-supplied completed totals only. No storage,
 * network, credentials, live inventory claims, mutations, or delete commands.
 * A separate inventory must prove summary/detail linkage and protect active
 * sessions, pending sync and retirement markers before any cleanup proposal. */
export function previewResultRetention(input: {
  childId: string
  currentSchoolYear: string
  results: readonly unknown[]
}) {
  const current = retentionYear(input.currentSchoolYear)
  if (!current) throw new Error('Supply a complete consecutive current school-year range.')
  if (typeof input.childId !== 'string' || !/^[\w-]{1,160}$/.test(input.childId))
    throw new Error('Supply one explicit child scope for the retention preview.')
  if (!Array.isArray(input.results) || input.results.length > RETENTION_PREVIEW_LIMIT)
    throw new Error('Retention preview input exceeds the bounded completed-score snapshot.')
  const unique = new Map<string, BetaResult>()
  for (const value of input.results) {
    if (!isBetaResult(value) || value.childId !== input.childId)
      throw new Error('Retention preview contains an invalid or differently scoped completed score.')
    const prior = unique.get(value.id)
    if (prior && (!sameCompletedResult(prior, value) || !sameCompletedResult(value, prior)))
      throw new Error('Completed score copies disagree. No retention preview was produced.')
    unique.set(value.id, value)
  }
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  const entries: RetentionPreviewEntry[] = [...unique.values()]
    .sort((a, b) => compare(a.completedAt, b.completedAt) || compare(a.id, b.id))
    .map((result) => {
      const year = retentionYear(result.schoolYear)
      const bucket = resultRetentionBucket(result, current.key)
      const reason: RetentionReason =
        result.schoolYear === undefined
          ? 'missing-year'
          : !year
            ? 'invalid-year'
            : year.start > current.start
              ? 'future-year'
              : bucket === 'detail'
                ? 'current-or-previous-year'
                : 'older-year'
      return {
        attemptId: result.id,
        grade: result.grade,
        activity: result.activity,
        channel: result.channel,
        completedAt: result.completedAt,
        correct: result.correct,
        attempted: result.attempted,
        schoolYear: year?.key ?? null,
        bucket,
        reason,
        preserveCompletedScore: true,
        detailDisposition: bucket === 'detail' ? 'retain' : bucket === 'summary' ? 'review-linked-detail' : 'hold',
      }
    })
  return {
    schema: 1 as const,
    policy: 'current-and-previous-school-year-detail-v1' as const,
    mode: 'read-only' as const,
    source: 'supplied-completed-scores-only' as const,
    childId: input.childId,
    currentSchoolYear: current.key,
    completeInventory: false as const,
    deletionAuthorized: false as const,
    plannedDeletes: [] as readonly never[],
    inputCopies: input.results.length,
    distinctAttempts: entries.length,
    duplicates: input.results.length - entries.length,
    counts: {
      detail: entries.filter((entry) => entry.bucket === 'detail').length,
      olderDetailReview: entries.filter((entry) => entry.bucket === 'summary').length,
      hold: entries.filter((entry) => entry.bucket === 'unknown').length,
    },
    entries,
  }
}
