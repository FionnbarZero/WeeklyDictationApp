import type {
  MasteryDatasetLifecycleAssignment,
  MasteryLifecycleAssignment,
  MasteryOccurrenceStage,
  MasteryTermDefinition,
} from './contracts.ts'

export type LifecycleReconciliationIssue = {
  code: 'invalid-current-assignment' | 'missing-authoritative-assignment' | 'invalid-authoritative-assignment' | 'conflicting-authoritative-assignment' | 'strategy-mismatch'
  message: string
  datasetId?: string
  occurrenceId?: string
}

export type LifecycleReconciliationResult = {
  status: 'unchanged' | 'updated' | 'attention-required' | 'rejected'
  lifecycleAssignments: MasteryLifecycleAssignment[]
  activeOccurrenceCount: number
  issues: LifecycleReconciliationIssue[]
}

function stableSerialize(value: unknown) {
  const stable = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map(stable)
    if (typeof current !== 'object' || current === null) return current
    const record = current as Record<string, unknown>
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, stable(record[key])]))
  }
  return JSON.stringify(stable(value))
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function validStage(value: unknown): value is MasteryOccurrenceStage {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const stage = value as Record<string, unknown>
  if (stage.kind === 'test-review') return Number.isInteger(stage.cycle) && Number(stage.cycle) > 0
  return ['future', 'acquisition', 'mastery', 'no-instruction', 'malformed', 'legacy-active'].includes(String(stage.kind))
}

function validAuthoritativeAssignment(value: unknown): value is MasteryDatasetLifecycleAssignment {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const assignment = value as Record<string, unknown>
  return nonEmptyString(assignment.datasetId)
    && nonEmptyString(assignment.profileId)
    && validStage(assignment.stage)
    && Number.isInteger(assignment.finalTestReviewCycle)
    && Number(assignment.finalTestReviewCycle) > 0
    && (assignment.stage.kind !== 'test-review' || assignment.stage.cycle <= Number(assignment.finalTestReviewCycle))
}

function validCurrentAssignment(value: MasteryLifecycleAssignment) {
  if (!nonEmptyString(value.occurrenceId)) return false
  if (value.status === 'unresolved') return ['missing', 'conflicting', 'invalid', 'strategy-mismatch'].includes(value.reason)
  return nonEmptyString(value.profileId)
    && validStage(value.stage)
    && Number.isInteger(value.finalTestReviewCycle)
    && value.finalTestReviewCycle > 0
    && (value.stage.kind !== 'test-review' || value.stage.cycle <= value.finalTestReviewCycle)
}

function sortedAssignments(assignments: readonly MasteryLifecycleAssignment[]) {
  return [...assignments].sort((left, right) => left.occurrenceId.localeCompare(right.occurrenceId))
}

function countActiveOccurrences(assignments: readonly MasteryLifecycleAssignment[]) {
  return assignments.filter((assignment) => assignment.status === 'resolved'
    && (assignment.stage.kind === 'acquisition'
      || assignment.stage.kind === 'test-review'
      || assignment.stage.kind === 'legacy-active')).length
}

