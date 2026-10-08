import { localDateKey } from '../domain.ts'

export const BETA_GRADES = ['Kindergarten', 'Grade 2', 'Grade 5'] as const
export type BetaGrade = (typeof BETA_GRADES)[number]
export type BetaProfile = { id: string; nickname: string; grade: BetaGrade; active: boolean; previousGrade?: BetaGrade }
export type BetaResult = {
  schema: 1
  id: string
  childId: string
  grade: BetaGrade
  activity: string
  channel: 'writing' | 'reading' | 'game'
  datasetIds: string[]
  /** Additive provenance; legacy scores may omit it and remain valid. */
  schoolYear?: string
  correct: number
  attempted: number
  completedAt: string
  day: string
}
export type ResultInput = Pick<BetaResult, 'activity' | 'channel' | 'datasetIds' | 'schoolYear' | 'correct' | 'attempted'> & {
  id?: string
}

export function isBetaResult(value: unknown): value is BetaResult {
  if (!value || typeof value !== 'object') return false
  const r = value as BetaResult
  const keys = [
    'schema',
    'id',
    'childId',
    'grade',
    'activity',
    'channel',
    'datasetIds',
    'schoolYear',
    'correct',
    'attempted',
    'completedAt',
    'day',
  ]
  return (
    Object.keys(r).every((key) => keys.includes(key)) &&
    r.schema === 1 &&
    typeof r.id === 'string' &&
    /^[\w-]{1,160}$/.test(r.id) &&
    typeof r.childId === 'string' &&
    /^[\w-]{1,160}$/.test(r.childId) &&
    BETA_GRADES.includes(r.grade) &&
    ['writing', 'reading', 'game'].includes(r.channel) &&
    typeof r.activity === 'string' &&
    r.activity.length > 0 &&
    r.activity.length <= 120 &&
    Array.isArray(r.datasetIds) &&
    r.datasetIds.length > 0 &&
    r.datasetIds.length <= 100 &&
    r.datasetIds.every((id) => typeof id === 'string' && /^[A-Za-z0-9_:-]{1,300}$/.test(id)) &&
    Number.isSafeInteger(r.correct) &&
    Number.isSafeInteger(r.attempted) &&
    r.correct >= 0 &&
    r.attempted > 0 &&
    r.correct <= r.attempted &&
    r.attempted <= 100000 &&
    typeof r.completedAt === 'string' &&
    Number.isFinite(Date.parse(r.completedAt)) &&
    new Date(r.completedAt).toISOString() === r.completedAt &&
    r.day === localDateKey(new Date(r.completedAt))
  )
}

export function makeResult(profile: BetaProfile, input: ResultInput, now = new Date()): BetaResult {
  const result: BetaResult = {
    schema: 1,
    id: input.id || crypto.randomUUID(),
    childId: profile.id,
    grade: profile.grade,
    activity: input.activity,
    channel: input.channel,
    datasetIds: [...new Set(input.datasetIds)],
    correct: input.correct,
    attempted: input.attempted,
    completedAt: now.toISOString(),
    day: localDateKey(now),
  }
  input.schoolYear && (result.schoolYear = input.schoolYear)
  if (!isBetaResult(result)) throw new Error('Invalid result; not saved.')
  return result
}

export function dailyTotals(results: readonly BetaResult[], childId: string) {
  const unique = new Map<string, BetaResult>()
  for (const result of results) if (isBetaResult(result) && result.childId === childId) unique.set(result.id, result)
  const days = new Map<string, { day: string; correct: number; attempted: number; sessions: number }>()
  for (const result of unique.values()) {
    const total = days.get(result.day) || { day: result.day, correct: 0, attempted: 0, sessions: 0 }
    total.correct += result.correct
    total.attempted += result.attempted
    total.sessions += 1
    days.set(result.day, total)
  }
  return [...days.values()].sort((a, b) => b.day.localeCompare(a.day))
}
