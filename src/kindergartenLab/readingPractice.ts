import { datasetFromCanonicalCandidate } from '../curriculum/datasetProjection.ts'
import type { WeeklyDatasetCandidate } from '../curriculum/model.ts'
import type {
  Tier2ReadingCohort,
  Tier2ReadingPathway,
  Tier2ReadingTarget,
} from '../tier2/contracts.ts'
import { kindergartenCandidateIsUsableInLab } from './acquisitionLab.ts'
import type { KindergartenUnitReviewLab } from './unitReview.ts'

function cohort(datasetId: string, targets: readonly Tier2ReadingTarget[]): Tier2ReadingCohort {
  return {
    datasetId,
    targets,
    available: targets.length > 0,
    ...(targets.length === 0 ? { unavailableReason: 'This Kindergarten pathway has no high-frequency reading targets.' } : {}),
  }
}

function pathway(
  kind: Tier2ReadingPathway['kind'],
  cohorts: readonly Tier2ReadingCohort[],
  cycle?: number,
): Tier2ReadingPathway {
  const available = cohorts.some((item) => item.available)
  return {
    kind,
    ...(cycle ? { cycle } : {}),
    cohorts,
    available,
    ...(!available ? { unavailableReason: 'No Kindergarten high-frequency reading targets are available.' } : {}),
  }
}

export function kindergartenReadingAcquisitionPathway(candidate: WeeklyDatasetCandidate) {
  if (!kindergartenCandidateIsUsableInLab(candidate)) {
    throw new Error('Kindergarten reading requires one canonical inspected vocabulary tab.')
  }
  const dataset = datasetFromCanonicalCandidate(candidate)
  return pathway('acquisition', [cohort(dataset.id, dataset.vocabulary!.tier2 as Tier2ReadingTarget[])])
}

function unitReadingCohort(review: KindergartenUnitReviewLab) {
  const targets = review.dataset.vocabulary?.tier2 || []
  const valid = targets.every((target) => target.language === 'mandarin'
    && target.tier === 'tier-2'
    && target.activityType === 'reading')
  if (!valid) throw new Error('The Kindergarten unit review contains invalid Tier 2 reading targets.')
  return cohort(review.dataset.id, targets as Tier2ReadingTarget[])
}

export function kindergartenReadingReviewPathway(review: KindergartenUnitReviewLab) {
  return pathway('test-review', [unitReadingCohort(review)], 1)
}

export function kindergartenReadingMasteryPathway(review: KindergartenUnitReviewLab) {
  return pathway('mastery', [unitReadingCohort(review)])
}
