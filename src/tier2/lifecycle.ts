import type { Dataset } from '../domain/contracts.ts'
import type { LifecycleContext, LifecycleReviewAssignment } from '../lifecycle/contracts.ts'
import {
  TIER2_READING_ACTIVITY_MODULE,
  type Tier2ReadingCohort,
  type Tier2ReadingLifecycle,
  type Tier2ReadingPathway,
  type Tier2ReadingProfile,
  type Tier2ReadingTarget,
} from './contracts.ts'
import { isTier2ReadingTarget } from './acquisition.ts'

function cohortFor(datasetId: string, datasetsById: Map<string, Dataset>): Tier2ReadingCohort {
  const dataset = datasetsById.get(datasetId)
  if (!dataset) throw new Error(`Tier 2 lifecycle references unknown dataset ${datasetId}.`)
  const sourceTargets = dataset.vocabulary?.tier2 || []
  if (!sourceTargets.every((target) => target.datasetId === datasetId && isTier2ReadingTarget(target))) {
    throw new Error(`Dataset ${datasetId} contains invalid Tier 2 reading targets.`)
  }
  const targets = sourceTargets as Tier2ReadingTarget[]
  return {
    datasetId,
    targets,
    available: targets.length > 0,
    ...(targets.length === 0 ? { unavailableReason: 'This curriculum cohort has no canonical Tier 2 reading targets.' } : {}),
  }
}

function pathway(
  kind: Tier2ReadingPathway['kind'],
  datasetIds: readonly string[],
  datasetsById: Map<string, Dataset>,
  options: { cycle?: number; reviewGroupId?: string } = {},
): Tier2ReadingPathway {
  const cohorts = datasetIds.map((datasetId) => cohortFor(datasetId, datasetsById))
  const available = cohorts.some((cohort) => cohort.available)
  return {
    kind,
    ...options,
    cohorts,
    available,
    ...(!available ? { unavailableReason: 'No canonical Tier 2 reading targets are available for this pathway.' } : {}),
  }
}

function groupedReviews(reviews: readonly LifecycleReviewAssignment[]) {
  const groups = new Map<string, { cycle: number; reviewGroupId?: string; datasetIds: string[] }>()
  for (const review of reviews) {
    const key = `${review.cycle}\u0000${review.reviewGroupId || review.datasetId}`
    const group = groups.get(key) || {
      cycle: review.cycle,
      ...(review.reviewGroupId ? { reviewGroupId: review.reviewGroupId } : {}),
      datasetIds: [],
    }
    group.datasetIds.push(review.datasetId)
    groups.set(key, group)
  }
  // Map insertion order preserves the grade strategy's approved review order.
  // Tier 2 may group a cumulative review, but it must never independently
  // reorder the stages or cohorts selected by that strategy.
  return [...groups.values()]
}

/**
 * Reading never owns a competing curriculum lifecycle. It projects the exact
 * assignments produced by the grade's registered lifecycle strategy onto the
 * canonical Tier 2 targets from those same datasets.
 */
export function resolveTier2ReadingLifecycle(
  profile: Tier2ReadingProfile,
  context: LifecycleContext,
  datasets: readonly Dataset[],
): Tier2ReadingLifecycle {
  if (profile.activityModule !== TIER2_READING_ACTIVITY_MODULE) throw new Error('Tier 2 reading profile has the wrong activity module.')
  if (context.scope.grade !== profile.grade || context.scope.schoolYearKey !== profile.schoolYearKey) {
    throw new Error('Tier 2 reading requires the exact grade and school-year profile scope.')
  }
  if (profile.lifecycleStrategy.grade !== profile.grade
    || profile.lifecycleStrategy.schoolYearKey !== profile.schoolYearKey) {
    throw new Error('Tier 2 reading profile has a mismatched lifecycle strategy.')
  }
  const datasetsById = new Map<string, Dataset>()
  for (const dataset of datasets) {
    if (dataset.grade !== profile.grade) throw new Error(`Tier 2 reading received out-of-scope dataset ${dataset.id}.`)
    if (datasetsById.has(dataset.id)) throw new Error(`Tier 2 reading received duplicate dataset ${dataset.id}.`)
    datasetsById.set(dataset.id, dataset)
  }

  const resolution = profile.lifecycleStrategy.resolve(context)
  const acquisition = resolution.acquisitionDatasetId
    ? pathway('acquisition', [resolution.acquisitionDatasetId], datasetsById)
    : null
  const testReviews = groupedReviews(resolution.testReviews).map((review) => pathway(
    'test-review',
    review.datasetIds,
    datasetsById,
    { cycle: review.cycle, ...(review.reviewGroupId ? { reviewGroupId: review.reviewGroupId } : {}) },
  ))

  return {
    grade: profile.grade,
    schoolYearKey: profile.schoolYearKey,
    activityModule: TIER2_READING_ACTIVITY_MODULE,
    acquisition,
    testReviews,
    mastery: pathway('mastery', resolution.masteryDatasetIds, datasetsById),
    futureDatasetIds: [...resolution.futureDatasetIds],
    noInstructionDatasetIds: [...resolution.noInstructionDatasetIds],
  }
}
