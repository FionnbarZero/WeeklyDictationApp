export type TestReviewMode = 'writing' | 'reading'
export type TestReviewCycle = number

export function isTestReviewCycle(value: unknown): value is TestReviewCycle {
  return Number.isInteger(value) && Number(value) > 0
}

/**
 * Records created before Test Review cycles were explicit belong to the only
 * review stage that existed in production: cycle 1.
 */
export function storedTestReviewCycle(value: unknown): TestReviewCycle {
  return isTestReviewCycle(value) ? value : 1
}

export type TestReviewTarget = {
  readonly id: string
  readonly text: string
}

export type TestReviewAssessment = 'correct' | 'incorrect' | null

export type TestReviewCollectionMethod =
  | 'timer'
  | 'skip_timer'
  | 'recording-comparison'
  | 'recording-unavailable'

export type TestReviewState = {
  readonly orderedTargetIds: readonly string[]
  readonly assessments: Readonly<Record<string, TestReviewAssessment>>
}

export type CompletedTestReviewAssessment<
  TTarget extends TestReviewTarget = TestReviewTarget,
> = {
  readonly target: TTarget
  readonly correct: boolean
  readonly collectionMethod: TestReviewCollectionMethod
}

export type TestReviewCompletion<
  TTarget extends TestReviewTarget = TestReviewTarget,
> = {
  readonly mode: TestReviewMode
  readonly assessments: readonly CompletedTestReviewAssessment<TTarget>[]
  readonly attempted: number
  readonly correct: number
  readonly total: number
}
