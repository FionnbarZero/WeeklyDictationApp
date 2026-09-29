import type {
  LifecycleAssignment,
  LifecycleContext,
  LifecycleProgressionEvent,
  LifecycleResolution,
  LifecycleSet,
  LifecycleStrategy,
} from '../contracts.ts'

const GRADE5_ACTIVATION_BASELINE = '2026-08-31'

function setSignature(set: LifecycleSet) {
  return JSON.stringify({
    grade: set.grade,
    schoolYearKey: set.schoolYearKey,
    activationDate: set.activationDate,
    instructionalEndDate: set.instructionalEndDate,
    kind: set.kind,
  })
}

function scopedSets(context: LifecycleContext) {
  const grouped = new Map<string, LifecycleSet[]>()
  for (const set of context.sets) {
    if (set.grade !== context.scope.grade || set.schoolYearKey !== context.scope.schoolYearKey) continue
    grouped.set(set.datasetId, [...(grouped.get(set.datasetId) || []), set])
  }
  const conflictedDatasetIds: string[] = []
  const sets = [...grouped.entries()].flatMap(([datasetId, candidates]) => {
    if (new Set(candidates.map(setSignature)).size === 1) return [candidates[0]]
    conflictedDatasetIds.push(datasetId)
    return []
  }).sort((left, right) =>
    left.activationDate.localeCompare(right.activationDate)
      || left.instructionalEndDate.localeCompare(right.instructionalEndDate)
      || left.datasetId.localeCompare(right.datasetId))
  return { sets, conflictedDatasetIds: conflictedDatasetIds.sort() }
}

function eventSignature(event: LifecycleProgressionEvent) {
  return JSON.stringify({
    grade: event.grade,
    schoolYearKey: event.schoolYearKey,
    effectiveDate: event.effectiveDate,
    introducedDatasetId: event.introducedDatasetId,
    confirmedDatasetId: event.confirmedDatasetId || null,
  })
}

function acceptedProgressionEvents(context: LifecycleContext, setsById: Map<string, LifecycleSet>) {
  const relevant = context.progressionEvents
    .filter((event) =>
      event.grade === context.scope.grade
      && event.schoolYearKey === context.scope.schoolYearKey
      && event.effectiveDate <= context.scope.currentDateKey)
  const grouped = new Map<string, LifecycleProgressionEvent[]>()
  for (const event of relevant) {
    grouped.set(event.eventId, [...(grouped.get(event.eventId) || []), event])
  }
  const ordered = [...grouped.entries()].map(([eventId, events]) => ({
    eventId,
    events,
    effectiveDate: [...events].sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate))[0].effectiveDate,
    conflicted: new Set(events.map(eventSignature)).size > 1,
  })).sort((left, right) =>
    left.effectiveDate.localeCompare(right.effectiveDate) || left.eventId.localeCompare(right.eventId))

  const accepted: LifecycleProgressionEvent[] = []
  const introduced = new Set<string>()
  for (const group of ordered) {
    if (group.conflicted) break
    const event = group.events[0]
    const set = setsById.get(event.introducedDatasetId)
    const prior = accepted[accepted.length - 1]
    const isBaseline = accepted.length === 0
    const valid = Boolean(set)
      && set!.kind === 'vocabulary'
      && set!.activationDate === event.effectiveDate
      && !introduced.has(event.introducedDatasetId)
      && (isBaseline
        ? event.effectiveDate === GRADE5_ACTIVATION_BASELINE && !event.confirmedDatasetId
        : event.confirmedDatasetId === prior!.introducedDatasetId)
    if (!valid) break
    accepted.push(event)
    introduced.add(event.introducedDatasetId)
  }
  return accepted
}

export function resolveGrade5ProgressionLifecycle(context: LifecycleContext): LifecycleResolution {
  const { sets, conflictedDatasetIds } = scopedSets(context)
  const setsById = new Map(sets.map((set) => [set.datasetId, set]))
  const events = acceptedProgressionEvents(context, setsById)
  const acceptedIds = events.map((event) => event.introducedDatasetId)
  const acceptedIdSet = new Set(acceptedIds)
  const noInstruction = sets.filter((set) => set.kind === 'no-instruction' && set.activationDate <= context.scope.currentDateKey)
  const future = sets.filter((set) => !acceptedIdSet.has(set.datasetId)
    && !(set.kind === 'no-instruction' && set.activationDate <= context.scope.currentDateKey))
  const acquisitionDatasetId = acceptedIds[acceptedIds.length - 1] || null
  const testReviews = [1, 2].flatMap((cycle) => {
    const datasetId = acceptedIds[acceptedIds.length - 1 - cycle]
    return datasetId ? [{ datasetId, cycle }] : []
  })
  const masteryDatasetIds = acceptedIds.slice(0, Math.max(0, acceptedIds.length - 3))
  const assignmentByDatasetId: Record<string, LifecycleAssignment> = {}

  for (const set of sets) {
    assignmentByDatasetId[set.datasetId] = {
      datasetId: set.datasetId,
      stage: set.kind === 'no-instruction' && set.activationDate <= context.scope.currentDateKey
        ? { kind: 'no-instruction' }
        : { kind: 'future' },
    }
  }
  for (const datasetId of conflictedDatasetIds) {
    assignmentByDatasetId[datasetId] = { datasetId, stage: { kind: 'future' } }
  }

  const masteredAtByDatasetId: Record<string, string> = {}
  for (const [index, event] of events.entries()) {
    const stepsBehind = events.length - 1 - index
    const enteredStageOn = stepsBehind === 0
      ? event.effectiveDate
      : events[index + Math.min(stepsBehind, 3)]?.effectiveDate
    const stage = stepsBehind === 0
      ? { kind: 'acquisition' as const }
      : stepsBehind <= 2
        ? { kind: 'test-review' as const, cycle: stepsBehind }
        : { kind: 'mastery' as const }
    assignmentByDatasetId[event.introducedDatasetId] = {
      datasetId: event.introducedDatasetId,
      stage,
      ...(enteredStageOn ? { enteredStageOn } : {}),
    }
    if (stage.kind === 'mastery') {
      const masteredAt = events[index + 3]?.effectiveDate
      if (masteredAt) masteredAtByDatasetId[event.introducedDatasetId] = masteredAt
    }
  }

  return {
    scope: context.scope,
    acquisitionDatasetId,
    testReviews,
    masteryDatasetIds,
    masteredAtByDatasetId,
    futureDatasetIds: [...future.map((set) => set.datasetId), ...conflictedDatasetIds].sort(),
    noInstructionDatasetIds: noInstruction.map((set) => set.datasetId),
    assignmentByDatasetId,
  }
}

export const grade5ProgressionLifecycleStrategy: LifecycleStrategy = {
  profileId: 'grade-5-progression-2026-27',
  version: 1,
  grade: 'Grade 5',
  schoolYearKey: '2026-27',
  resolve: resolveGrade5ProgressionLifecycle,
}
