import {
  type GameCheckpoint,
  type GameCompletion,
  type GameRetirement,
  gameScopeKey,
  serializeGameRecord,
  validateGameCheckpoint,
  validateGameCompletion,
  validateGameRetirement,
} from '../ninjaSkills/progress.ts'
import { type BetaResult, isBetaResult } from './model.ts'
import { sameCompletedResult } from './resultLedger.ts'
import { previewResultRetention } from './resultRetention.ts'

export const RETENTION_COLLECTIONS = [
  'results',
  'gameCompletions',
  'pendingResults',
  'pendingGameCompletions',
  'gameCheckpoints',
  'gameRetirements',
] as const
type Collection = (typeof RETENTION_COLLECTIONS)[number]
export const GAME_RETENTION_LIMITS = { bytes: 5_000_000, pages: 100, perPage: 50, recordCopies: 500 } as const
type Page = {
  familyId: string
  childId: string
  collection: Collection
  cursor: string
  nextCursor: string
  records: unknown[]
}
type Coverage = { status: 'complete' | 'missing' | 'truncated'; pages: number; recordCopies: number }
const refused = () => new Error('Invalid or conflicting retention snapshot. No records were changed.')
const id = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,160}$/.test(value)
function shape(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    !keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  )
    throw refused()
}
function exactScore(a: BetaResult, b: BetaResult) {
  if (!sameCompletedResult(a, b) || !sameCompletedResult(b, a)) throw refused()
}
function add<T>(map: Map<string, T>, key: string, value: T) {
  const existing = map.get(key)
  if (existing && serializeGameRecord(existing) !== serializeGameRecord(value)) throw refused()
  map.set(key, value)
}

/** Offline, supplied snapshots only. No storage, transport or reconciliation
 * calls. Page-chain coverage is NOT proof of a current/family-authorized cloud
 * inventory. Every score, detail, checkpoint and retirement stays preserved. */
