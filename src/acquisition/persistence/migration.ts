import type { AcquisitionTarget, EngineAcquisitionFlow } from '../contracts.ts'
import { normalizePersistedAcquisitionFlow } from '../engine.ts'
import {
  ACQUISITION_PERSISTENCE_CONTRACT_ID,
  ACQUISITION_PROGRESS_SCHEMA_VERSION,
  type AcquisitionPersistenceContext,
  type AcquisitionProgressCollectionMigrationResult,
  type AcquisitionProgressEnvelope,
  type AcquisitionProgressMigrationResult,
  type LegacyAcquisitionProgressRecord,
} from './contracts.ts'
import { acquisitionProgressionId, acquisitionStrategyFingerprint, acquisitionTargetSetFingerprint, stableAcquisitionSerialization } from './identity.ts'
import { validateAcquisitionProgressEnvelope } from './validation.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value
}

function canonicalFamiliarTarget<TTarget extends AcquisitionTarget>(target: TTarget, context: AcquisitionPersistenceContext<TTarget>) {
  if (target.datasetId !== '__established-dt__' && !target.id.startsWith('established-dt-')) return target
  const byText = context.strategy.familiarDtTargets.find((candidate) => candidate.text === target.text)
  const suffix = target.id.match(/(\d+)$/)?.[1]
  return (byText || context.strategy.familiarDtTargets.find((candidate) => candidate.id.endsWith(`-${suffix}`)) || target) as TTarget
}

function canonicalFamiliarId<TTarget extends AcquisitionTarget>(wordId: string | undefined, context: AcquisitionPersistenceContext<TTarget>) {
  if (!wordId?.startsWith('established-dt-')) return wordId
  const suffix = wordId.match(/(\d+)$/)?.[1]
  return context.strategy.familiarDtTargets.find((candidate) => candidate.id.endsWith(`-${suffix}`))?.id || wordId
}

function prepareLegacyFlow<TTarget extends AcquisitionTarget>(raw: EngineAcquisitionFlow<TTarget>, context: AcquisitionPersistenceContext<TTarget>) {
  const legacy = raw as EngineAcquisitionFlow<TTarget> & { establishedDtBag?: TTarget[] }
  const { establishedDtBag: _establishedDtBag, ...withoutLegacyBag } = legacy
  const familiarDtBag = (Array.isArray(raw.familiarDtBag) ? raw.familiarDtBag : legacy.establishedDtBag || [])
    .map((target) => canonicalFamiliarTarget(target, context))
  const prompt = raw.prompt ? {
    ...raw.prompt,
    kind: String(raw.prompt.kind) === 'established-dt' ? 'familiar-dt' as const : raw.prompt.kind,
    word: canonicalFamiliarTarget(raw.prompt.word, context),
    targetWordId: canonicalFamiliarId(raw.prompt.targetWordId, context),
    dtPoolType: String(raw.prompt.dtPoolType) === 'established' ? 'familiar' as const : raw.prompt.dtPoolType,
    revealed: false,
  } : null
  return {
    ...withoutLegacyBag,
    familiarDtBag,
    lastDtWordId: canonicalFamiliarId(raw.lastDtWordId, context),
    prompt,
  } as EngineAcquisitionFlow<TTarget>
}

export function createAcquisitionProgressEnvelope<TTarget extends AcquisitionTarget>(
  context: AcquisitionPersistenceContext<TTarget>,
  flow: EngineAcquisitionFlow<TTarget>,
  timestamp: string,
  migratedFromProgressionId?: string,
): AcquisitionProgressEnvelope<TTarget> {
  const id = acquisitionProgressionId(context.identity)
  const envelope: AcquisitionProgressEnvelope<TTarget> = {
    schemaVersion: ACQUISITION_PROGRESS_SCHEMA_VERSION,
    contractId: ACQUISITION_PERSISTENCE_CONTRACT_ID,
    id,
    ...context.identity,
    lifecycleStageAtLastCheckpoint: context.lifecycleStage,
    applicationVersion: context.applicationVersion,
    strategyId: context.strategy.id,
    strategyVersion: context.strategy.version,
    strategyFingerprint: acquisitionStrategyFingerprint(context.strategy),
    targetSetFingerprint: acquisitionTargetSetFingerprint(context.targetSet),
    targetOccurrenceIds: context.targetSet.targets.map((target) => target.id),
    revision: 0,
    status: flow.teachingComplete ? 'teaching-complete' : 'in-progress',
    flow,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(migratedFromProgressionId && migratedFromProgressionId !== id ? { migratedFromProgressionId } : {}),
  }
  const validation = validateAcquisitionProgressEnvelope(envelope, context)
  if (!validation.valid) throw new Error(validation.errors.join(' '))
  return validation.envelope
}

