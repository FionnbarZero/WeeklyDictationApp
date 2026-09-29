import type { DatasetLifecycleResolution, PracticeTarget } from '../domain.ts'

export function practiceTargetsForLifecycle(resolution: DatasetLifecycleResolution): PracticeTarget[] {
  const acquisition: PracticeTarget | null = resolution.acquisition
    ? { dataset: resolution.acquisition, phase: 'acquisition' }
    : null
  const cumulativeGroup = resolution.testReviewGroups.find((group) => group.cycle === 1 && group.datasets.length > 0)
  const groupedReview: PracticeTarget | null = cumulativeGroup
    ? {
        dataset: cumulativeGroup.datasets[cumulativeGroup.datasets.length - 1],
        phase: 'test-review',
        reviewGroupId: cumulativeGroup.id,
        reviewDatasets: cumulativeGroup.datasets,
      }
    : null
  const ordinaryReview: PracticeTarget | null = !groupedReview && resolution.testReview
    ? { dataset: resolution.testReview, phase: 'test-review' }
    : null
  return [acquisition, groupedReview || ordinaryReview].filter((target): target is PracticeTarget => Boolean(target))
}
