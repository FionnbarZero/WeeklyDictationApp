import { acquisitionPersistenceContext, recoverAcquisitionCheckpoints } from '../acquisitionPersistence.ts'
import { grade2AdaptiveWarmupRegistry, recoverWarmupTransitions } from '../warmup/index.ts'
import { acquisitionTransitionId } from '../../acquisition/persistence/identity.ts'
import { migrateAcquisitionProgress } from '../../acquisition/persistence/migration.ts'
import { validateAcquisitionProgressEnvelope } from '../../acquisition/persistence/validation.ts'
import { grade2AcquisitionStrategy } from '../../acquisition/strategies/grade2.ts'
import { isAppState, type AppState } from '../../domain.ts'
import type { ApplicationBackup } from '../../persistence/applicationBackup.ts'
import type { PendingAcquisitionCommit } from '../../persistence/acquisitionPendingJournal.ts'
import type { PendingWarmupCommit } from '../../persistence/warmup/pendingJournal.ts'
import type { AdaptiveWarmupV3Projection } from '../../warmup/adaptive/migration.ts'
import { validateAdaptiveWarmupV3Projection } from '../../warmup/adaptive/validation.ts'
import { validateWarmupVisit } from '../../warmup/visits/validation.ts'

export type SelectedChildRestoreSnapshot = {
  state: AppState
  pendingAcquisition: PendingAcquisitionCommit[]
  pendingWarmup: PendingWarmupCommit[]
}

export type SelectedChildRestoreReport = {
  childId: string
  before: {
    practiceRecords: number
    acquisitionRecords: number
    warmupRecords: number
    pendingRecovery: number
  }
  after: {
    practiceRecords: number
    acquisitionRecords: number
    warmupRecords: number
    pendingRecovery: number
  }
  preservedOtherChildRecords: number
  addedHistoricalDatasets: number
  changed: boolean
}

export type SelectedChildRestorePlan = {
  snapshot: SelectedChildRestoreSnapshot
  report: SelectedChildRestoreReport
}

type JsonRecord = Record<string, unknown>

function record(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!record(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  )
}

function stableSerialize(value: unknown) {
  return JSON.stringify(stableValue(value))
}

