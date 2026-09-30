import type { WarmupAttempt } from './contracts.ts'

export type MasteryRotationMonthlyReport = {
  month: string
  correct: number
  attempted: number
  percent: number
  status: 'open' | 'finalized'
}

function localMonth(timestamp: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' })
    .formatToParts(new Date(timestamp))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}`
}

export function deriveMasteryRotationMonthlyReports(
  attempts: readonly WarmupAttempt[],
  now = new Date(),
  timeZone = 'America/Los_Angeles',
): MasteryRotationMonthlyReport[] {
  const currentMonth = localMonth(now.toISOString(), timeZone)
  const grouped = new Map<string, { correct: number; attempted: number }>()
  for (const attempt of attempts) {
    if (attempt.sourceBucket !== 'mastery-rotation' || !Number.isFinite(Date.parse(attempt.reviewedAt))) continue
    const month = localMonth(attempt.reviewedAt, timeZone)
    const current = grouped.get(month) || { correct: 0, attempted: 0 }
    grouped.set(month, { correct: current.correct + (attempt.correct ? 1 : 0), attempted: current.attempted + 1 })
  }
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([month, totals]) => ({
    month,
    correct: totals.correct,
    attempted: totals.attempted,
    percent: Math.round((totals.correct / totals.attempted) * 100),
    status: month < currentMonth ? 'finalized' : 'open',
  }))
}
