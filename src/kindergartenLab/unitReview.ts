import type { WeeklyDatasetCandidate } from '../curriculum/model.ts'
import type { Dataset, Word } from '../domain/contracts.ts'
import { kindergartenCandidateIsUsableInLab } from './acquisitionLab.ts'

// This is an explicit development fixture based on the product example. It is
// not a production lifecycle rule and is intentionally not exported elsewhere.
export const KINDERGARTEN_UNIT_ONE_LAB_FIXTURE = {
  id: '__kindergarten-unit-1-review-lab__',
  label: 'Unit 1',
  instructionStartDate: '2026-08-31',
  instructionEndDate: '2026-09-27',
  reviewStartDate: '2026-09-28',
  reviewEndDate: '2026-10-04',
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
    .filter((candidate) => candidate.normalizedStartDate! >= KINDERGARTEN_UNIT_ONE_LAB_FIXTURE.instructionStartDate
      && candidate.normalizedStartDate! <= KINDERGARTEN_UNIT_ONE_LAB_FIXTURE.instructionEndDate)
    .sort((left, right) => left.normalizedStartDate!.localeCompare(right.normalizedStartDate!))
  const tier1: Word[] = []
  const tier2: Word[] = []
  for (const candidate of included) {
    for (const occurrence of candidate.tier1) {
      tier1.push({
        id: `${KINDERGARTEN_UNIT_ONE_LAB_FIXTURE.id}:tier-1:${tier1.length + 1}`,
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
    for (const occurrence of candidate.tier2) {
      tier2.push({
        id: `${KINDERGARTEN_UNIT_ONE_LAB_FIXTURE.id}:tier-2:${tier2.length + 1}`,
        text: occurrence.text,
        sentence: '',
        datasetId: KINDERGARTEN_UNIT_ONE_LAB_FIXTURE.id,
        grade: 'Kindergarten',
        sourceSlideId: candidate.source.sourceUnitId,
        language: 'mandarin',
        tier: 'tier-2',
        activityType: 'reading',
      })
    }
  }
  if (tier1.length === 0) throw new Error('The Kindergarten Unit 1 lab fixture contains no usable Tier 1 writing targets.')
  return {
    label: KINDERGARTEN_UNIT_ONE_LAB_FIXTURE.label,
    sourceWeekCount: included.length,
    tier1Words: tier1.map((word) => word.text),
    tier2Words: tier2.map((word) => word.text),
    dataset: {
      id: KINDERGARTEN_UNIT_ONE_LAB_FIXTURE.id,
      dateRange: `${KINDERGARTEN_UNIT_ONE_LAB_FIXTURE.instructionStartDate}–${KINDERGARTEN_UNIT_ONE_LAB_FIXTURE.reviewEndDate}`,
      startDate: KINDERGARTEN_UNIT_ONE_LAB_FIXTURE.instructionStartDate,
      endDate: KINDERGARTEN_UNIT_ONE_LAB_FIXTURE.reviewEndDate,
      grade: 'Kindergarten',
      schoolYear: '2026–2027',
      description: 'Development-only cumulative Kindergarten Unit 1 review fixture',
      importStatus: 'valid',
      words: tier1,
      vocabulary: { tier1, tier2, tier3: [] },
    },
  }
}
