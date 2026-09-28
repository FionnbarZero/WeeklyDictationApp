import type {
  LifecycleAssignment,
  LifecycleContext,
  LifecycleResolution,
  LifecycleScope,
  LifecycleSet,
} from './contracts.ts'

function uniqueScopedSets(scope: LifecycleScope, sets: readonly LifecycleSet[]) {
  const byId = new Map<string, LifecycleSet>()
  for (const set of sets) {
    if (set.grade !== scope.grade || set.schoolYearKey !== scope.schoolYearKey || byId.has(set.datasetId)) continue
    byId.set(set.datasetId, set)
  }
  return [...byId.values()].sort((left, right) =>
    left.activationDate.localeCompare(right.activationDate)
      || left.instructionalEndDate.localeCompare(right.instructionalEndDate)
      || left.datasetId.localeCompare(right.datasetId),
  )
}

export function resolveReplacementDrivenLifecycle(options: LifecycleContext & {
  testReviewCycles: number
}): LifecycleResolution {
  const { scope } = options
  const sets = uniqueScopedSets(scope, options.sets)
  const noInstruction = sets.filter((set) => set.kind === 'no-instruction' && set.activationDate <= scope.currentDateKey)
  const vocabulary = sets.filter((set) => set.kind === 'vocabulary')
  const arrived = vocabulary.filter((set) => set.activationDate <= scope.currentDateKey)
  const future = vocabulary.filter((set) => set.activationDate > scope.currentDateKey)
  const acquisition = arrived[arrived.length - 1] || null
  const reviewCount = Math.min(Math.max(0, options.testReviewCycles), Math.max(0, arrived.length - 1))
  const reviewStart = Math.max(0, arrived.length - 1 - reviewCount)
  const reviewSets = arrived.slice(reviewStart, Math.max(0, arrived.length - 1)).reverse()
  const mastery = arrived.slice(0, reviewStart)
  const assignmentByDatasetId: Record<string, LifecycleAssignment> = {}

  for (const set of sets) {
    const stage = set.activationDate > scope.currentDateKey
      ? { kind: 'future' as const }
      : set.kind === 'no-instruction'
        ? { kind: 'no-instruction' as const }
        : { kind: 'mastery' as const }
    assignmentByDatasetId[set.datasetId] = { datasetId: set.datasetId, stage }
  }

  const testReviews = reviewSets.map((set, index) => {
    const cycle = index + 1
    const replacementIndex = arrived.findIndex((candidate) => candidate.datasetId === set.datasetId) + cycle
    assignmentByDatasetId[set.datasetId] = {
      datasetId: set.datasetId,
      stage: { kind: 'test-review', cycle },
      enteredStageOn: arrived[replacementIndex]?.activationDate,
    }
    return { datasetId: set.datasetId, cycle }
  })

  if (acquisition) {
    assignmentByDatasetId[acquisition.datasetId] = {
      datasetId: acquisition.datasetId,
      stage: { kind: 'acquisition' },
      enteredStageOn: acquisition.activationDate,
    }
  }

  const masteredAtByDatasetId = Object.fromEntries(mastery.map((set, index) => {
    const masteredAt = arrived[index + options.testReviewCycles + 1]?.activationDate
    if (masteredAt) assignmentByDatasetId[set.datasetId] = { datasetId: set.datasetId, stage: { kind: 'mastery' }, enteredStageOn: masteredAt }
    return [set.datasetId, masteredAt]
  }).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))

  return {
    scope,
    acquisitionDatasetId: acquisition?.datasetId || null,
    testReviews,
    masteryDatasetIds: mastery.map((set) => set.datasetId),
    masteredAtByDatasetId,
    futureDatasetIds: future.map((set) => set.datasetId),
    noInstructionDatasetIds: noInstruction.map((set) => set.datasetId),
    assignmentByDatasetId,
  }
}
