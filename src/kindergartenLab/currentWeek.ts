import type { WeeklyDatasetCandidate } from '../curriculum/model.ts'

export function kindergartenCurrentSourceWeek(candidates: WeeklyDatasetCandidate[]) {
  return candidates.find((candidate) => candidate.assignedWeek && candidate.status !== 'malformed') || null
}