export function previewGameRetentionInventory(input: unknown) {
  shape(input, ['schema', 'familyId', 'childId', 'currentSchoolYear', 'pages'])
  if (
    input.schema !== 1 ||
    !id(input.familyId) ||
    !id(input.childId) ||
    !Array.isArray(input.pages) ||
    input.pages.length > GAME_RETENTION_LIMITS.pages
  )
    throw refused()
  if (new TextEncoder().encode(JSON.stringify(input)).length > GAME_RETENTION_LIMITS.bytes) throw refused()
  const familyId = input.familyId,
    childId = input.childId
  const currentSchoolYear = previewResultRetention({
    childId,
    currentSchoolYear: input.currentSchoolYear as string,
    results: [],
  }).currentSchoolYear
  const grouped = new Map<Collection, Map<string, Page>>(RETENTION_COLLECTIONS.map((kind) => [kind, new Map()]))
  let recordCopies = 0
  for (const raw of input.pages) {
    shape(raw, ['familyId', 'childId', 'collection', 'cursor', 'nextCursor', 'records'])
    if (
      raw.familyId !== familyId ||
      raw.childId !== childId ||
      !RETENTION_COLLECTIONS.includes(raw.collection as Collection) ||
      typeof raw.cursor !== 'string' ||
      raw.cursor.length > 1024 ||
      typeof raw.nextCursor !== 'string' ||
      raw.nextCursor.length > 1024 ||
      !Array.isArray(raw.records) ||
      raw.records.length > GAME_RETENTION_LIMITS.perPage
    )
      throw refused()
    recordCopies += raw.records.length
    if (recordCopies > GAME_RETENTION_LIMITS.recordCopies) throw refused()
    const page = raw as unknown as Page
    const collection = grouped.get(page.collection)!
    if (collection.has(page.cursor)) throw refused()
    collection.set(page.cursor, page)
  }
  const coverage = {} as Record<Collection, Coverage>
  const records = {} as Record<Collection, unknown[]>
  for (const kind of RETENTION_COLLECTIONS) {
    const pages = grouped.get(kind)!,
      visited = new Set<string>(),
      values: unknown[] = []
    let cursor = '',
      complete = false
    while (pages.has(cursor)) {
      if (visited.has(cursor)) throw refused()
      visited.add(cursor)
      const page = pages.get(cursor)!
      values.push(...page.records)
      if (!page.nextCursor) {
        complete = true
        break
      }
      cursor = page.nextCursor
    }
    // Detached, repeated and after-terminal pages cannot count as a snapshot.
    if (visited.size !== pages.size) throw refused()
    coverage[kind] = {
      status: complete ? 'complete' : pages.size ? 'truncated' : 'missing',
      pages: pages.size,
      recordCopies: values.length,
    }
    records[kind] = values
  }
  const scores = new Map<string, BetaResult>(),
    confirmedScores = new Set<string>(),
    pendingScores = new Set<string>()
  for (const kind of ['results', 'pendingResults'] as const) {
    for (const raw of records[kind]) {
      if (!isBetaResult(raw) || raw.childId !== childId) throw refused()
      const existing = scores.get(raw.id)
      if (existing) exactScore(existing, raw)
      scores.set(raw.id, raw)
      const marker = kind === 'results' ? confirmedScores : pendingScores
      marker.add(raw.id)
    }
  }
  const completions = new Map<string, GameCompletion>(),
    pendingCompletions = new Set<string>()
  for (const kind of ['gameCompletions', 'pendingGameCompletions'] as const) {
    for (const raw of records[kind]) {
      const value = validateGameCompletion(raw as GameCompletion)
      if (value.result.childId !== childId || value.checkpoint.scope.childId !== childId) throw refused()
      add(completions, value.result.id, value)
      if (kind === 'pendingGameCompletions') pendingCompletions.add(value.result.id)
      const score = scores.get(value.result.id)
      if (score) exactScore(score, value.result)
    }
  }
  const checkpoints = new Map<string, GameCheckpoint>(),
    retirements = new Map<string, GameRetirement>()
  for (const raw of records.gameCheckpoints) {
    const value = validateGameCheckpoint(raw as GameCheckpoint)
    if (value.scope.childId !== childId) throw refused()
    // Preserve all supplied device revisions/forks, not just one winner.
    add(
      checkpoints,
      serializeGameRecord([value.scope, value.runId, value.attemptId, value.writerId, value.revision]),
      value,
    )
  }
  for (const raw of records.gameRetirements) {
    const value = validateGameRetirement(raw as GameRetirement)
    if (value.scope.childId !== childId) throw refused()
    add(retirements, serializeGameRecord([value.scope, value.runId]), value)
  }
  const suppliedPagesComplete = RETENTION_COLLECTIONS.every((kind) => coverage[kind].status === 'complete')
  const summaryPreview = previewResultRetention({ childId, currentSchoolYear, results: [...scores.values()] })
  const detailPreview = previewResultRetention({
    childId,
    currentSchoolYear,
    results: [...completions.values()].map((c) => c.result),
  })
  const details = detailPreview.entries.map((entry) => {
    const value = completions.get(entry.attemptId)!,
      protections: string[] = []
    const summaryLink = confirmedScores.has(entry.attemptId)
      ? 'matched'
      : pendingScores.has(entry.attemptId)
        ? 'pending-only'
        : 'missing'
    if (!suppliedPagesComplete) protections.push('incomplete-supplied-pages')
    if (summaryLink !== 'matched') protections.push('summary-not-confirmed')
    if (pendingScores.has(entry.attemptId) || pendingCompletions.has(entry.attemptId)) protections.push('pending-sync')
    const sameRun = (other: GameCheckpoint | GameRetirement) =>
      other.runId === value.checkpoint.runId && gameScopeKey(other.scope) === gameScopeKey(value.checkpoint.scope)
    if ([...checkpoints.values()].some((c) => c.attemptId === entry.attemptId || sameRun(c)))
      protections.push('checkpoint-dependent')
    if ([...retirements.values()].some(sameRun)) protections.push('retained-run-marker')
    if (entry.bucket === 'unknown') protections.push('unknown-school-year')
    return {
      ...entry,
      summaryLink,
      targetCount: value.targets.length,
      preserveDetail: true as const,
      protections,
      detailDisposition: entry.bucket === 'detail' ? 'retain' : protections.length ? 'hold' : 'review-linked-detail',
    }
  })
  return {
    schema: 1 as const,
    mode: 'read-only' as const,
    source: 'supplied-game-snapshot-only' as const,
    familyId,
    childId,
    currentSchoolYear,
    familyOwnershipVerified: false as const,
    completeInventory: false as const,
    suppliedPagesComplete,
    deletionAuthorized: false as const,
    plannedDeletes: [] as readonly never[],
    preserveAllCheckpoints: true as const,
    preserveAllRetirements: true as const,
    coverage,
    recordCopies,
    summaries: summaryPreview.entries,
    details,
    counts: {
      summaryAttempts: scores.size,
      detailedAttempts: completions.size,
      checkpoints: checkpoints.size,
      retirements: retirements.size,
      held: details.filter((entry) => entry.detailDisposition === 'hold').length,
      retained: details.filter((entry) => entry.detailDisposition === 'retain').length,
      olderDetailReview: details.filter((entry) => entry.detailDisposition === 'review-linked-detail').length,
    },
  }
}