export function reconcileAdaptiveWarmupLifecycle(input: {
  terms: readonly MasteryTermDefinition[]
  currentAssignments: readonly MasteryLifecycleAssignment[]
  authoritativeAssignments: readonly MasteryDatasetLifecycleAssignment[]
}): LifecycleReconciliationResult {
  const issues: LifecycleReconciliationIssue[] = []
  const occurrences = input.terms.flatMap((term) => term.occurrences).sort((left, right) => left.occurrenceId.localeCompare(right.occurrenceId))
  const occurrenceIds = new Set<string>()
  for (const occurrence of occurrences) {
    if (occurrenceIds.has(occurrence.occurrenceId)) {
      issues.push({ code: 'invalid-current-assignment', message: `Occurrence ${occurrence.occurrenceId} is duplicated in the mastery graph.`, occurrenceId: occurrence.occurrenceId })
    }
    occurrenceIds.add(occurrence.occurrenceId)
  }

  const currentByOccurrence = new Map<string, MasteryLifecycleAssignment>()
  for (const assignment of input.currentAssignments) {
    if (!validCurrentAssignment(assignment) || !occurrenceIds.has(assignment.occurrenceId) || currentByOccurrence.has(assignment.occurrenceId)) {
      issues.push({ code: 'invalid-current-assignment', message: `Current lifecycle assignment ${assignment.occurrenceId} is malformed, duplicated, or has no occurrence.`, occurrenceId: assignment.occurrenceId })
      continue
    }
    currentByOccurrence.set(assignment.occurrenceId, assignment)
  }
  for (const occurrenceId of occurrenceIds) {
    if (!currentByOccurrence.has(occurrenceId)) issues.push({ code: 'invalid-current-assignment', message: `Occurrence ${occurrenceId} has no current lifecycle assignment.`, occurrenceId })
  }
  if (issues.length > 0) {
    const lifecycleAssignments = sortedAssignments(occurrences.map((occurrence) => ({ occurrenceId: occurrence.occurrenceId, status: 'unresolved' as const, reason: 'invalid' as const })))
    return { status: 'rejected', lifecycleAssignments, activeOccurrenceCount: countActiveOccurrences(lifecycleAssignments), issues }
  }

  const authoritativeGroups = new Map<string, unknown[]>()
  for (const assignment of [...input.authoritativeAssignments].sort((left, right) => stableSerialize(left).localeCompare(stableSerialize(right)))) {
    const key = nonEmptyString(assignment.datasetId) ? assignment.datasetId : `invalid:${stableSerialize(assignment)}`
    authoritativeGroups.set(key, [...(authoritativeGroups.get(key) || []), assignment])
  }
  const authoritativeByDataset = new Map<string, MasteryDatasetLifecycleAssignment>()
  const invalidDatasets = new Map<string, 'invalid' | 'conflicting'>()
  for (const [datasetId, group] of authoritativeGroups) {
    if (datasetId.startsWith('invalid:') || !group.every(validAuthoritativeAssignment)) {
      issues.push({ code: 'invalid-authoritative-assignment', message: `Authoritative lifecycle assignment ${datasetId} is invalid.`, datasetId })
      if (!datasetId.startsWith('invalid:')) invalidDatasets.set(datasetId, 'invalid')
      continue
    }
    const distinct = new Map(group.map((assignment) => [stableSerialize(assignment), assignment as MasteryDatasetLifecycleAssignment]))
    if (distinct.size !== 1) {
      issues.push({ code: 'conflicting-authoritative-assignment', message: `Dataset ${datasetId} has conflicting authoritative lifecycle assignments.`, datasetId })
      invalidDatasets.set(datasetId, 'conflicting')
      continue
    }
    authoritativeByDataset.set(datasetId, [...distinct.values()][0])
  }

  const reportedMissing = new Set<string>()
  const next = occurrences.map((occurrence): MasteryLifecycleAssignment => {
    const authoritative = authoritativeByDataset.get(occurrence.datasetId)
    if (!authoritative) {
      if (!invalidDatasets.has(occurrence.datasetId) && !reportedMissing.has(occurrence.datasetId)) {
        issues.push({ code: 'missing-authoritative-assignment', message: `Dataset ${occurrence.datasetId} has no authoritative lifecycle assignment.`, datasetId: occurrence.datasetId })
        reportedMissing.add(occurrence.datasetId)
      }
      return { occurrenceId: occurrence.occurrenceId, status: 'unresolved', reason: invalidDatasets.get(occurrence.datasetId) || 'missing' }
    }
    const current = currentByOccurrence.get(occurrence.occurrenceId)!
    if (current.status === 'resolved'
      && (current.profileId !== authoritative.profileId || current.finalTestReviewCycle !== authoritative.finalTestReviewCycle)) {
      issues.push({ code: 'strategy-mismatch', message: `Lifecycle strategy identity changed for occurrence ${occurrence.occurrenceId}.`, datasetId: occurrence.datasetId, occurrenceId: occurrence.occurrenceId })
      return { occurrenceId: occurrence.occurrenceId, status: 'unresolved', reason: 'strategy-mismatch' }
    }
    return {
      occurrenceId: occurrence.occurrenceId,
      status: 'resolved',
      profileId: authoritative.profileId,
      stage: authoritative.stage,
      finalTestReviewCycle: authoritative.finalTestReviewCycle,
    }
  })
  const lifecycleAssignments = sortedAssignments(next)
  const unchanged = stableSerialize(lifecycleAssignments) === stableSerialize(sortedAssignments(input.currentAssignments))
  const status = issues.length > 0 ? 'attention-required' : unchanged ? 'unchanged' : 'updated'
  return { status, lifecycleAssignments, activeOccurrenceCount: countActiveOccurrences(lifecycleAssignments), issues }
}
