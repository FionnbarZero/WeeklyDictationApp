import {
  NEEDS_ATTENTION_RECOVERY_CORRECT,
  type AdaptiveWarmupProfileRegistry,
  type ChildMasteryState,
  type MasteryIdentityTuple,
  type MasteryLifecycleAssignment,
  type MasteryOccurrence,
  type MasteryOccurrenceStage,
  type MasteryRotationState,
  type MasteryTermDefinition,
} from './contracts.ts'
import {
  MASTERY_NORMALIZER_VERSION,
  childMasteryStateId,
  deterministicMasteryTermId,
  masteryIdentitiesEqual,
  masteryRotationStateId,
  normalizeMasteryTermV1,
  type MasteryTermIdFactory,
} from './identity.ts'
import { profileDefinition, validateAdaptiveWarmupProfileRegistry } from './profileValidation.ts'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function validTimestamp(value: unknown) {
  return value === undefined || (typeof value === 'string' && Number.isFinite(Date.parse(value)))
}

function nonNegativeInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0
}

function positiveInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) > 0
}

function isIdentity(value: unknown): value is MasteryIdentityTuple {
  return isRecord(value)
    && value.normalizerVersion === MASTERY_NORMALIZER_VERSION
    && nonEmptyString(value.activityModule)
    && ['tier-1', 'tier-2', 'tier-3'].includes(String(value.tier))
    && ['mandarin', 'english'].includes(String(value.language))
    && nonEmptyString(value.normalizedTerm)
    && value.normalizedTerm === normalizeMasteryTermV1(value.normalizedTerm)
}

function isStage(value: unknown): value is MasteryOccurrenceStage {
  if (!isRecord(value) || !nonEmptyString(value.kind)) return false
  if (value.kind === 'test-review') return positiveInteger(value.cycle)
  return ['future', 'acquisition', 'mastery', 'no-instruction', 'malformed', 'legacy-active'].includes(value.kind)
}

function isOccurrence(value: unknown): value is MasteryOccurrence {
  if (!isRecord(value)) return false
  return nonEmptyString(value.occurrenceId)
    && nonEmptyString(value.wordId)
    && nonEmptyString(value.datasetId)
    && nonEmptyString(value.grade)
    && nonEmptyString(value.schoolYear)
    && nonEmptyString(value.displayText)
    && isIdentity(value.identity)
    && normalizeMasteryTermV1(value.displayText) === value.identity.normalizedTerm
    && nonEmptyString(value.masteryTermId)
}

function isLifecycleAssignment(value: unknown): value is MasteryLifecycleAssignment {
  if (!isRecord(value) || !nonEmptyString(value.occurrenceId)) return false
  if (value.status === 'unresolved') return ['missing', 'conflicting', 'invalid', 'strategy-mismatch'].includes(String(value.reason))
  if (value.status !== 'resolved' || !nonEmptyString(value.profileId) || !isStage(value.stage) || !positiveInteger(value.finalTestReviewCycle)) return false
  const finalTestReviewCycle = Number(value.finalTestReviewCycle)
  return value.stage.kind !== 'test-review' || value.stage.cycle <= finalTestReviewCycle
}

function lifecycleProjectionKey(assignment: MasteryLifecycleAssignment) {
  if (assignment.status === 'unresolved') return `unresolved:${assignment.reason}`
  const stage = assignment.stage.kind === 'test-review'
    ? `test-review:${assignment.stage.cycle}`
    : assignment.stage.kind
  return `resolved:${assignment.profileId}:${stage}:${assignment.finalTestReviewCycle}`
}

function isTerm(value: unknown, idFactory: MasteryTermIdFactory): value is MasteryTermDefinition {
  if (!isRecord(value) || !nonEmptyString(value.id) || !isIdentity(value.identity) || !Array.isArray(value.occurrences) || value.occurrences.length === 0) return false
  const identity = value.identity
  if (value.id !== idFactory(identity)) return false
  return value.occurrences.every((occurrence) => isOccurrence(occurrence)
    && occurrence.masteryTermId === value.id
    && masteryIdentitiesEqual(occurrence.identity, identity))
}