export function migrateAcquisitionProgress<TTarget extends AcquisitionTarget>(
  raw: unknown,
  context: AcquisitionPersistenceContext<TTarget>,
): AcquisitionProgressMigrationResult<TTarget> {
  if (isRecord(raw) && raw.schemaVersion === ACQUISITION_PROGRESS_SCHEMA_VERSION) {
    const validation = validateAcquisitionProgressEnvelope(raw, context)
    if (validation.valid) return { status: 'already-current', envelope: validation.envelope }
    const upgrade = (context.strategyUpgrades || []).find((candidate) => candidate.fromStrategyId === raw.strategyId
      && candidate.fromStrategyVersion === raw.strategyVersion
      && candidate.fromStrategyFingerprint === raw.strategyFingerprint)
    if (!upgrade || !isRecord(raw.flow)) return { status: 'quarantined', reason: validation.errors.join(' '), raw }
    const canonicalTargetFingerprint = acquisitionTargetSetFingerprint(context.targetSet)
    const canonicalTargetIds = context.targetSet.targets.map((target) => target.id)
    if (raw.targetSetFingerprint !== canonicalTargetFingerprint
      || !Array.isArray(raw.targetOccurrenceIds)
      || raw.targetOccurrenceIds.length !== canonicalTargetIds.length
      || raw.targetOccurrenceIds.some((targetId, index) => targetId !== canonicalTargetIds[index])) {
      return { status: 'quarantined', reason: 'A strategy upgrade cannot change the canonical ordered target set.', raw }
    }
    try {
      const upgradedFlow = upgrade.upgrade(raw.flow as unknown as EngineAcquisitionFlow<TTarget>, context.targetSet, context.strategy)
      const candidate = {
        ...raw,
        lifecycleStageAtLastCheckpoint: context.lifecycleStage,
        applicationVersion: context.applicationVersion,
        strategyId: context.strategy.id,
        strategyVersion: context.strategy.version,
        strategyFingerprint: acquisitionStrategyFingerprint(context.strategy),
        targetSetFingerprint: acquisitionTargetSetFingerprint(context.targetSet),
        targetOccurrenceIds: context.targetSet.targets.map((target) => target.id),
        status: upgradedFlow.teachingComplete ? 'teaching-complete' as const : 'in-progress' as const,
        flow: upgradedFlow.prompt ? { ...upgradedFlow, prompt: { ...upgradedFlow.prompt, revealed: false } } : upgradedFlow,
      }
      const upgradedValidation = validateAcquisitionProgressEnvelope(candidate, context)
      return upgradedValidation.valid
        ? { status: 'migrated', envelope: upgradedValidation.envelope }
        : { status: 'quarantined', reason: upgradedValidation.errors.join(' '), raw }
    } catch (error) {
      return { status: 'quarantined', reason: error instanceof Error ? error.message : 'Acquisition strategy upgrade failed.', raw }
    }
  }
  if (!isRecord(raw)
    || typeof raw.id !== 'string'
    || raw.childId !== context.identity.childId
    || raw.datasetId !== context.identity.datasetId
    || raw.grade !== context.identity.grade
    || !isRecord(raw.flow)
    || !isCanonicalIsoTimestamp(raw.updatedAt)) {
    return { status: 'quarantined', reason: 'Legacy Acquisition progress identity or timestamp is invalid.', raw }
  }

  const legacy = raw as unknown as LegacyAcquisitionProgressRecord<TTarget>
  try {
    const prepared = prepareLegacyFlow(legacy.flow, context)
    const normalized = normalizePersistedAcquisitionFlow(prepared, context.strategy, () => 0)
    const flow = normalized.prompt ? {
      ...normalized,
      prompt: {
        ...normalized.prompt,
        id: `${normalized.datasetId}-${normalized.targetIndex}-${normalized.phase}-${normalized.step}-${normalized.trialNumber}-${normalized.prompt.kind}-${normalized.prompt.word.id}`,
        revealed: false,
      },
    } : normalized
    const envelope = createAcquisitionProgressEnvelope(context, flow, legacy.updatedAt, legacy.id)
    const validation = validateAcquisitionProgressEnvelope(envelope, context)
    return validation.valid
      ? { status: 'migrated', envelope: validation.envelope }
      : { status: 'quarantined', reason: validation.errors.join(' '), raw }
  } catch (error) {
    return { status: 'quarantined', reason: error instanceof Error ? error.message : 'Legacy Acquisition progress could not be migrated.', raw }
  }
}

export function migrateAcquisitionProgressCollection<TTarget extends AcquisitionTarget>(
  rawRecords: readonly unknown[],
  contextFor: (raw: unknown, index: number) => AcquisitionPersistenceContext<TTarget> | null,
): AcquisitionProgressCollectionMigrationResult<TTarget> {
  const converted: { index: number; raw: unknown; envelope: AcquisitionProgressEnvelope<TTarget> }[] = []
  const quarantined: { index: number; reason: string; raw: unknown }[] = []
  rawRecords.forEach((raw, index) => {
    const context = contextFor(raw, index)
    if (!context) {
      quarantined.push({ index, reason: 'No canonical Acquisition persistence context was available.', raw })
      return
    }
    const result = migrateAcquisitionProgress(raw, context)
    if (result.status === 'quarantined') quarantined.push({ index, reason: result.reason, raw: result.raw })
    else converted.push({ index, raw, envelope: result.envelope })
  })

  const byProgression = new Map<string, typeof converted>()
  for (const entry of converted) byProgression.set(entry.envelope.id, [...(byProgression.get(entry.envelope.id) || []), entry])
  const envelopes: AcquisitionProgressEnvelope<TTarget>[] = []
  for (const [progressionId, entries] of byProgression) {
    const projections = new Set(entries.map((entry) => stableAcquisitionSerialization(entry.envelope)))
    if (projections.size === 1) {
      envelopes.push(entries[0].envelope)
      continue
    }
    for (const entry of entries) quarantined.push({ index: entry.index, reason: `Conflicting records reuse progression identity ${progressionId}.`, raw: entry.raw })
  }
  return {
    envelopes: envelopes.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    quarantined: quarantined.sort((left, right) => left.index - right.index || (left.reason < right.reason ? -1 : left.reason > right.reason ? 1 : 0)),
  }
}
