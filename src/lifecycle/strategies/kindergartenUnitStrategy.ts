import type {
  LifecycleAssignment,
  LifecycleContext,
  LifecycleResolution,
  LifecycleSet,
  LifecycleStrategy,
} from '../contracts.ts'

export type KindergartenUnitBoundary = {
  id: string
  instructionStartDate: string
  instructionEndDate: string
  reviewStartDate: string
  reviewEndDate: string
  reviewCycle: number
}

/**
 * Unit 1 projects the explicit teaching and review boundaries in the
 * authoritative Kindergarten Weekly Focus workbook. Additional units must be
 * grounded in that workbook and added explicitly.
 */
export const kindergarten2026UnitPlan: readonly KindergartenUnitBoundary[] = [
  {
    id: 'kindergarten-2026-27-unit-1',
    instructionStartDate: '2026-08-31',
    instructionEndDate: '2026-09-27',
    reviewStartDate: '2026-09-28',
    reviewEndDate: '2026-10-04',
    reviewCycle: 1,
  },
]

const dateKeyPattern = /^(\d{4})-(\d{2})-(\d{2})$/

function parseDateKey(value: string) {
  const match = dateKeyPattern.exec(value)
  if (!match) throw new Error(`Invalid lifecycle date key: ${value}.`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) throw new Error(`Invalid lifecycle calendar date: ${value}.`)
  return date
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(value: string, days: number) {
  const date = parseDateKey(value)
  date.setUTCDate(date.getUTCDate() + days)
  return dateKey(date)
}

function validateUnitPlan(units: readonly KindergartenUnitBoundary[]) {
  const ordered = [...units].sort((left, right) =>
    left.instructionStartDate.localeCompare(right.instructionStartDate)
      || left.id.localeCompare(right.id),
  )
  const ids = new Set<string>()

  for (const [index, unit] of ordered.entries()) {
    if (!unit.id || ids.has(unit.id)) throw new Error(`Kindergarten unit identity must be unique: ${unit.id || '(missing)'}.`)
    ids.add(unit.id)
    if (parseDateKey(unit.instructionStartDate).getUTCDay() !== 1) {
      throw new Error(`Kindergarten unit ${unit.id} must start on Monday.`)
    }
    if (parseDateKey(unit.instructionEndDate).getUTCDay() !== 0) {
      throw new Error(`Kindergarten unit ${unit.id} must end on Sunday.`)
    }
    if (unit.instructionEndDate < unit.instructionStartDate) {
      throw new Error(`Kindergarten unit ${unit.id} ends before it starts.`)
    }
    if (unit.reviewStartDate !== addDays(unit.instructionEndDate, 1)) {
      throw new Error(`Kindergarten unit ${unit.id} review must begin on the Monday after instruction ends.`)
    }
    if (parseDateKey(unit.reviewStartDate).getUTCDay() !== 1 || unit.reviewEndDate !== addDays(unit.reviewStartDate, 6)) {
      throw new Error(`Kindergarten unit ${unit.id} review must use one Monday-through-Sunday cycle.`)
    }
    if (!Number.isInteger(unit.reviewCycle) || unit.reviewCycle < 1) {
      throw new Error(`Kindergarten unit ${unit.id} must have a positive review cycle.`)
    }
    const prior = ordered[index - 1]
    if (prior && unit.instructionStartDate <= prior.reviewEndDate) {
      throw new Error(`Kindergarten units ${prior.id} and ${unit.id} overlap.`)
    }
  }
  return ordered
}

function scopedSets(context: LifecycleContext) {
  const byId = new Map<string, LifecycleSet>()
  for (const set of context.sets) {
    if (set.grade !== context.scope.grade || set.schoolYearKey !== context.scope.schoolYearKey) continue
    const existing = byId.get(set.datasetId)
    if (existing && (
      existing.grade !== set.grade
      || existing.schoolYearKey !== set.schoolYearKey
      || existing.activationDate !== set.activationDate
      || existing.instructionalEndDate !== set.instructionalEndDate
      || existing.kind !== set.kind
    )) {
      throw new Error(`Conflicting Kindergarten lifecycle set identity: ${set.datasetId}.`)
    }
    if (!existing) byId.set(set.datasetId, set)
  }
  return [...byId.values()].sort((left, right) =>
    left.activationDate.localeCompare(right.activationDate)
      || left.instructionalEndDate.localeCompare(right.instructionalEndDate)
      || left.datasetId.localeCompare(right.datasetId),
  )
}

function unitForSet(set: LifecycleSet, units: readonly KindergartenUnitBoundary[]) {
  if (set.kind !== 'vocabulary') {
    throw new Error(`Kindergarten no-instruction handling is not approved for ${set.datasetId}.`)
  }
  if (parseDateKey(set.activationDate).getUTCDay() !== 1 || set.instructionalEndDate !== addDays(set.activationDate, 6)) {
    throw new Error(`Kindergarten dataset ${set.datasetId} must use one Monday-through-Sunday cycle.`)
  }
  const unit = units.find((candidate) =>
    set.activationDate >= candidate.instructionStartDate
      && set.instructionalEndDate <= candidate.instructionEndDate,
  )
  if (!unit) throw new Error(`Kindergarten dataset ${set.datasetId} is outside the approved unit plan.`)
  return unit
}

export function resolveKindergartenUnitLifecycle(
  context: LifecycleContext,
  unitPlan: readonly KindergartenUnitBoundary[] = kindergarten2026UnitPlan,
): LifecycleResolution {
  parseDateKey(context.scope.currentDateKey)
  const units = validateUnitPlan(unitPlan)
  const sets = scopedSets(context)
  const unitByDatasetId = new Map(sets.map((set) => [set.datasetId, unitForSet(set, units)]))
  const assignmentByDatasetId: Record<string, LifecycleAssignment> = {}
  const masteryDatasetIds: string[] = []
  const masteredAtByDatasetId: Record<string, string> = {}
  const futureDatasetIds: string[] = []
  const testReviews: LifecycleResolution['testReviews'] = []
  let acquisitionDatasetId: string | null = null

  for (const set of sets) {
    const unit = unitByDatasetId.get(set.datasetId)!
    if (context.scope.currentDateKey < set.activationDate) {
      futureDatasetIds.push(set.datasetId)
      assignmentByDatasetId[set.datasetId] = { datasetId: set.datasetId, stage: { kind: 'future' } }
      continue
    }
    if (context.scope.currentDateKey > unit.reviewEndDate) {
      const masteredAt = addDays(unit.reviewEndDate, 1)
      masteryDatasetIds.push(set.datasetId)
      masteredAtByDatasetId[set.datasetId] = masteredAt
      assignmentByDatasetId[set.datasetId] = {
        datasetId: set.datasetId,
        stage: { kind: 'mastery' },
        enteredStageOn: masteredAt,
      }
      continue
    }

    testReviews.push({
      datasetId: set.datasetId,
      cycle: unit.reviewCycle,
      reviewGroupId: unit.id,
    })
    assignmentByDatasetId[set.datasetId] = {
      datasetId: set.datasetId,
      stage: { kind: 'test-review', cycle: unit.reviewCycle },
      enteredStageOn: set.activationDate,
    }
  }

  const activeUnit = units.find((unit) =>
    context.scope.currentDateKey >= unit.instructionStartDate
      && context.scope.currentDateKey <= unit.instructionEndDate,
  )
  if (activeUnit) {
    const arrivedInActiveUnit = sets.filter((set) =>
      unitByDatasetId.get(set.datasetId)?.id === activeUnit.id
        && set.activationDate <= context.scope.currentDateKey,
    )
    const acquisition = arrivedInActiveUnit[arrivedInActiveUnit.length - 1]
    if (acquisition) {
      acquisitionDatasetId = acquisition.datasetId
      assignmentByDatasetId[acquisition.datasetId] = {
        datasetId: acquisition.datasetId,
        stage: { kind: 'acquisition' },
        enteredStageOn: acquisition.activationDate,
      }
    }
  }

  return {
    scope: context.scope,
    acquisitionDatasetId,
    testReviews,
    masteryDatasetIds,
    masteredAtByDatasetId,
    futureDatasetIds,
    noInstructionDatasetIds: [],
    assignmentByDatasetId,
  }
}

export const kindergartenUnitLifecycleStrategy: LifecycleStrategy = {
  profileId: 'kindergarten-unit-lifecycle-2026-27',
  version: 1,
  grade: 'Kindergarten',
  schoolYearKey: '2026-27',
  resolve(context) {
    return resolveKindergartenUnitLifecycle(context)
  },
}