function canonicalTimestamp(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function nonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function assertUnique(
  values: readonly unknown[],
  label: string,
  identity: (value: JsonRecord) => unknown = (value) => value.id,
) {
  const seen = new Set<string>()
  for (const value of values) {
    if (!record(value) || !nonEmpty(identity(value)))
      throw new Error(`${label} contains a record without a stable identity.`)
    const id = String(identity(value))
    if (seen.has(id)) throw new Error(`${label} contains duplicate identity ${id}.`)
    seen.add(id)
  }
}

function selected<T extends { childId: string }>(values: readonly T[] | undefined, childId: string) {
  return (values || []).filter((value) => value.childId === childId)
}

function replaceSelected<T extends { childId: string }>(
  current: readonly T[] | undefined,
  backup: readonly T[] | undefined,
  childId: string,
) {
  return [...(current || []).filter((value) => value.childId !== childId), ...selected(backup, childId)]
}

function mergeDatasets(current: AppState, backup: AppState) {
  assertUnique(current.datasets, 'Current datasets')
  assertUnique(backup.datasets, 'Backup datasets')
  const currentById = new Map(current.datasets.map((dataset) => [dataset.id, dataset]))
  const additions = backup.datasets.filter((dataset) => {
    const existing = currentById.get(dataset.id)
    if (existing && stableSerialize(existing) !== stableSerialize(dataset)) {
      throw new Error(`Dataset ${dataset.id} conflicts with the current shared curriculum.`)
    }
    return !existing
  })
  const datasets = [...current.datasets, ...additions]
  const references = new Map(
    (current.datasetImportReferences || []).map((reference) => [reference.datasetId, reference]),
  )
  const additionIds = new Set(additions.map((dataset) => dataset.id))
  for (const reference of backup.datasetImportReferences || []) {
    if (additionIds.has(reference.datasetId) && !references.has(reference.datasetId))
      references.set(reference.datasetId, reference)
  }
  return { datasets, datasetImportReferences: [...references.values()], addedHistoricalDatasets: additions.length }
}

function mergeAdaptiveProjection(
  current: AdaptiveWarmupV3Projection | undefined,
  backup: AdaptiveWarmupV3Projection | undefined,
  childId: string,
) {
  if (!current && !backup) return undefined
  const source = current || backup!
  const terms = new Map((current?.terms || []).map((term) => [term.id, term]))
  for (const term of backup?.terms || []) {
    const existing = terms.get(term.id)
    if (existing && stableSerialize(existing) !== stableSerialize(term)) {
      throw new Error(`Adaptive Warmup term ${term.id} conflicts with current shared curriculum.`)
    }
    if (!existing) terms.set(term.id, term)
  }
  const assignments = new Map(
    (current?.lifecycleAssignments || []).map((assignment) => [assignment.occurrenceId, assignment]),
  )
  for (const assignment of backup?.lifecycleAssignments || []) {
    if (!assignments.has(assignment.occurrenceId)) assignments.set(assignment.occurrenceId, assignment)
  }
  const childStates = replaceSelected(current?.childStates, backup?.childStates, childId)
  const rotationStates = replaceSelected(current?.rotationStates, backup?.rotationStates, childId)
  const deferredRecords = replaceSelected(current?.deferredRecords, backup?.deferredRecords, childId)
  const legacyMonthlyRotationScores = [
    ...(current?.legacyMonthlyRotationScores || []).filter((value) => !record(value) || value.childId !== childId),
    ...(backup?.legacyMonthlyRotationScores || []).filter((value) => record(value) && value.childId === childId),
  ]
  const occurrenceCount = [...terms.values()].reduce((total, term) => total + term.occurrences.length, 0)
  const activeOccurrenceCount = [...assignments.values()].filter(
    (assignment) =>
      assignment.status === 'resolved' &&
      ['acquisition', 'test-review', 'legacy-active'].includes(assignment.stage.kind),
  ).length
  const projection: AdaptiveWarmupV3Projection = {
    ...source,
    migrationStatus: deferredRecords.length > 0 ? 'partial' : 'complete',
    terms: [...terms.values()],
    lifecycleAssignments: [...assignments.values()],
    childStates,
    rotationStates,
    deferredRecords,
    legacyMonthlyRotationScores,
    migrationReport: {
      ...source.migrationReport,
      migratedTermCount: terms.size,
      migratedChildStateCount: childStates.length,
      migratedOccurrenceCount: occurrenceCount,
      activeOccurrenceCount,
      preservedLegacyMonthlyScoreCount: legacyMonthlyRotationScores.length,
      deferredRecordCount: deferredRecords.length,
    },
  }
  const validation = validateAdaptiveWarmupV3Projection(projection, { profileRegistry: grade2AdaptiveWarmupRegistry })
  if (!validation.valid) throw new Error(`Adaptive Warmup restore validation failed. ${validation.errors[0]}`)
  return projection
}

function progressionIdsForChild(state: AppState, childId: string) {
  return new Set(selected(state.acquisitionProgressEnvelopes, childId).map((value) => value.id))
}

function visitIdsForChild(state: AppState, childId: string) {
  return new Set(selected(state.warmupVisitsV1, childId).map((visit) => visit.id))
}

function replaceOwnedByReference<T>(
  current: readonly T[] | undefined,
  backup: readonly T[] | undefined,
  currentSelectedIds: ReadonlySet<string>,
  backupSelectedIds: ReadonlySet<string>,
  reference: (value: T) => string,
) {
  return [
    ...(current || []).filter((value) => !currentSelectedIds.has(reference(value))),
    ...(backup || []).filter((value) => backupSelectedIds.has(reference(value))),
  ]
}

function validateDatasetReferences(state: AppState, childId: string) {
  const datasets = new Map(state.datasets.map((dataset) => [dataset.id, dataset]))
  const words = new Map(state.datasets.flatMap((dataset) => dataset.words.map((word) => [word.id, word] as const)))
  const requireDataset = (datasetId: string, label: string) => {
    if (!datasets.has(datasetId)) throw new Error(`${label} references missing dataset ${datasetId}.`)
  }
  const requireWord = (datasetId: string, wordId: string, label: string) => {
    const word = words.get(wordId)
    if (!word || word.datasetId !== datasetId)
      throw new Error(`${label} references missing or mismatched word ${wordId}.`)
  }
  const requireDistractorTarget = (value: AppState['distractorTargetObservations'][number]) => {
    const dataset = datasets.get(value.datasetId)
    if (!dataset) throw new Error(`Distractor observation ${value.id} references a missing dataset.`)
    if (value.poolType === 'familiar') {
      const familiarTarget = acquisitionPersistenceContext(
        value.childId,
        dataset,
        dataset.grade,
      ).strategy.familiarDtTargets.find((target) => target.id === value.wordId)
      if (!familiarTarget || familiarTarget.text !== value.text) {
        throw new Error(`Distractor observation ${value.id} references an invalid Familiar DT.`)
      }
      return
    }
    const earnedTarget = words.get(value.wordId)
    if (!earnedTarget || earnedTarget.datasetId !== value.datasetId || earnedTarget.text !== value.text) {
      throw new Error(`Distractor observation ${value.id} references a missing or mismatched Earned DT.`)
    }
  }
  for (const value of selected(state.results, childId)) {
    requireDataset(value.datasetId, `Result ${value.id}`)
    requireWord(value.datasetId, value.wordId, `Result ${value.id}`)
  }
  for (const value of selected(state.scores, childId)) requireDataset(value.datasetId, `Score ${value.id}`)
  for (const value of selected(state.completedSessions, childId)) {
    requireDataset(value.primaryDatasetId, `Completed session ${value.id}`)
    for (const datasetId of value.primaryDatasetIds || []) requireDataset(datasetId, `Completed session ${value.id}`)
  }
  for (const value of selected(state.warmupSessions, childId)) {
    for (const datasetId of [...value.datasetIds, ...value.completeDatasetIds])
      requireDataset(datasetId, `Warmup session ${value.id}`)
    for (const wordId of value.wordIds)
      if (!words.has(wordId)) throw new Error(`Warmup session ${value.id} references missing word ${wordId}.`)
  }
  for (const value of selected(state.childWordStates, childId))
    requireWord(value.datasetId, value.wordId, `Word state ${value.id}`)
  for (const value of selected(state.acquisitionProgressions, childId))
    requireDataset(value.datasetId, `Acquisition progression ${value.id}`)
  for (const value of selected(state.acquisitionProgressQuarantine, childId))
    requireDataset(value.datasetId, `Acquisition quarantine ${value.id}`)
  for (const value of selected(state.distractorTargetObservations, childId)) requireDistractorTarget(value)
}

function validateAcquisition(state: AppState, childId: string, pending: readonly PendingAcquisitionCommit[]) {
  const datasets = new Map(state.datasets.map((dataset) => [dataset.id, dataset]))
  const progressions = new Map<string, { childId: string }>()
  for (const progression of state.acquisitionProgressions) progressions.set(progression.id, progression)
  for (const envelope of state.acquisitionProgressEnvelopes || []) {
    progressions.set(envelope.id, envelope)
    if (envelope.childId !== childId) continue
    const dataset = datasets.get(envelope.datasetId)
    if (!dataset) throw new Error(`Acquisition progression ${envelope.id} has no canonical dataset.`)
    const validation = validateAcquisitionProgressEnvelope(
      envelope,
      acquisitionPersistenceContext(childId, dataset, envelope.grade),
    )
    if (!validation.valid)
      throw new Error(`Acquisition progression ${envelope.id} is malformed. ${validation.errors[0]}`)
  }
  assertUnique(state.acquisitionTransitionReceipts || [], 'Acquisition receipts', (value) => value.transitionId)
  for (const receipt of state.acquisitionTransitionReceipts || []) {
    const owner = progressions.get(receipt.progressionId)
    if (!owner) throw new Error(`Acquisition receipt ${receipt.transitionId} is orphaned.`)
    if (owner.childId !== childId) continue
    if (
      !nonEmpty(receipt.transitionId) ||
      !nonEmpty(receipt.payloadFingerprint) ||
      !nonEmpty(receipt.promptId) ||
      !['answer', 'resume-dt-practice'].includes(receipt.operation) ||
      !nonNegativeInteger(receipt.expectedRevision) ||
      receipt.appliedRevision !== receipt.expectedRevision + 1 ||
      !canonicalTimestamp(receipt.appliedAt) ||
      receipt.transitionId !==
        acquisitionTransitionId(receipt.progressionId, receipt.expectedRevision, receipt.operation, receipt.promptId)
    ) {
      throw new Error(`Acquisition receipt ${receipt.transitionId || '(missing)'} is malformed.`)
    }
  }
  assertUnique(
    state.acquisitionPendingCheckpoints || [],
    'Acquisition pending checkpoints',
    (value) => value.transitionId,
  )
  for (const checkpoint of state.acquisitionPendingCheckpoints || []) {
    const owner = progressions.get(checkpoint.progressionId)
    if (!owner) throw new Error(`Acquisition checkpoint ${checkpoint.transitionId} is orphaned.`)
    if (owner.childId !== childId) continue
    if (
      !nonEmpty(checkpoint.transitionId) ||
      !nonEmpty(checkpoint.payloadFingerprint) ||
      !nonNegativeInteger(checkpoint.expectedRevision) ||
      checkpoint.nextRevision !== checkpoint.expectedRevision + 1 ||
      !canonicalTimestamp(checkpoint.occurredAt) ||
      !record(checkpoint.nextFlow)
    )
      throw new Error(`Acquisition checkpoint ${checkpoint.transitionId || '(missing)'} is malformed.`)
  }
  for (const entry of pending) {
    if (entry.baseEnvelope.childId !== childId) continue
    const dataset = datasets.get(entry.baseEnvelope.datasetId)
    if (!dataset)
      throw new Error(`Pending Acquisition transition ${entry.checkpoint.transitionId} has no canonical dataset.`)
    const validation = validateAcquisitionProgressEnvelope(
      entry.baseEnvelope,
      acquisitionPersistenceContext(childId, dataset, entry.baseEnvelope.grade),
    )
    if (!validation.valid)
      throw new Error(`Pending Acquisition base ${entry.baseEnvelope.id} is malformed. ${validation.errors[0]}`)
  }
  const recovered = recoverAcquisitionCheckpoints(
    state,
    pending.filter((entry) => entry.baseEnvelope.childId === childId),
  )
  if (recovered.status === 'blocked') throw new Error(`Pending Acquisition recovery is invalid. ${recovered.reason}`)
}

function validateWarmup(state: AppState, childId: string, pending: readonly PendingWarmupCommit[]) {
  const visits = new Map((state.warmupVisitsV1 || []).map((visit) => [visit.id, visit]))
  assertUnique(state.warmupVisitsV1 || [], 'Warmup visits')
  for (const visit of selected(state.warmupVisitsV1, childId)) {
    const validation = validateWarmupVisit(visit, grade2AdaptiveWarmupRegistry)
    if (!validation.valid) throw new Error(`Warmup visit ${visit.id} is malformed. ${validation.errors[0]}`)
  }
  assertUnique(state.warmupAttemptsV1 || [], 'Warmup attempts')
  for (const attempt of state.warmupAttemptsV1 || []) {
    const visit = visits.get(attempt.visitId)
    if (!visit) throw new Error(`Warmup attempt ${attempt.id} is orphaned.`)
    if (visit.childId !== attempt.childId)
      throw new Error(`Warmup attempt ${attempt.id} belongs to a different child than its visit.`)
  }
  assertUnique(state.warmupTransitionReceiptsV1 || [], 'Warmup receipts', (value) => value.transitionId)
  for (const receipt of state.warmupTransitionReceiptsV1 || []) {
    const visit = visits.get(receipt.visitId)
    if (!visit) throw new Error(`Warmup receipt ${receipt.transitionId} is orphaned.`)
    if (visit.childId !== childId) continue
    if (
      !nonEmpty(receipt.transitionId) ||
      !nonEmpty(receipt.payloadFingerprint) ||
      !['answer', 'mark-unavailable', 'finalize-partial', 'skip'].includes(receipt.operation) ||
      !nonNegativeInteger(receipt.expectedVisitRevision) ||
      receipt.appliedVisitRevision !== receipt.expectedVisitRevision + 1 ||
      !canonicalTimestamp(receipt.appliedAt)
    )
      throw new Error(`Warmup receipt ${receipt.transitionId || '(missing)'} is malformed.`)
  }
  assertUnique(state.warmupGraphPointsV1 || [], 'Warmup graph points')
  for (const point of state.warmupGraphPointsV1 || []) {
    const visit = visits.get(point.visitId)
    if (!visit) throw new Error(`Warmup graph point ${point.id} is orphaned.`)
    if (visit.childId !== point.childId)
      throw new Error(`Warmup graph point ${point.id} belongs to a different child than its visit.`)
  }
  assertUnique(state.warmupPendingTransitionsV1 || [], 'Warmup pending transitions', (value) => value.transitionId)
  for (const transition of state.warmupPendingTransitionsV1 || []) {
    if (transition.nextVisit.childId !== childId) continue
    const validation = validateWarmupVisit(transition.nextVisit, grade2AdaptiveWarmupRegistry)
    if (
      !validation.valid ||
      transition.visitId !== transition.nextVisit.id ||
      transition.nextVisitRevision !== transition.expectedVisitRevision + 1 ||
      transition.nextVisit.revision !== transition.nextVisitRevision ||
      !transition.nextVisit.lastAppliedTransition ||
      transition.nextVisit.lastAppliedTransition.transitionId !== transition.transitionId
    ) {
      throw new Error(`Warmup pending transition ${transition.transitionId} is malformed.`)
    }
  }
  for (const entry of pending) {
    if (entry.baseVisit.childId !== childId) continue
    const validation = validateWarmupVisit(entry.baseVisit, grade2AdaptiveWarmupRegistry)
    if (!validation.valid)
      throw new Error(`Pending Warmup base visit ${entry.baseVisit.id} is malformed. ${validation.errors[0]}`)
    if (entry.transition.nextVisit.childId !== childId)
      throw new Error(`Pending Warmup transition ${entry.transition.transitionId} crosses child profiles.`)
  }
  const recovered = recoverWarmupTransitions(
    state,
    pending.filter((entry) => entry.baseVisit.childId === childId),
  )
  if (recovered.status === 'blocked') throw new Error(`Pending Warmup recovery is invalid. ${recovered.reason}`)
}

function recordCounts(
  state: AppState,
  childId: string,
  pendingAcquisition: readonly PendingAcquisitionCommit[],
  pendingWarmup: readonly PendingWarmupCommit[],
) {
  const progressionIds = progressionIdsForChild(state, childId)
  const visitIds = visitIdsForChild(state, childId)
  const adaptive = state.adaptiveWarmup
  return {
    practiceRecords:
      selected(state.results, childId).length +
      selected(state.scores, childId).length +
      selected(state.warmupSessions, childId).length +
      selected(state.completedSessions, childId).length +
      selected(state.legacyRecords, childId).length +
      selected(state.childWordStates, childId).length +
      selected(state.monthlyRotationScores, childId).length +
      selected(state.distractorTargetObservations, childId).length,
    acquisitionRecords:
      selected(state.acquisitionProgressions, childId).length +
      selected(state.acquisitionProgressEnvelopes, childId).length +
      (state.acquisitionTransitionReceipts || []).filter((value) => progressionIds.has(value.progressionId)).length +
      (state.acquisitionPendingCheckpoints || []).filter((value) => progressionIds.has(value.progressionId)).length +
      selected(state.acquisitionProgressQuarantine, childId).length,
    warmupRecords:
      selected(state.warmupVisitsV1, childId).length +
      selected(state.warmupAttemptsV1, childId).length +
      (state.warmupTransitionReceiptsV1 || []).filter((value) => visitIds.has(value.visitId)).length +
      selected(state.warmupGraphPointsV1, childId).length +
      (state.warmupPendingTransitionsV1 || []).filter((value) => value.nextVisit.childId === childId).length +
      selected(state.warmupCloudQuarantineV1, childId).length +
      (adaptive
        ? selected(adaptive.childStates, childId).length +
          selected(adaptive.rotationStates, childId).length +
          selected(adaptive.deferredRecords, childId).length
        : 0),
    pendingRecovery:
      pendingAcquisition.filter((entry) => entry.baseEnvelope.childId === childId).length +
      pendingWarmup.filter((entry) => entry.baseVisit.childId === childId).length,
  }
}

function totalOwnedRecords(
  state: AppState,
  pendingAcquisition: readonly PendingAcquisitionCommit[],
  pendingWarmup: readonly PendingWarmupCommit[],
) {
  const childIds = new Set<string>()
  const direct = [
    state.results,
    state.scores,
    state.warmupSessions,
    state.completedSessions,
    state.legacyRecords,
    state.childWordStates,
    state.monthlyRotationScores,
    state.acquisitionProgressions,
    state.acquisitionProgressEnvelopes || [],
    state.acquisitionProgressQuarantine || [],
    state.warmupVisitsV1 || [],
    state.warmupAttemptsV1 || [],
    state.warmupGraphPointsV1 || [],
    state.warmupCloudQuarantineV1 || [],
    state.distractorTargetObservations,
  ]
  for (const values of direct) for (const value of values) childIds.add(value.childId)
  for (const value of state.adaptiveWarmup?.childStates || []) childIds.add(value.childId)
  for (const value of state.adaptiveWarmup?.rotationStates || []) childIds.add(value.childId)
  for (const value of state.adaptiveWarmup?.deferredRecords || []) childIds.add(value.childId)
  for (const entry of pendingAcquisition) childIds.add(entry.baseEnvelope.childId)
  for (const entry of pendingWarmup) childIds.add(entry.baseVisit.childId)
  return [...childIds].reduce((total, childId) => {
    const counts = recordCounts(state, childId, pendingAcquisition, pendingWarmup)
    return total + counts.practiceRecords + counts.acquisitionRecords + counts.warmupRecords + counts.pendingRecovery
  }, 0)
}

function validateBackupOwnership(state: AppState) {
  const datasets = new Map(state.datasets.map((dataset) => [dataset.id, dataset]))
  const progressionIds = new Set((state.acquisitionProgressEnvelopes || []).map((value) => value.id))
  for (const progression of state.acquisitionProgressions) {
    if (
      !nonEmpty(progression.id) ||
      !nonEmpty(progression.childId) ||
      !nonEmpty(progression.datasetId) ||
      !record(progression.flow)
    ) {
      throw new Error('A legacy Acquisition progression is malformed.')
    }
    if (!datasets.has(progression.datasetId))
      throw new Error(`Acquisition progression ${progression.id} has no canonical dataset.`)
    const dataset = datasets.get(progression.datasetId)!
    const validation = migrateAcquisitionProgress(
      progression,
      acquisitionPersistenceContext(progression.childId, dataset, progression.grade),
    )
    if (validation.status === 'quarantined') {
      throw new Error(`Legacy Acquisition progression ${progression.id} is malformed. ${validation.reason}`)
    }
  }
  for (const envelope of state.acquisitionProgressEnvelopes || []) {
    if (
      !record(envelope) ||
      !nonEmpty(envelope.id) ||
      !nonEmpty(envelope.childId) ||
      !nonEmpty(envelope.datasetId) ||
      !nonEmpty(envelope.grade)
    ) {
      throw new Error('A versioned Acquisition progression is malformed.')
    }
    const dataset = datasets.get(envelope.datasetId)
    if (!dataset) throw new Error(`Acquisition progression ${envelope.id} has no canonical dataset.`)
    const validation = validateAcquisitionProgressEnvelope(
      envelope,
      acquisitionPersistenceContext(envelope.childId, dataset, envelope.grade),
    )
    if (!validation.valid)
      throw new Error(`Acquisition progression ${envelope.id} is malformed. ${validation.errors[0]}`)
  }
  for (const receipt of state.acquisitionTransitionReceipts || []) {
    if (!progressionIds.has(receipt.progressionId))
      throw new Error(`Acquisition receipt ${receipt.transitionId} is orphaned.`)
    if (
      !nonEmpty(receipt.transitionId) ||
      !nonEmpty(receipt.payloadFingerprint) ||
      !nonEmpty(receipt.promptId) ||
      !['answer', 'resume-dt-practice'].includes(receipt.operation) ||
      !nonNegativeInteger(receipt.expectedRevision) ||
      receipt.appliedRevision !== receipt.expectedRevision + 1 ||
      !canonicalTimestamp(receipt.appliedAt) ||
      receipt.transitionId !==
        acquisitionTransitionId(receipt.progressionId, receipt.expectedRevision, receipt.operation, receipt.promptId)
    ) {
      throw new Error(`Acquisition receipt ${receipt.transitionId || '(missing)'} is malformed.`)
    }
  }
  for (const checkpoint of state.acquisitionPendingCheckpoints || []) {
    if (!progressionIds.has(checkpoint.progressionId))
      throw new Error(`Acquisition checkpoint ${checkpoint.transitionId} is orphaned.`)
    if (
      !nonEmpty(checkpoint.transitionId) ||
      !nonEmpty(checkpoint.payloadFingerprint) ||
      !['answer', 'resume-dt-practice'].includes(checkpoint.operation) ||
      !nonNegativeInteger(checkpoint.expectedRevision) ||
      checkpoint.nextRevision !== checkpoint.expectedRevision + 1 ||
      !canonicalTimestamp(checkpoint.occurredAt) ||
      !record(checkpoint.nextFlow)
    )
      throw new Error(`Acquisition checkpoint ${checkpoint.transitionId || '(missing)'} is malformed.`)
  }
  const visits = new Map((state.warmupVisitsV1 || []).map((visit) => [visit.id, visit]))
  for (const visit of state.warmupVisitsV1 || []) {
    const validation = validateWarmupVisit(visit, grade2AdaptiveWarmupRegistry)
    if (!validation.valid)
      throw new Error(`Warmup visit ${visit.id || '(missing)'} is malformed. ${validation.errors[0]}`)
  }
  for (const receipt of state.warmupTransitionReceiptsV1 || []) {
    if (!visits.has(receipt.visitId)) throw new Error(`Warmup receipt ${receipt.transitionId} is orphaned.`)
    if (
      !nonEmpty(receipt.transitionId) ||
      !nonEmpty(receipt.payloadFingerprint) ||
      !['answer', 'mark-unavailable', 'finalize-partial', 'skip'].includes(receipt.operation) ||
      !nonNegativeInteger(receipt.expectedVisitRevision) ||
      receipt.appliedVisitRevision !== receipt.expectedVisitRevision + 1 ||
      !canonicalTimestamp(receipt.appliedAt)
    )
      throw new Error(`Warmup receipt ${receipt.transitionId || '(missing)'} is malformed.`)
  }
  for (const attempt of state.warmupAttemptsV1 || []) {
    const visit = visits.get(attempt.visitId)
    if (!visit) throw new Error(`Warmup attempt ${attempt.id} is orphaned.`)
    if (visit.childId !== attempt.childId) throw new Error(`Warmup attempt ${attempt.id} crosses child profiles.`)
    if (
      !nonEmpty(attempt.id) ||
      !nonEmpty(attempt.transitionId) ||
      !nonEmpty(attempt.queueEntryId) ||
      !nonEmpty(attempt.masteryTermId) ||
      !nonEmpty(attempt.wordId) ||
      !nonEmpty(attempt.datasetId) ||
      typeof attempt.correct !== 'boolean' ||
      !canonicalTimestamp(attempt.reviewedAt)
    )
      throw new Error(`Warmup attempt ${attempt.id || '(missing)'} is malformed.`)
  }
  for (const point of state.warmupGraphPointsV1 || []) {
    const visit = visits.get(point.visitId)
    if (!visit) throw new Error(`Warmup graph point ${point.id} is orphaned.`)
    if (visit.childId !== point.childId) throw new Error(`Warmup graph point ${point.id} crosses child profiles.`)
    if (
      !nonEmpty(point.id) ||
      !nonEmpty(point.localDate) ||
      !nonEmpty(point.grade) ||
      !nonEmpty(point.activityModule) ||
      !nonNegativeInteger(point.attemptedCount) ||
      !nonNegativeInteger(point.correctCount) ||
      !nonNegativeInteger(point.percent) ||
      !canonicalTimestamp(point.updatedAt)
    )
      throw new Error(`Warmup graph point ${point.id || '(missing)'} is malformed.`)
  }
  for (const transition of state.warmupPendingTransitionsV1 || []) {
    if (!record(transition) || !record(transition.nextVisit) || !nonEmpty(transition.transitionId))
      throw new Error('A pending Warmup transition is malformed.')
    const validation = validateWarmupVisit(transition.nextVisit, grade2AdaptiveWarmupRegistry)
    if (
      !validation.valid ||
      transition.visitId !== transition.nextVisit.id ||
      transition.nextVisitRevision !== transition.expectedVisitRevision + 1 ||
      transition.nextVisit.revision !== transition.nextVisitRevision ||
      !transition.nextVisit.lastAppliedTransition ||
      transition.nextVisit.lastAppliedTransition.transitionId !== transition.transitionId
    ) {
      throw new Error(`Warmup pending transition ${transition.transitionId} is malformed.`)
    }
  }
  if (state.adaptiveWarmup) {
    const validation = validateAdaptiveWarmupV3Projection(state.adaptiveWarmup, {
      profileRegistry: grade2AdaptiveWarmupRegistry,
    })
    if (!validation.valid) throw new Error(`Adaptive Warmup backup data is malformed. ${validation.errors[0]}`)
    const masteryIds = new Set(state.adaptiveWarmup.childStates.map((value) => value.id))
    for (const id of Object.keys(state.warmupMasteryRevisionsV1 || {})) {
      if (!masteryIds.has(id)) throw new Error(`Warmup mastery revision ${id} is orphaned.`)
    }
  } else if (Object.keys(state.warmupMasteryRevisionsV1 || {}).length > 0) {
    throw new Error('Warmup mastery revisions exist without an Adaptive Warmup projection.')
  }
}

function validateBackupJournals(
  state: AppState,
  acquisition: readonly PendingAcquisitionCommit[],
  warmup: readonly PendingWarmupCommit[],
) {
  const datasets = new Map(state.datasets.map((dataset) => [dataset.id, dataset]))
  for (const entry of acquisition) {
    const base = entry.baseEnvelope
    if (!record(base) || !nonEmpty(base.childId) || !nonEmpty(base.datasetId) || !nonEmpty(base.grade))
      throw new Error('A pending Acquisition base envelope is malformed.')
    const dataset = datasets.get(base.datasetId)
    if (!dataset)
      throw new Error(`Pending Acquisition transition ${entry.checkpoint.transitionId} has no canonical dataset.`)
    const validation = validateAcquisitionProgressEnvelope(
      base,
      acquisitionPersistenceContext(base.childId, dataset, base.grade),
    )
    if (!validation.valid) throw new Error(`Pending Acquisition base ${base.id} is malformed. ${validation.errors[0]}`)
  }
  for (const entry of warmup) {
    const validation = validateWarmupVisit(entry.baseVisit, grade2AdaptiveWarmupRegistry)
    if (!validation.valid)
      throw new Error(
        `Pending Warmup base visit ${entry.baseVisit.id || '(missing)'} is malformed. ${validation.errors[0]}`,
      )
    if (entry.transition.nextVisit.childId !== entry.baseVisit.childId)
      throw new Error(`Pending Warmup transition ${entry.transition.transitionId} crosses child profiles.`)
  }
}

export function planSelectedChildRestore(input: {
  current: SelectedChildRestoreSnapshot
  backup: ApplicationBackup
  childId: string
}): SelectedChildRestorePlan {
  if (!isAppState(input.current.state))
    throw new Error('The current browser state is malformed; restore was stopped without writing.')
  if (!isAppState(input.backup.state)) throw new Error('The backup application state is malformed.')
  validateBackupOwnership(input.backup.state)
  validateBackupJournals(input.backup.state, input.backup.pendingAcquisition, input.backup.pendingWarmup)
  const childId = input.childId
  const shared = mergeDatasets(input.current.state, input.backup.state)
  const currentProgressionIds = progressionIdsForChild(input.current.state, childId)
  const backupProgressionIds = progressionIdsForChild(input.backup.state, childId)
  const currentVisitIds = visitIdsForChild(input.current.state, childId)
  const backupVisitIds = visitIdsForChild(input.backup.state, childId)
  const adaptiveWarmup = mergeAdaptiveProjection(
    input.current.state.adaptiveWarmup,
    input.backup.state.adaptiveWarmup,
    childId,
  )
  const currentMasteryIds = new Set(
    selected(input.current.state.adaptiveWarmup?.childStates, childId).map((value) => value.id),
  )
  const backupMasteryIds = new Set(
    selected(input.backup.state.adaptiveWarmup?.childStates, childId).map((value) => value.id),
  )
  const rotationCycles = { ...input.current.state.rotationCycles }
  if (Object.prototype.hasOwnProperty.call(input.backup.state.rotationCycles, childId))
    rotationCycles[childId] = input.backup.state.rotationCycles[childId]
  else delete rotationCycles[childId]
  const warmupMasteryRevisionsV1 = Object.fromEntries([
    ...Object.entries(input.current.state.warmupMasteryRevisionsV1 || {}).filter(([id]) => !currentMasteryIds.has(id)),
    ...Object.entries(input.backup.state.warmupMasteryRevisionsV1 || {}).filter(([id]) => backupMasteryIds.has(id)),
  ])
  const state: AppState = {
    ...input.current.state,
    datasets: shared.datasets,
    datasetImportReferences: shared.datasetImportReferences,
    results: replaceSelected(input.current.state.results, input.backup.state.results, childId),
    scores: replaceSelected(input.current.state.scores, input.backup.state.scores, childId),
    warmupSessions: replaceSelected(input.current.state.warmupSessions, input.backup.state.warmupSessions, childId),
    completedSessions: replaceSelected(
      input.current.state.completedSessions,
      input.backup.state.completedSessions,
      childId,
    ),
    legacyRecords: replaceSelected(input.current.state.legacyRecords, input.backup.state.legacyRecords, childId),
    childWordStates: replaceSelected(input.current.state.childWordStates, input.backup.state.childWordStates, childId),
    monthlyRotationScores: replaceSelected(
      input.current.state.monthlyRotationScores,
      input.backup.state.monthlyRotationScores,
      childId,
    ),
    rotationCycles,
    acquisitionProgressions: replaceSelected(
      input.current.state.acquisitionProgressions,
      input.backup.state.acquisitionProgressions,
      childId,
    ),
    acquisitionProgressEnvelopes: replaceSelected(
      input.current.state.acquisitionProgressEnvelopes,
      input.backup.state.acquisitionProgressEnvelopes,
      childId,
    ),
    acquisitionTransitionReceipts: replaceOwnedByReference(
      input.current.state.acquisitionTransitionReceipts,
      input.backup.state.acquisitionTransitionReceipts,
      currentProgressionIds,
      backupProgressionIds,
      (value) => value.progressionId,
    ),
    acquisitionPendingCheckpoints: replaceOwnedByReference(
      input.current.state.acquisitionPendingCheckpoints,
      input.backup.state.acquisitionPendingCheckpoints,
      currentProgressionIds,
      backupProgressionIds,
      (value) => value.progressionId,
    ),
    acquisitionProgressQuarantine: replaceSelected(
      input.current.state.acquisitionProgressQuarantine,
      input.backup.state.acquisitionProgressQuarantine,
      childId,
    ),
    adaptiveWarmup,
    warmupVisitsV1: replaceSelected(input.current.state.warmupVisitsV1, input.backup.state.warmupVisitsV1, childId),
    warmupAttemptsV1: replaceSelected(
      input.current.state.warmupAttemptsV1,
      input.backup.state.warmupAttemptsV1,
      childId,
    ),
    warmupTransitionReceiptsV1: replaceOwnedByReference(
      input.current.state.warmupTransitionReceiptsV1,
      input.backup.state.warmupTransitionReceiptsV1,
      currentVisitIds,
      backupVisitIds,
      (value) => value.visitId,
    ),
    warmupGraphPointsV1: replaceSelected(
      input.current.state.warmupGraphPointsV1,
      input.backup.state.warmupGraphPointsV1,
      childId,
    ),
    warmupPendingTransitionsV1: [
      ...(input.current.state.warmupPendingTransitionsV1 || []).filter((value) => value.nextVisit.childId !== childId),
      ...(input.backup.state.warmupPendingTransitionsV1 || []).filter((value) => value.nextVisit.childId === childId),
    ],
    warmupMasteryRevisionsV1,
    warmupCloudQuarantineV1: replaceSelected(
      input.current.state.warmupCloudQuarantineV1,
      input.backup.state.warmupCloudQuarantineV1,
      childId,
    ),
    distractorTargetObservations: replaceSelected(
      input.current.state.distractorTargetObservations,
      input.backup.state.distractorTargetObservations,
      childId,
    ),
  }
  if (!adaptiveWarmup) delete state.adaptiveWarmup
  const pendingAcquisition = [
    ...input.current.pendingAcquisition.filter((entry) => entry.baseEnvelope.childId !== childId),
    ...input.backup.pendingAcquisition.filter((entry) => entry.baseEnvelope.childId === childId),
  ]
  const pendingWarmup = [
    ...input.current.pendingWarmup.filter((entry) => entry.baseVisit.childId !== childId),
    ...input.backup.pendingWarmup.filter((entry) => entry.baseVisit.childId === childId),
  ]
  if (!isAppState(state)) throw new Error('The selected-child merge produced an invalid application state.')
  const identifiedCollections: Array<[string, readonly unknown[], (value: JsonRecord) => unknown]> = [
    ['Results', state.results, (value) => value.id],
    ['Scores', state.scores, (value) => value.id],
    ['Warmup sessions', state.warmupSessions, (value) => value.id],
    ['Completed sessions', state.completedSessions, (value) => value.id],
    ['Legacy records', state.legacyRecords, (value) => value.id],
    ['Child word states', state.childWordStates, (value) => value.id],
    ['Monthly rotation scores', state.monthlyRotationScores, (value) => value.id],
    ['Acquisition progressions', state.acquisitionProgressions, (value) => value.id],
    ['Acquisition envelopes', state.acquisitionProgressEnvelopes || [], (value) => value.id],
    ['Acquisition quarantine', state.acquisitionProgressQuarantine || [], (value) => value.id],
    ['Warmup visits', state.warmupVisitsV1 || [], (value) => value.id],
    ['Warmup attempts', state.warmupAttemptsV1 || [], (value) => value.id],
    ['Warmup graph points', state.warmupGraphPointsV1 || [], (value) => value.id],
    ['Warmup cloud quarantine', state.warmupCloudQuarantineV1 || [], (value) => value.id],
    ['Distractor observations', state.distractorTargetObservations, (value) => value.id],
  ]
  for (const [label, values, identity] of identifiedCollections) assertUnique(values, label, identity)
  validateDatasetReferences(state, childId)
  validateAcquisition(state, childId, pendingAcquisition)
  validateWarmup(state, childId, pendingWarmup)
  const before = recordCounts(
    input.current.state,
    childId,
    input.current.pendingAcquisition,
    input.current.pendingWarmup,
  )
  const after = recordCounts(state, childId, pendingAcquisition, pendingWarmup)
  const snapshot = { state, pendingAcquisition, pendingWarmup }
  const otherBefore =
    totalOwnedRecords(input.current.state, input.current.pendingAcquisition, input.current.pendingWarmup) -
    Object.values(before).reduce((total, value) => total + value, 0)
  const otherAfter =
    totalOwnedRecords(state, pendingAcquisition, pendingWarmup) -
    Object.values(after).reduce((total, value) => total + value, 0)
  if (otherBefore !== otherAfter)
    throw new Error('The restore would change records owned by another child and was stopped.')
  return {
    snapshot,
    report: {
      childId,
      before,
      after,
      preservedOtherChildRecords: otherAfter,
      addedHistoricalDatasets: shared.addedHistoricalDatasets,
      changed: stableSerialize(input.current) !== stableSerialize(snapshot),
    },
  }
}
