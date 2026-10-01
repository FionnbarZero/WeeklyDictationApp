import type { PracticeTarget } from '../domain.ts'
import { isTestReviewCycle } from '../testReview/contracts.ts'
import type { DatasetLifecycleResolution } from './lifecycleProjection.ts'

export function practiceTargetsForLifecycle(resolution: DatasetLifecycleResolution): PracticeTarget[] {
  const acquisition: PracticeTarget | null = resolution.acquisition
    ? { dataset: resolution.acquisition, phase: 'acquisition' }
    : null
  const reviews = resolution.testReviews
    .filter((review) => review.datasets.length > 0)
    .map((review): PracticeTarget => {
      if (!isTestReviewCycle(review.cycle)) throw new Error('A lifecycle review target has an invalid cycle identity.')
      return {
        dataset: review.datasets[review.datasets.length - 1],
        phase: 'test-review',
        reviewCycle: review.cycle,
        ...(review.reviewGroupId ? { reviewGroupId: review.reviewGroupId } : {}),
        ...(review.datasets.length > 1 ? { reviewDatasets: review.datasets } : {}),
      }
    })
    .sort((left, right) => (left.reviewCycle ?? 1) - (right.reviewCycle ?? 1))
  return [acquisition, ...reviews].filter((target): target is PracticeTarget => Boolean(target))
}
