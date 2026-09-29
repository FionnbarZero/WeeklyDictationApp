import type {
  AcquisitionPromptKind,
  AcquisitionSequenceToken,
  AcquisitionTarget,
  EngineAcquisitionFlow,
} from '../contracts.ts'
import { acquisitionPromptTimer } from '../engine.ts'
import {
  ACQUISITION_PERSISTENCE_CONTRACT_ID,
  ACQUISITION_PROGRESS_SCHEMA_VERSION,
  type AcquisitionPersistenceContext,
  type AcquisitionProgressEnvelope,
} from './contracts.ts'
import { acquisitionProgressionId, acquisitionStrategyFingerprint, acquisitionTargetSetFingerprint, acquisitionTransitionId } from './identity.ts'

export type AcquisitionValidationResult<TTarget extends AcquisitionTarget = AcquisitionTarget> =
  | { readonly valid: true; readonly envelope: AcquisitionProgressEnvelope<TTarget> }
  | { readonly valid: false; readonly errors: readonly string[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value
}

function targetMatches(left: AcquisitionTarget, right: AcquisitionTarget) {
  return left.id === right.id
    && left.text === right.text
    && left.sentence === right.sentence
    && left.datasetId === right.datasetId
    && left.language === right.language
    && left.tier === right.tier
    && left.activityType === right.activityType
}

function targetFrom(value: unknown, allowed: readonly AcquisitionTarget[], path: string, errors: string[]) {
  if (!isRecord(value) || !isNonEmptyString(value.id)) {
    errors.push(`${path} is not a target.`)
    return null
  }
  const candidate = allowed.find((target) => target.id === value.id)
  if (!candidate || !targetMatches(value as AcquisitionTarget, candidate)) {
    errors.push(`${path} does not match a canonical target.`)
    return null
  }
  return candidate
}

function uniqueTargetArray(value: unknown, allowed: readonly AcquisitionTarget[], path: string, errors: string[]) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`)
    return []
  }
  const ids = new Set<string>()
  return value.flatMap((entry, index) => {
    const target = targetFrom(entry, allowed, `${path}[${index}]`, errors)
    if (!target) return []
    if (ids.has(target.id)) errors.push(`${path} reuses target ${target.id}.`)
    ids.add(target.id)
    return [target]
  })
}

function sequenceFor<TTarget extends AcquisitionTarget>(flow: EngineAcquisitionFlow<TTarget>, context: AcquisitionPersistenceContext<TTarget>) {
  if (flow.phase === 'introduction') return context.strategy.introductionSequence
  if (flow.phase === 'expanded-trials') return context.strategy.expandedSequence
  return context.strategy.correctionSequence
}

function promptKindMatchesToken(kind: AcquisitionPromptKind, token: AcquisitionSequenceToken | undefined) {
  if (token === 'dt') return kind === 'familiar-dt' || kind === 'earned-dt'
  return kind === token
}

function validateContext<TTarget extends AcquisitionTarget>(context: AcquisitionPersistenceContext<TTarget>, errors: string[]) {
  for (const [key, value] of Object.entries(context.identity)) if (!isNonEmptyString(value)) errors.push(`Persistence context ${key} is invalid.`)
  if (!/^\d{4}-\d{2}$/.test(context.identity.schoolYear)) errors.push('Persistence context schoolYear must be a normalized school-year key.')
  if (!['tier-1', 'tier-2', 'tier-3'].includes(context.identity.tier)) errors.push('Persistence context tier is invalid.')
  if (context.targetSet.id !== context.identity.datasetId) errors.push('Persistence context target set does not match its dataset identity.')
  if (!isRecord(context.lifecycleStage)
    || (context.lifecycleStage.kind !== 'acquisition'
      && (context.lifecycleStage.kind !== 'test-review' || !isPositiveInteger(context.lifecycleStage.cycle)))) errors.push('Persistence context lifecycle stage is invalid.')
  if (!isNonEmptyString(context.applicationVersion)) errors.push('Persistence context applicationVersion is invalid.')
  if (!isNonEmptyString(context.strategy.id) || !isPositiveInteger(context.strategy.version)) errors.push('Persistence context strategy identity is invalid.')
  const targetIds = new Set<string>()
  for (const target of context.targetSet.targets) {
    if (!isNonEmptyString(target.id) || targetIds.has(target.id)) errors.push(`Persistence context target identity is invalid or repeated: ${target.id || '(missing)'}.`)
    targetIds.add(target.id)
    if (target.datasetId !== context.targetSet.id) errors.push(`Persistence context target ${target.id} belongs to another dataset.`)
    if (target.tier !== undefined && target.tier !== context.identity.tier) errors.push(`Persistence context target ${target.id} belongs to another tier.`)
  }
  const familiarIds = new Set<string>()
  for (const target of context.strategy.familiarDtTargets) {
    if (!isNonEmptyString(target.id) || familiarIds.has(target.id)) errors.push(`Familiar DT identity is invalid or repeated: ${target.id || '(missing)'}.`)
    familiarIds.add(target.id)
  }
  const upgradeSources = new Set<string>()
  for (const upgrade of context.strategyUpgrades || []) {
    const source = `${upgrade.fromStrategyId}@${upgrade.fromStrategyVersion}:${upgrade.fromStrategyFingerprint}`
    if (!isNonEmptyString(upgrade.id) || !isNonEmptyString(upgrade.fromStrategyFingerprint) || upgradeSources.has(source)) errors.push(`Acquisition strategy upgrade is invalid or repeated: ${upgrade.id || '(missing)'}.`)
    upgradeSources.add(source)
    if (upgrade.toStrategyId !== context.strategy.id || upgrade.toStrategyVersion !== context.strategy.version || typeof upgrade.upgrade !== 'function') errors.push(`Acquisition strategy upgrade ${upgrade.id} does not target the active strategy.`)
  }
}

function validateFlow<TTarget extends AcquisitionTarget>(value: unknown, context: AcquisitionPersistenceContext<TTarget>, errors: string[]) {
  if (!isRecord(value)) {
    errors.push('flow must be an object.')
    return
  }
  const flow = value as unknown as EngineAcquisitionFlow<TTarget>
  if (flow.datasetId !== context.targetSet.id) errors.push('flow.datasetId does not match the target set.')
  if (flow.strategyId !== context.strategy.id || flow.strategyVersion !== context.strategy.version) errors.push('flow strategy does not match the supplied strategy.')
  if (flow.mode !== 'teaching' && flow.mode !== 'dt-practice') errors.push('flow.mode is invalid.')
  if (!['introduction', 'expanded-trials', 'correction'].includes(String(flow.phase))) errors.push('flow.phase is invalid.')
  if (!isNonNegativeInteger(flow.targetIndex)) errors.push('flow.targetIndex must be a non-negative integer.')
  if (!isNonNegativeInteger(flow.step)) errors.push('flow.step must be a non-negative integer.')
  if (!isNonNegativeInteger(flow.trialNumber)) errors.push('flow.trialNumber must be a non-negative integer.')
  if (!isNonNegativeInteger(flow.expandedTargetAttempts)) errors.push('flow.expandedTargetAttempts must be a non-negative integer.')
  if (typeof flow.teachingComplete !== 'boolean' || typeof flow.complete !== 'boolean') errors.push('flow completion flags must be booleans.')
  if ('establishedDtBag' in value) errors.push('flow contains the legacy establishedDtBag field.')

  const weeklyTargets = context.targetSet.targets
  const familiarTargets = context.strategy.familiarDtTargets
  const currentTarget = flow.currentTarget !== null ? targetFrom(flow.currentTarget, weeklyTargets, 'flow.currentTarget', errors) : null
  const earned = uniqueTargetArray(flow.earnedDtPool, weeklyTargets, 'flow.earnedDtPool', errors)
  uniqueTargetArray(flow.familiarDtBag, familiarTargets, 'flow.familiarDtBag', errors)
  const earnedBag = uniqueTargetArray(flow.earnedDtBag, weeklyTargets, 'flow.earnedDtBag', errors)
  const earnedIds = new Set(earned.map((target) => target.id))
  for (const target of earned) {
    const targetIndex = weeklyTargets.findIndex((candidate) => candidate.id === target.id)
    if (!flow.teachingComplete && targetIndex >= flow.targetIndex) errors.push(`flow.earnedDtPool contains uncompleted target ${target.id}.`)
  }
  const completedTargets = flow.teachingComplete ? weeklyTargets : weeklyTargets.slice(0, flow.targetIndex)
  const permittedMissingReacquisitionId = flow.correctionRole === 'earned-dt' && currentTarget
    && completedTargets.some((target) => target.id === currentTarget.id)
    ? currentTarget.id
    : undefined
  for (const target of completedTargets) {
    if (!earnedIds.has(target.id) && target.id !== permittedMissingReacquisitionId) errors.push(`flow.earnedDtPool is missing completed target ${target.id}.`)
  }
  for (const target of earnedBag) if (!earnedIds.has(target.id)) errors.push(`flow.earnedDtBag contains non-earned target ${target.id}.`)
  if (flow.lastDtWordId !== undefined && ![...familiarTargets, ...earned].some((target) => target.id === flow.lastDtWordId)) errors.push('flow.lastDtWordId is not an eligible Familiar or Earned DT.')

  if (!isRecord(flow.consecutiveErrors)) {
    errors.push('flow.consecutiveErrors must be an object.')
  } else {
    const weeklyIds = new Set(weeklyTargets.map((target) => target.id))
    for (const [targetId, count] of Object.entries(flow.consecutiveErrors)) {
      if (!weeklyIds.has(targetId) || !isNonNegativeInteger(count)) errors.push(`flow.consecutiveErrors has invalid entry ${targetId}.`)
    }
  }

  if (flow.correctionRole !== undefined && flow.correctionRole !== 'current-target' && flow.correctionRole !== 'earned-dt') errors.push('flow.correctionRole is invalid.')
  if (flow.resumePosition !== undefined) {
    if (!isRecord(flow.resumePosition)) {
      errors.push('flow.resumePosition must be an object.')
    } else {
      if (flow.resumePosition.phase !== 'expanded-trials') errors.push('flow.resumePosition.phase is invalid.')
      if (!isNonNegativeInteger(flow.resumePosition.step) || flow.resumePosition.step > context.strategy.expandedSequence.length) errors.push('flow.resumePosition.step is invalid.')
      if (!isNonNegativeInteger(flow.resumePosition.expandedTargetAttempts)) errors.push('flow.resumePosition.expandedTargetAttempts is invalid.')
      if (!isNonNegativeInteger(flow.resumePosition.targetIndex) || flow.resumePosition.targetIndex >= weeklyTargets.length) errors.push('flow.resumePosition.targetIndex is invalid.')
      targetFrom(flow.resumePosition.currentTarget, weeklyTargets, 'flow.resumePosition.currentTarget', errors)
    }
  }

  const sequence = sequenceFor(flow, context)
  const openDtPractice = flow.mode === 'dt-practice' && flow.currentTarget === null
  const terminalExpandedPosition = flow.mode === 'teaching'
    && flow.phase === 'expanded-trials'
    && flow.teachingComplete
    && flow.complete
    && flow.currentTarget === null
    && flow.prompt === null
    && flow.step === sequence.length
  if (!isNonNegativeInteger(flow.step)
    || (sequence.length > 0 && flow.step >= sequence.length && !terminalExpandedPosition && !openDtPractice)) errors.push('flow.step is outside the configured sequence.')
  if (weeklyTargets.length === 0 ? flow.targetIndex !== 0 : flow.targetIndex >= weeklyTargets.length) errors.push('flow.targetIndex is outside the ordered target set.')
  if (flow.mode === 'dt-practice' && !flow.teachingComplete) errors.push('DT-only practice requires teachingComplete.')
  if (flow.mode === 'teaching' && !flow.teachingComplete && flow.currentTarget === null) errors.push('Active teaching requires a current target.')
  if (!flow.teachingComplete && flow.complete) errors.push('An incomplete teaching flow cannot be complete.')
  if (!flow.teachingComplete && flow.prompt === null) errors.push('Active teaching requires a persisted prompt.')
  if (flow.teachingComplete && flow.mode === 'teaching') {
    if (!flow.complete || flow.currentTarget !== null || flow.prompt !== null || flow.correctionRole !== undefined || flow.resumePosition !== undefined) errors.push('Terminal teaching state is inconsistent.')
  }
  if (flow.mode === 'dt-practice' && flow.complete) errors.push('DT-only practice cannot use the terminal teaching complete flag.')
  if (currentTarget && flow.correctionRole !== 'earned-dt' && weeklyTargets[flow.targetIndex]?.id !== currentTarget.id) errors.push('flow.currentTarget does not match flow.targetIndex.')

  if (flow.prompt !== null) {
    if (!isRecord(flow.prompt)) {
      errors.push('flow.prompt must be an object or null.')
    } else {
      const prompt = flow.prompt
      if (!isNonEmptyString(prompt.id)) errors.push('flow.prompt.id is invalid.')
      if (!['familiar-dt', 'earned-dt', 'show-copy', 'target'].includes(String(prompt.kind))) errors.push('flow.prompt.kind is invalid.')
      if (prompt.phase !== flow.phase) errors.push('flow.prompt.phase does not match flow.phase.')
      if (prompt.revealed !== false) errors.push('persisted flow.prompt must restart unrevealed.')
      if (!isPositiveInteger(prompt.timerSeconds)) errors.push('flow.prompt.timerSeconds is invalid.')
      else if (['familiar-dt', 'earned-dt', 'show-copy', 'target'].includes(String(prompt.kind))
        && prompt.timerSeconds !== acquisitionPromptTimer(context.strategy, flow.phase, prompt.kind as AcquisitionPromptKind, flow.expandedTargetAttempts)) errors.push('flow.prompt.timerSeconds does not match the configured timer.')
      const token = sequence[flow.step]
      const promptKindIsValid = openDtPractice
        ? prompt.kind === 'familiar-dt' || prompt.kind === 'earned-dt'
        : promptKindMatchesToken(prompt.kind as AcquisitionPromptKind, token)
      if (!promptKindIsValid) errors.push('flow.prompt.kind does not match the configured sequence position or DT-practice mode.')
      const promptAllowed = prompt.kind === 'familiar-dt' ? familiarTargets : weeklyTargets
      const promptTarget = targetFrom(prompt.word, promptAllowed, 'flow.prompt.word', errors)
      if ((prompt.kind === 'show-copy' || prompt.kind === 'target') && (!currentTarget || !promptTarget || promptTarget.id !== currentTarget.id)) errors.push('flow.prompt.word does not match flow.currentTarget.')
      if (prompt.kind === 'earned-dt' && (!promptTarget || !earnedIds.has(promptTarget.id))) errors.push('flow.prompt.word is not in the Earned DT pool.')
      const expectedScored = prompt.kind === 'target' || prompt.kind === 'earned-dt'
      if (prompt.scored !== expectedScored || prompt.countsTowardWeeklyScore !== expectedScored) errors.push('flow.prompt scoring flags are invalid.')
      const expectedPool = prompt.kind === 'familiar-dt' ? 'familiar' : prompt.kind === 'earned-dt' || (prompt.kind === 'target' && flow.correctionRole === 'earned-dt') ? 'earned' : undefined
      if (prompt.dtPoolType !== expectedPool) errors.push('flow.prompt.dtPoolType is invalid.')
      const expectedTargetWordId = prompt.kind === 'familiar-dt' ? undefined : isRecord(prompt.word) ? prompt.word.id : undefined
      if (prompt.targetWordId !== expectedTargetWordId) errors.push('flow.prompt.targetWordId is invalid.')
      const expectedPromptId = isRecord(prompt.word) && isNonEmptyString(prompt.word.id)
        ? `${flow.datasetId}-${flow.targetIndex}-${flow.phase}-${flow.step}-${flow.trialNumber}-${prompt.kind}-${prompt.word.id}`
        : ''
      if (prompt.id !== expectedPromptId) errors.push('flow.prompt.id does not match the stable prompt identity formula.')
    }
  }
}

export function validateAcquisitionProgressEnvelope<TTarget extends AcquisitionTarget>(
  value: unknown,
  context: AcquisitionPersistenceContext<TTarget>,
): AcquisitionValidationResult<TTarget> {
  const errors: string[] = []
  validateContext(context, errors)
  if (!isRecord(value)) return { valid: false, errors: ['Progress envelope must be an object.'] }
  if (value.schemaVersion !== ACQUISITION_PROGRESS_SCHEMA_VERSION) errors.push('schemaVersion is unsupported.')
  if (value.contractId !== ACQUISITION_PERSISTENCE_CONTRACT_ID) errors.push('contractId is unsupported.')

  const expectedId = acquisitionProgressionId(context.identity)
  if (value.id !== expectedId) errors.push('Progression ID does not match its complete identity tuple.')
  for (const [key, expected] of Object.entries(context.identity)) if (value[key] !== expected) errors.push(`${key} does not match the persistence context.`)
  if (!isRecord(value.lifecycleStageAtLastCheckpoint)
    || (value.lifecycleStageAtLastCheckpoint.kind !== 'acquisition'
      && (value.lifecycleStageAtLastCheckpoint.kind !== 'test-review' || !isPositiveInteger(value.lifecycleStageAtLastCheckpoint.cycle)))) errors.push('lifecycleStageAtLastCheckpoint is invalid.')
  if (!isNonEmptyString(value.applicationVersion)) errors.push('applicationVersion is invalid.')
  if (value.strategyId !== context.strategy.id || value.strategyVersion !== context.strategy.version) errors.push('Envelope strategy does not match the supplied strategy.')
  if (value.strategyFingerprint !== acquisitionStrategyFingerprint(context.strategy)) errors.push('strategyFingerprint does not match the complete supplied strategy.')

  const expectedTargetIds = context.targetSet.targets.map((target) => target.id)
  if (!Array.isArray(value.targetOccurrenceIds) || value.targetOccurrenceIds.length !== expectedTargetIds.length || value.targetOccurrenceIds.some((id, index) => id !== expectedTargetIds[index])) errors.push('targetOccurrenceIds do not match the canonical ordered target set.')
  if (value.targetSetFingerprint !== acquisitionTargetSetFingerprint(context.targetSet)) errors.push('targetSetFingerprint does not match the canonical target set.')
  if (!isNonNegativeInteger(value.revision)) errors.push('revision must be a non-negative integer.')
  if (value.status !== 'in-progress' && value.status !== 'teaching-complete') errors.push('status is invalid.')
  if (!isIsoTimestamp(value.createdAt) || !isIsoTimestamp(value.updatedAt)) errors.push('createdAt and updatedAt must be canonical ISO timestamps.')
  if (isIsoTimestamp(value.createdAt) && isIsoTimestamp(value.updatedAt) && value.createdAt > value.updatedAt) errors.push('createdAt cannot be after updatedAt.')
  if ('migratedFromProgressionId' in value && !isNonEmptyString(value.migratedFromProgressionId)) errors.push('migratedFromProgressionId is invalid.')

  if ('lastAppliedTransition' in value) {
    const transition = value.lastAppliedTransition
    if (!isRecord(transition)
      || !isNonEmptyString(transition.transitionId)
      || transition.progressionId !== value.id
      || !isNonEmptyString(transition.payloadFingerprint)
      || (transition.operation !== 'answer' && transition.operation !== 'resume-dt-practice')
      || !isNonEmptyString(transition.promptId)
      || !isNonNegativeInteger(transition.expectedRevision)
      || !isPositiveInteger(transition.appliedRevision)
      || !isIsoTimestamp(transition.appliedAt)) errors.push('lastAppliedTransition is invalid.')
    else {
      if (transition.appliedRevision !== transition.expectedRevision + 1) errors.push('lastAppliedTransition revision step is invalid.')
      if (transition.appliedRevision !== value.revision) errors.push('lastAppliedTransition must describe the current revision.')
      if (transition.transitionId !== acquisitionTransitionId(value.id as string, transition.expectedRevision, transition.operation, transition.promptId)) errors.push('lastAppliedTransition identity is invalid.')
      if (isIsoTimestamp(value.updatedAt) && transition.appliedAt !== value.updatedAt) errors.push('lastAppliedTransition timestamp must match updatedAt.')
    }
  } else if (isNonNegativeInteger(value.revision) && value.revision !== 0) {
    errors.push('A nonzero revision requires a lastAppliedTransition receipt.')
  }

  validateFlow(value.flow, context, errors)
  if (isRecord(value.flow) && typeof value.flow.teachingComplete === 'boolean') {
    const expectedStatus = value.flow.teachingComplete ? 'teaching-complete' : 'in-progress'
    if (value.status !== expectedStatus) errors.push('status does not match flow.teachingComplete.')
  }

  return errors.length > 0
    ? { valid: false, errors }
    : { valid: true, envelope: value as unknown as AcquisitionProgressEnvelope<TTarget> }
}
