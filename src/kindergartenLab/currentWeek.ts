import type { WeeklyDatasetCandidate } from '../curriculum/model.ts'
import { localDateKey } from '../domain.ts'

export const KINDERGARTEN_TIME_ZONE = 'America/Los_Angeles'

export function kindergartenCurrentDateKey(date = new Date()) {
  return localDateKey(date, KINDERGARTEN_TIME_ZONE)
}

export function kindergartenSourceWeekForDate(
  candidates: WeeklyDatasetCandidate[],
  currentDateKey = kindergartenCurrentDateKey(),
) {
  const dated = candidates
    .filter((candidate) => candidate.assignedWeek && candidate.normalizedStartDate && candidate.normalizedEndDate)
    .sort((left, right) => left.normalizedStartDate!.localeCompare(right.normalizedStartDate!))
  const exact = dated.find((candidate) =>
    candidate.normalizedStartDate! <= currentDateKey && candidate.normalizedEndDate! >= currentDateKey,
  )
  if (exact) return exact
  const arrived = dated.filter((candidate) => candidate.normalizedStartDate! <= currentDateKey)
  return arrived[arrived.length - 1] || dated[0] || null
}
