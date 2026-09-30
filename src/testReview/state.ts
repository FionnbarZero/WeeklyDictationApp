import type {
  CompletedTestReviewAssessment,
  TestReviewAssessment,
  TestReviewCompletion,
  TestReviewMode,
  TestReviewState,
  TestReviewTarget,
} from './contracts.ts'

export function createTestReviewState(targets: readonly TestReviewTarget[]): TestReviewState {
  const orderedTargetIds = targets.map((target) => target.id)
  if (new Set(orderedTargetIds).size !== orderedTargetIds.length) {
    throw new Error('A Test Review cannot contain duplicate target occurrence IDs.')
  }
  return {
    orderedTargetIds,
    assessments: Object.fromEntries(orderedTargetIds.map((targetId) => [targetId, null])),
  }
}

export function assessTestReviewTarget(
  state: TestReviewState,
  targetId: string,
  assessment: Exclude<TestReviewAssessment, null>,
): TestReviewState {
  if (!state.orderedTargetIds.includes(targetId)) return state
  return {
    ...state,
    assessments: { ...state.assessments, [targetId]: assessment },
  }
}

export function testReviewIsComplete(state: TestReviewState) {
  return state.orderedTargetIds.length > 0
    && state.orderedTargetIds.every((targetId) => state.assessments[targetId] !== null)
}

export function testReviewScore(state: TestReviewState) {
  const attempted = state.orderedTargetIds.filter((targetId) => state.assessments[targetId] !== null).length
  const correct = state.orderedTargetIds.filter((targetId) => state.assessments[targetId] === 'correct').length
  return { attempted, correct, total: state.orderedTargetIds.length }
}

export function completeTestReview<TTarget extends TestReviewTarget>(
  mode: TestReviewMode,
  targets: readonly TTarget[],
  state: TestReviewState,
): TestReviewCompletion<TTarget> {
  const targetById = new Map(targets.map((target) => [target.id, target]))
  if (targetById.size !== targets.length
    || targets.length !== state.orderedTargetIds.length
    || targets.some((target, index) => state.orderedTargetIds[index] !== target.id)
    || !testReviewIsComplete(state)) {
    throw new Error('A Test Review can be completed only after every original target is assessed.')
  }
  const assessments: CompletedTestReviewAssessment<TTarget>[] = state.orderedTargetIds.map((targetId) => ({
    target: targetById.get(targetId)!,
    correct: state.assessments[targetId] === 'correct',
  }))
  const score = testReviewScore(state)
  return { mode, assessments, ...score }
}
