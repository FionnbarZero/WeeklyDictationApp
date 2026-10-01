import type { Dataset } from '../domain/contracts.ts'
import type { CurriculumStage, LifecycleResolution } from '../lifecycle/contracts.ts'
import { practicePhaseForStage } from '../lifecycle/stageMapping.ts'
import { isTestReviewCycle, type TestReviewCycle } from '../testReview/contracts.ts'

export type DatasetLifecycle = 'acquisition' | 'test-review' | 'future' | 'mastered' | 'no-instruction'

export type DatasetLifecycleResolution = {
  acquisition: Dataset | null
  /** Cycle-1 compatibility field for existing Grade 2 callers. */
  testReview: Dataset | null
  testReviews: Array<{ cycle: TestReviewCycle; datasets: Dataset[]; reviewGroupId?: string }>
  /** Cumulative-review compatibility field for existing Kindergarten callers. */
  testReviewGroups: Array<{ id: string; cycle: TestReviewCycle; datasets: Dataset[] }>
  mastered: Dataset[]
  masteredAtByDatasetId: Record<string, string>
  future: Dataset[]
  noInstruction: Dataset[]
  lifecycleByDatasetId: Record<string, DatasetLifecycle>
}

export function emptyDatasetLifecycleResolution(): DatasetLifecycleResolution {
  return { acquisition: null, testReview: null, testReviews: [], testReviewGroups: [], mastered: [], masteredAtByDatasetId: {}, future: [], noInstruction: [], lifecycleByDatasetId: {} }
}

function compatibilityLifecycle(stage: CurriculumStage): DatasetLifecycle {
  const practicePhase = practicePhaseForStage(stage)
  if (practicePhase === 'acquisition' || practicePhase === 'test-review') return practicePhase
  if (stage.kind === 'mastery') return 'mastered'
  return stage.kind
}

