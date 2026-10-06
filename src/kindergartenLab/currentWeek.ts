import type { WeeklyDatasetCandidate } from '../curriculum/model.ts'

export function kindergartenCurrentSourceWeek(candidates: WeeklyDatasetCandidate[]) {
  return candidates.find((candidate) => candidate.assignedWeek && candidate.status !== 'malformed') || null
}

export function kindergartenPreviousSourceWeek(
  candidates: WeeklyDatasetCandidate[],
  current: WeeklyDatasetCandidate | null | undefined,
) {
  if (!current?.normalizedStartDate) return null
  return candidates
    .filter((candidate) => candidate.assignedWeek
      && candidate.status !== 'malformed'
      && Boolean(candidate.normalizedStartDate)
      && candidate.normalizedStartDate! < current.normalizedStartDate!)
    .sort((left, right) => right.normalizedStartDate!.localeCompare(left.normalizedStartDate!))[0] || null
}