function isChildState(value: unknown, terms: ReadonlyMap<string, MasteryTermDefinition>): value is ChildMasteryState {
  if (!isRecord(value)
    || value.version !== 1
    || !nonEmptyString(value.id)
    || !nonEmptyString(value.childId)
    || !nonEmptyString(value.masteryTermId)
    || !['unassessed', 'demonstrated', 'support-needed'].includes(String(value.evidence))
    || !['recent-entry', 'needs-attention', 'mastery-rotation'].includes(String(value.bucket))
    || !nonNegativeInteger(value.consecutiveCorrect)
    || !isRecord(value.schedulingProfile)
    || !nonEmptyString(value.schedulingProfile.id)
    || !positiveInteger(value.schedulingProfile.version)
    || !nonEmptyString(value.schedulingProfile.sourceOccurrenceId)
    || !Array.isArray(value.integratedOccurrences)
    || value.integratedOccurrences.length === 0
    || !validTimestamp(value.lastReviewedAt)
    || !validTimestamp(value.lastIncorrectAt)) return false
  if (value.id !== childMasteryStateId(value.childId, value.masteryTermId)) return false
  const term = terms.get(value.masteryTermId)
  if (!term) return false
  if (value.bucket === 'needs-attention' && value.evidence !== 'support-needed') return false
  if (value.bucket !== 'needs-attention' && value.evidence === 'support-needed') return false
  if (value.evidence === 'unassessed' && value.consecutiveCorrect !== 0) return false
  if (value.bucket === 'needs-attention' && Number(value.consecutiveCorrect) >= NEEDS_ATTENTION_RECOVERY_CORRECT) return false
  if (value.bucket === 'mastery-rotation' && value.consecutiveCorrect !== 0) return false
  if (typeof value.lastReviewedAt === 'string' && typeof value.lastIncorrectAt === 'string'
    && Date.parse(value.lastIncorrectAt) > Date.parse(value.lastReviewedAt)) return false
  if (value.rotationEligibleFromCycle !== undefined && !positiveInteger(value.rotationEligibleFromCycle)) return false
  if (value.lastConsumedRotationCycle !== undefined && !positiveInteger(value.lastConsumedRotationCycle)) return false
  const occurrenceIds = new Set(term.occurrences.map((occurrence) => occurrence.occurrenceId))
  const integratedIds = new Set<string>()
  const validIntegrations = value.integratedOccurrences.every((record) => {
    if (!isRecord(record)
      || !nonEmptyString(record.occurrenceId)
      || !['correct', 'incorrect', 'none'].includes(String(record.evidence))
      || !isRecord(record.eligibilityBasis)
      || record.eligibilityBasis.kind !== 'verified-mastery'
      || !nonEmptyString(record.eligibilityBasis.lifecycleProfileId)
      || !positiveInteger(record.eligibilityBasis.finalTestReviewCycle)
      || (record.sourceAttemptId !== undefined && !nonEmptyString(record.sourceAttemptId))
      || !validTimestamp(record.sourceReviewedAt)
      || (record.sourceAttemptId === undefined) !== (record.sourceReviewedAt === undefined)
      || (record.evidence !== 'none' && record.sourceAttemptId === undefined)
      || integratedIds.has(record.occurrenceId)
      || !occurrenceIds.has(record.occurrenceId)) return false
    integratedIds.add(record.occurrenceId)
    return true
  })
  if (!validIntegrations) return false
  if (value.legacyCheckpoint !== undefined) {
    if (!isRecord(value.legacyCheckpoint)
      || !['timestamp', 'unknown-cutoff'].includes(String(value.legacyCheckpoint.kind))
      || !Array.isArray(value.legacyCheckpoint.sourceRecordIds)
      || !value.legacyCheckpoint.sourceRecordIds.every(nonEmptyString)
      || new Set(value.legacyCheckpoint.sourceRecordIds).size !== value.legacyCheckpoint.sourceRecordIds.length
      || (value.legacyCheckpoint.kind === 'timestamp'
        && (typeof value.legacyCheckpoint.through !== 'string' || !Number.isFinite(Date.parse(value.legacyCheckpoint.through))))
      || (value.legacyCheckpoint.kind === 'unknown-cutoff' && value.legacyCheckpoint.through !== undefined)) return false
  }
  if (value.appliedLegacyWarmupAttempts !== undefined) {
    if (!Array.isArray(value.appliedLegacyWarmupAttempts)) return false
    const attemptIds = new Set<string>()
    if (!value.appliedLegacyWarmupAttempts.every((attempt) => {
      if (!isRecord(attempt)
        || !nonEmptyString(attempt.attemptId)
        || typeof attempt.reviewedAt !== 'string'
        || !Number.isFinite(Date.parse(attempt.reviewedAt))
        || typeof attempt.correct !== 'boolean'
        || !nonEmptyString(attempt.payloadFingerprint)
        || attemptIds.has(attempt.attemptId)) return false
      attemptIds.add(attempt.attemptId)
      return true
    })) return false
  }
  return true
}