export function datasetLifecycleResolutionFrom(
  datasets: readonly Dataset[],
  resolution: LifecycleResolution,
): DatasetLifecycleResolution {
  const datasetsById = new Map(datasets.map((dataset) => [dataset.id, dataset]))
  if (datasetsById.size !== datasets.length) throw new Error('Lifecycle projection received duplicate canonical dataset IDs.')
  const referencedIds = [
    ...(resolution.acquisitionDatasetId ? [resolution.acquisitionDatasetId] : []),
    ...resolution.testReviews.map((review) => review.datasetId),
    ...resolution.masteryDatasetIds,
    ...resolution.futureDatasetIds,
    ...resolution.noInstructionDatasetIds,
    ...Object.keys(resolution.assignmentByDatasetId),
  ]
  const missingIds = [...new Set(referencedIds.filter((datasetId) => !datasetsById.has(datasetId)))].sort()
  if (missingIds.length > 0) throw new Error(`Lifecycle resolution references unavailable canonical datasets: ${missingIds.join(', ')}.`)
  const assignedIds = Object.keys(resolution.assignmentByDatasetId)
  const unassignedIds = [...datasetsById.keys()].filter((datasetId) => !resolution.assignmentByDatasetId[datasetId]).sort()
  if (unassignedIds.length > 0) throw new Error(`Canonical datasets lack lifecycle assignments: ${unassignedIds.join(', ')}.`)
  for (const datasetId of assignedIds) {
    if (resolution.assignmentByDatasetId[datasetId].datasetId !== datasetId) {
      throw new Error(`Lifecycle assignment key ${datasetId} does not match its dataset identity.`)
    }
  }
  const reviewedDatasetIds = new Set<string>()
  const reviewGroupCycles = new Map<string, TestReviewCycle>()
  for (const review of resolution.testReviews) {
    if (!isTestReviewCycle(review.cycle)) throw new Error(`Lifecycle review ${review.datasetId} has an invalid cycle.`)
    if (reviewedDatasetIds.has(review.datasetId)) throw new Error(`Lifecycle review dataset ${review.datasetId} is assigned more than once.`)
    reviewedDatasetIds.add(review.datasetId)
    if (!review.reviewGroupId) continue
    const existingCycle = reviewGroupCycles.get(review.reviewGroupId)
    if (existingCycle !== undefined && existingCycle !== review.cycle) {
      throw new Error(`Lifecycle review group ${review.reviewGroupId} spans more than one cycle.`)
    }
    reviewGroupCycles.set(review.reviewGroupId, review.cycle)
  }
  const requireStage = (datasetId: string, expected: CurriculumStage['kind'], cycle?: TestReviewCycle) => {
    const stage = resolution.assignmentByDatasetId[datasetId]?.stage
    if (!stage || stage.kind !== expected || (expected === 'test-review' && (stage.kind !== 'test-review' || stage.cycle !== cycle))) {
      throw new Error(`Lifecycle collection for ${datasetId} contradicts its authoritative assignment.`)
    }
  }
  if (resolution.acquisitionDatasetId) requireStage(resolution.acquisitionDatasetId, 'acquisition')
  for (const review of resolution.testReviews) {
    const stage = resolution.assignmentByDatasetId[review.datasetId].stage
    const isCurrentCumulativeAcquisition = Boolean(review.reviewGroupId) && stage.kind === 'acquisition'
    if (!isCurrentCumulativeAcquisition) requireStage(review.datasetId, 'test-review', review.cycle)
  }
  for (const datasetId of resolution.masteryDatasetIds) requireStage(datasetId, 'mastery')
  for (const datasetId of resolution.futureDatasetIds) requireStage(datasetId, 'future')
  for (const datasetId of resolution.noInstructionDatasetIds) requireStage(datasetId, 'no-instruction')
  const datasetsForIds = (ids: string[]) => ids.map((id) => datasetsById.get(id)).filter((dataset): dataset is Dataset => Boolean(dataset))
  const lifecycleByDatasetId = Object.fromEntries(Object.entries(resolution.assignmentByDatasetId).map(([datasetId, assignment]) => [datasetId, compatibilityLifecycle(assignment.stage)]))
  const groupedReviews = new Map<string, { id: string; cycle: TestReviewCycle; datasets: Dataset[] }>()
  for (const review of resolution.testReviews) {
    if (!review.reviewGroupId) continue
    const dataset = datasetsById.get(review.datasetId)!
    const group = groupedReviews.get(review.reviewGroupId) || { id: review.reviewGroupId, cycle: review.cycle, datasets: [] }
    group.datasets.push(dataset)
    groupedReviews.set(review.reviewGroupId, group)
  }
  const testReviews = resolution.testReviews.reduce<DatasetLifecycleResolution['testReviews']>((reviews, review) => {
    const dataset = datasetsById.get(review.datasetId)!
    const existing = review.reviewGroupId
      ? reviews.find((candidate) => candidate.reviewGroupId === review.reviewGroupId && candidate.cycle === review.cycle)
      : undefined
    if (existing) existing.datasets.push(dataset)
    else reviews.push({ cycle: review.cycle, datasets: [dataset], ...(review.reviewGroupId ? { reviewGroupId: review.reviewGroupId } : {}) })
    return reviews
  }, [])

  return {
    acquisition: resolution.acquisitionDatasetId ? datasetsById.get(resolution.acquisitionDatasetId)! : null,
    testReview: datasetsById.get(resolution.testReviews.find((review) => review.cycle === 1)?.datasetId || '') || null,
    testReviews,
    testReviewGroups: [...groupedReviews.values()],
    mastered: datasetsForIds(resolution.masteryDatasetIds),
    masteredAtByDatasetId: resolution.masteredAtByDatasetId,
    future: datasetsForIds(resolution.futureDatasetIds),
    noInstruction: datasetsForIds(resolution.noInstructionDatasetIds),
    lifecycleByDatasetId,
  }
}

export function requireDatasetLifecycle(resolution: DatasetLifecycleResolution, datasetId: string): DatasetLifecycle {
  const lifecycle = resolution.lifecycleByDatasetId[datasetId]
  if (!lifecycle) throw new Error(`Canonical dataset ${datasetId} has no lifecycle assignment.`)
  return lifecycle
}
