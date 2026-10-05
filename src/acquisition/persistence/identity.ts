import type { AcquisitionStrategy, AcquisitionTarget, AcquisitionTargetSet } from '../contracts.ts'
import type { AcquisitionCheckpoint, AcquisitionProgressIdentity } from './contracts.ts'

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => [key, canonicalValue(entry)]),
  )
}

export function stableAcquisitionSerialization(value: unknown) {
  return JSON.stringify(canonicalValue(value))
}

export function acquisitionDigest(value: unknown) {
  const input = stableAcquisitionSerialization(value)
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193) >>> 0
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0
  }
  return `${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}`
}

export function acquisitionProgressionId(identity: AcquisitionProgressIdentity) {
  return `acq-progress-v1-${acquisitionDigest(identity)}`
}

function targetFingerprintValue(target: AcquisitionTarget) {
  return {
    id: target.id,
    text: target.text,
    sentence: target.sentence,
    datasetId: target.datasetId,
    language: target.language,
    tier: target.tier,
    activityType: target.activityType,
  }
}

export function acquisitionTargetSetFingerprint<TTarget extends AcquisitionTarget>(targetSet: AcquisitionTargetSet<TTarget>) {
  return `acq-targets-v1-${acquisitionDigest({ id: targetSet.id, targets: targetSet.targets.map(targetFingerprintValue) })}`
}

export function acquisitionStrategyFingerprint<TTarget extends AcquisitionTarget>(strategy: AcquisitionStrategy<TTarget>) {
  return `acq-strategy-v1-${acquisitionDigest({
    id: strategy.id,
    version: strategy.version,
    timers: strategy.timers,
    dtObservationMode: strategy.dtObservationMode,
    correctionPolicy: strategy.correctionPolicy,
    familiarDtTargets: strategy.familiarDtTargets.map(targetFingerprintValue),
    introductionSequence: strategy.introductionSequence,
    expandedSequence: strategy.expandedSequence,
    correctionSequence: strategy.correctionSequence,
  })}`
}

export function acquisitionTransitionId(progressionId: string, expectedRevision: number, operation: AcquisitionCheckpoint['operation'], promptId: string) {
  return `acq-transition-v1-${acquisitionDigest({ progressionId, expectedRevision, operation, promptId })}`
}

export function acquisitionFactId(transitionId: string, kind: 'attempt' | 'dt-observation') {
  return `acq-${kind}-v1-${acquisitionDigest({ transitionId, kind })}`
}

export function acquisitionCheckpointPayloadFingerprint<TTarget extends AcquisitionTarget>(
  checkpoint: Omit<AcquisitionCheckpoint<TTarget>, 'payloadFingerprint'>,
) {
  return `acq-checkpoint-v1-${acquisitionDigest(checkpoint)}`
}