function isRotationState(value: unknown): value is MasteryRotationState {
  return isRecord(value)
    && value.version === 1
    && nonEmptyString(value.id)
    && nonEmptyString(value.childId)
    && nonEmptyString(value.activityModule)
    && positiveInteger(value.cycle)
    && value.id === masteryRotationStateId(value.childId, value.activityModule)
}

export type AdaptiveWarmupValidationOptions = {
  idFactory?: MasteryTermIdFactory
  profileRegistry: AdaptiveWarmupProfileRegistry
}

export function validateAdaptiveWarmupV3Projection(value: unknown, options: AdaptiveWarmupValidationOptions) {
  const idFactory = options.idFactory || deterministicMasteryTermId
  const errors: string[] = []
  const profileValidation = validateAdaptiveWarmupProfileRegistry(options.profileRegistry)
  errors.push(...profileValidation.errors)
  if (!isRecord(value)) return { valid: false, errors: ['Adaptive Warmup projection is not an object.'] }
  if (value.schemaVersion !== 3) errors.push('Adaptive Warmup schema version is invalid.')
  if (!['complete', 'partial'].includes(String(value.migrationStatus))) errors.push('Adaptive Warmup migration status is invalid.')
  if (value.normalizerVersion !== MASTERY_NORMALIZER_VERSION) errors.push('Adaptive Warmup normalizer version is invalid.')
  if (!Array.isArray(value.terms)
    || !Array.isArray(value.lifecycleAssignments)
    || !Array.isArray(value.childStates)
    || !Array.isArray(value.rotationStates)
    || !Array.isArray(value.legacyMonthlyRotationScores)
    || !Array.isArray(value.deferredRecords)) {
    errors.push('Adaptive Warmup projection collections are invalid.')
    return { valid: false, errors }
  }

  const terms = new Map<string, MasteryTermDefinition>()
  const occurrenceIds = new Set<string>()
  const occurrences = new Map<string, MasteryOccurrence>()
  const datasetProvenance = new Map<string, string>()
  for (const rawTerm of value.terms) {
    if (!isTerm(rawTerm, idFactory)) { errors.push('A mastery term is malformed.'); continue }
    if (terms.has(rawTerm.id)) errors.push(`Mastery term ${rawTerm.id} is duplicated.`)
    terms.set(rawTerm.id, rawTerm)
    for (const occurrence of rawTerm.occurrences) {
      if (occurrenceIds.has(occurrence.occurrenceId)) errors.push(`Occurrence ${occurrence.occurrenceId} is duplicated globally.`)
      occurrenceIds.add(occurrence.occurrenceId)
      occurrences.set(occurrence.occurrenceId, occurrence)
      const provenance = JSON.stringify([occurrence.grade, occurrence.schoolYear])
      const existingProvenance = datasetProvenance.get(occurrence.datasetId)
      if (existingProvenance && existingProvenance !== provenance) errors.push(`Dataset ${occurrence.datasetId} has inconsistent grade or school-year provenance.`)
      datasetProvenance.set(occurrence.datasetId, provenance)
    }
  }

  const assignments = new Map<string, MasteryLifecycleAssignment>()
  const lifecycleByDataset = new Map<string, string>()
  for (const rawAssignment of value.lifecycleAssignments) {
    if (!isLifecycleAssignment(rawAssignment)) { errors.push('A lifecycle assignment is malformed.'); continue }
    if (!occurrenceIds.has(rawAssignment.occurrenceId)) errors.push(`Lifecycle assignment ${rawAssignment.occurrenceId} has no occurrence.`)
    if (assignments.has(rawAssignment.occurrenceId)) errors.push(`Lifecycle assignment ${rawAssignment.occurrenceId} is duplicated.`)
    assignments.set(rawAssignment.occurrenceId, rawAssignment)
    const occurrence = occurrences.get(rawAssignment.occurrenceId)
    if (occurrence) {
      const lifecycleValue = lifecycleProjectionKey(rawAssignment)
      const existing = lifecycleByDataset.get(occurrence.datasetId)
      if (existing && existing !== lifecycleValue) errors.push(`Dataset ${occurrence.datasetId} has inconsistent occurrence lifecycle assignments.`)
      lifecycleByDataset.set(occurrence.datasetId, lifecycleValue)
    }
  }
  for (const occurrenceId of occurrenceIds) if (!assignments.has(occurrenceId)) errors.push(`Occurrence ${occurrenceId} has no lifecycle assignment.`)

  const childStateIds = new Set<string>()
  const validChildStates: ChildMasteryState[] = []
  for (const rawState of value.childStates) {
    if (!isChildState(rawState, terms)) { errors.push('A child mastery state is malformed.'); continue }
    if (childStateIds.has(rawState.id)) errors.push(`Child mastery state ${rawState.id} is duplicated.`)
    childStateIds.add(rawState.id)
    validChildStates.push(rawState)
  }
  for (const state of validChildStates) {
    const term = terms.get(state.masteryTermId)
    const profile = profileDefinition(options.profileRegistry, state.schedulingProfile)
    const sourceOccurrence = term?.occurrences.find((occurrence) => occurrence.occurrenceId === state.schedulingProfile.sourceOccurrenceId)
    if (!profile) {
      errors.push(`Child mastery state ${state.id} references an unavailable Adaptive Warmup profile.`)
      continue
    }
    if (!sourceOccurrence
      || sourceOccurrence.grade !== profile.grade
      || sourceOccurrence.identity.activityModule !== profile.activityModule
      || !state.integratedOccurrences.some((record) => record.occurrenceId === sourceOccurrence.occurrenceId)) {
      errors.push(`Child mastery state ${state.id} has invalid scheduling-profile provenance.`)
    }
    if (state.bucket === 'recent-entry'
      && state.evidence === 'demonstrated'
      && state.consecutiveCorrect >= profile.recentEntryPromotionCorrect) {
      errors.push(`Child mastery state ${state.id} has already reached its Recent Entry promotion threshold.`)
    }
    for (const integration of state.integratedOccurrences) {
      const current = assignments.get(integration.occurrenceId)
      if (current?.status === 'resolved'
        && (current.profileId !== integration.eligibilityBasis.lifecycleProfileId
          || current.finalTestReviewCycle !== integration.eligibilityBasis.finalTestReviewCycle)) {
        errors.push(`Child mastery state ${state.id} has an integration basis that conflicts with the current lifecycle strategy.`)
      }
    }
  }

  const sourceAttemptIds = new Set<string>()
  for (const state of validChildStates) {
    for (const record of state.integratedOccurrences) {
      if (!record.sourceAttemptId) continue
      if (sourceAttemptIds.has(record.sourceAttemptId)) errors.push(`Source attempt ${record.sourceAttemptId} is referenced more than once.`)
      sourceAttemptIds.add(record.sourceAttemptId)
    }
    for (const attempt of state.appliedLegacyWarmupAttempts || []) {
      if (sourceAttemptIds.has(attempt.attemptId)) errors.push(`Source attempt ${attempt.attemptId} is referenced more than once.`)
      sourceAttemptIds.add(attempt.attemptId)
    }
  }

  const deferredIds = new Set<string>()
  for (const deferred of value.deferredRecords) {
    if (!isRecord(deferred)
      || !nonEmptyString(deferred.id)
      || deferred.reason !== 'missing-profile'
      || !['childWordStates', 'finalReviewEvidence', 'results'].includes(String(deferred.collection))
      || !nonEmptyString(deferred.childId)
      || !nonEmptyString(deferred.occurrenceId)
      || !occurrenceIds.has(deferred.occurrenceId)
      || !nonEmptyString(deferred.grade)
      || !nonEmptyString(deferred.activityModule)
      || !nonEmptyString(deferred.rawFingerprint)
      || deferredIds.has(deferred.id)) {
      errors.push('A deferred Adaptive Warmup record is malformed or duplicated.')
      continue
    }
    deferredIds.add(deferred.id)
  }
  if (value.migrationStatus === 'complete' && value.deferredRecords.length > 0) errors.push('A complete Adaptive Warmup migration cannot retain deferred records.')
  if (value.migrationStatus === 'partial' && value.deferredRecords.length === 0) errors.push('A partial Adaptive Warmup migration must retain deferred records.')

  const rotationIds = new Set<string>()
  const rotationPairs = new Map<string, MasteryRotationState>()
  for (const rawState of value.rotationStates) {
    if (!isRotationState(rawState)) { errors.push('A Mastery Rotation state is malformed.'); continue }
    if (rotationIds.has(rawState.id)) errors.push(`Mastery Rotation state ${rawState.id} is duplicated.`)
    rotationIds.add(rawState.id)
    rotationPairs.set(`${rawState.childId}\u0000${rawState.activityModule}`, rawState)
  }
  const childModulePairs = new Set(validChildStates.map((state) => `${state.childId}\u0000${terms.get(state.masteryTermId)?.identity.activityModule || ''}`))
  for (const pair of rotationPairs.keys()) if (!childModulePairs.has(pair)) errors.push('A Mastery Rotation state has no matching child mastery state.')
  for (const pair of childModulePairs) if (!rotationPairs.has(pair)) errors.push('A child mastery state has no matching Mastery Rotation state.')
  for (const state of validChildStates) {
    const activityModule = terms.get(state.masteryTermId)?.identity.activityModule
    const rotation = activityModule ? rotationPairs.get(`${state.childId}\u0000${activityModule}`) : undefined
    if (!rotation) continue
    if (state.lastConsumedRotationCycle !== undefined && state.lastConsumedRotationCycle > rotation.cycle) {
      errors.push(`Child mastery state ${state.id} was consumed after its current Mastery Rotation cycle.`)
    }
    if (state.rotationEligibleFromCycle !== undefined && state.rotationEligibleFromCycle > rotation.cycle + 1) {
      errors.push(`Child mastery state ${state.id} is eligible beyond the next Mastery Rotation cycle.`)
    }
  }

  if (!isRecord(value.migrationReport)
    || !(value.migrationReport.sourceVersion === null || nonNegativeInteger(value.migrationReport.sourceVersion))
    || value.migrationReport.targetVersion !== 3
    || !Array.isArray(value.migrationReport.quarantined)
    || !nonNegativeInteger(value.migrationReport.migratedTermCount)
    || !nonNegativeInteger(value.migrationReport.migratedChildStateCount)
    || !nonNegativeInteger(value.migrationReport.migratedOccurrenceCount)
    || !nonNegativeInteger(value.migrationReport.activeOccurrenceCount)
    || !nonNegativeInteger(value.migrationReport.preservedLegacyMonthlyScoreCount)
    || !nonNegativeInteger(value.migrationReport.deferredRecordCount)) {
    errors.push('The migration report is malformed.')
  }
  if (isRecord(value.migrationReport)) {
    if (Array.isArray(value.migrationReport.quarantined)
      && !value.migrationReport.quarantined.every((issue) => isRecord(issue) && nonEmptyString(issue.code) && nonEmptyString(issue.message))) {
      errors.push('A migration quarantine issue is malformed.')
    }
    if (value.migrationReport.migratedTermCount !== value.terms.length) errors.push('The migrated term count is inconsistent.')
    if (value.migrationReport.migratedChildStateCount !== value.childStates.length) errors.push('The migrated child-state count is inconsistent.')
    if (value.migrationReport.migratedOccurrenceCount !== occurrenceIds.size) errors.push('The migrated occurrence count is inconsistent.')
    if (value.migrationReport.preservedLegacyMonthlyScoreCount !== value.legacyMonthlyRotationScores.length) errors.push('The legacy monthly-score count is inconsistent.')
    if (value.migrationReport.deferredRecordCount !== value.deferredRecords.length) errors.push('The deferred-record count is inconsistent.')
    const activeCount = [...assignments.values()].filter((assignment) => assignment.status === 'resolved' && (assignment.stage.kind === 'acquisition' || assignment.stage.kind === 'test-review' || assignment.stage.kind === 'legacy-active')).length
    if (value.migrationReport.activeOccurrenceCount !== activeCount) errors.push('The active occurrence count is inconsistent.')
  }
  return { valid: errors.length === 0, errors }
}
