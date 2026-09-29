import type { WeeklyDatasetCandidate } from '../curriculum/model.ts'
import type { Dataset, Word } from '../domain/contracts.ts'
import { kindergartenCandidateIsUsableInLab } from './acquisitionLab.ts'

// This is an explicit development fixture based on the product example. It is
// not a production lifecycle rule and is intentionally not exported elsewhere.
export const KINDERGARTEN_UNIT_ONE_LAB_FIXTURE = {
  id: '__kindergarten-unit-1-review-lab__',
  label: 'Unit 1',
  startDate: '2026-08-31',
  endDate: '2026-09-27',
} as const

export type KindergartenUnitReviewLab = {
  label: string
  sourceWeekCount: number
  tier1Words: string[]
  tier2Words: string[]
  dataset: Dataset
}

export function kindergartenUnitReviewForLab(candidates: WeeklyDatasetCandidate[]): KindergartenUnitReviewLab {
  const included = candidates
    .filter(kindergartenCandidateIsUsableInLab)
    .filter((candidate) => candidate.normalizedStartDate! >= KINDERGARTEN_UNIT_ONE_LAB_FIXTURE.startDate
      && candidate.normalizedStartDate! <= KINDERGARTEN_UNIT_ONE_LAB_FIXTURE.endDate)
    .sort((left, right) => left.normalizedStartDate!.localeCompare(right.normalizedStartDate!))
  const words: Word[] = []
  const tier2Words: string[] = []
  for (const candidate of included) {
    for (const occurrence of candidate.tier1) {
      words.push({
        id: `${KINDERGARTEN_UNIT_ONE_LAB_FIXTURE.id}:tier-1:${words.length + 1}`,
        text: occurrence.text,
        sentence: '',
        datasetId: KINDERGARTEN_UNIT_ONE_LAB_FIXTURE.id,
        grade: 'Kindergarten',
        sourceSlideId: candidate.source.sourceUnitId,
        language: 'mandarin',
        tier: 'tier-1',
        activityType: 'dictation',
      })
    }
    tier2Words.push(...candidate.tier2.map((occurrence) => occurrence.text))
  }
  if (words.length === 0) throw new Error('The Kindergarten Unit 1 lab fixture contains no usable Tier 1 writing targets.')
  return {
    label: KINDERGARTEN_UNIT_ONE_LAB_FIXTURE.label,
    sourceWeekCount: included.length,
    tier1Words: words.map((word) => word.text),
    tier2Words,
    dataset: {
      id: KINDERGARTEN_UNIT_ONE_LAB_FIXTURE.id,
      dateRange: `${KINDERGARTEN_UNIT_ONE_LAB_FIXTURE.startDate}–${KINDERGARTEN_UNIT_ONE_LAB_FIXTURE.endDate}`,
      startDate: KINDERGARTEN_UNIT_ONE_LAB_FIXTURE.startDate,
      endDate: KINDERGARTEN_UNIT_ONE_LAB_FIXTURE.endDate,
      grade: 'Kindergarten',
      schoolYear: '2026–2027',
      description: 'Development-only cumulative Kindergarten Unit 1 writing review fixture',
      importStatus: 'valid',
      words,
    },
  }
}
