import type { AcquisitionTarget } from '../contracts.ts'
import type {
  AcquisitionLessonSnapshot,
  AcquisitionPersistenceContext,
  AcquisitionProgressEnvelope,
} from './contracts.ts'
import { acquisitionDigest } from './identity.ts'
import { validateAcquisitionProgressEnvelope } from './validation.ts'

const MAX_SNAPSHOT_BYTES = 250_000
const failure = 'The original lesson could not be safely restored. Nothing was erased. Please report this problem.'
const timerKeys = [
  'familiarDtSeconds',
  'earnedDtSeconds',
  'introductionShowCopySeconds',
  'introductionHiddenTargetSeconds',
  'expandedStartSeconds',
  'expandedMinimumSeconds',
  'expandedDecrementSeconds',
  'correctionShowCopySeconds',
  'correctionHiddenSeconds',
]

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function targets(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 1000 &&
    value.every(
      (t) =>
        record(t) &&
        typeof t.id === 'string' &&
        t.id.length > 0 &&
        typeof t.datasetId === 'string' &&
        typeof t.text === 'string' &&
        t.text.length > 0 &&
        typeof t.sentence === 'string',
    )
  )
}

function validateSnapshot(value: unknown): asserts value is AcquisitionLessonSnapshot {
  if (
    !record(value) ||
    value.schema !== 1 ||
    value.engineContract !== 'acquisition-engine-v1' ||
    typeof value.applicationVersion !== 'string' ||
    !value.applicationVersion ||
    !record(value.targetSet) ||
    typeof value.targetSet.id !== 'string' ||
    !targets(value.targetSet.targets) ||
    !record(value.strategy) ||
    !record(value.strategy.timers) ||
    !targets(value.strategy.familiarDtTargets) ||
    !['collect', 'discard'].includes(String(value.strategy.dtObservationMode))
  )
    throw new Error(failure)
  const timers = value.strategy.timers
  if (
    timerKeys.some((key) => !Number.isFinite(timers[key]) || Number(timers[key]) <= 0 || Number(timers[key]) > 3600) ||
    Number(timers.expandedMinimumSeconds) > Number(timers.expandedStartSeconds)
  )
    throw new Error(failure)
  for (const name of ['introductionSequence', 'expandedSequence', 'correctionSequence']) {
    const sequence = value.strategy[name]
    if (
      !Array.isArray(sequence) ||
      !sequence.length ||
      sequence.length > 1000 ||
      !sequence.every((token) => ['familiar-dt', 'dt', 'show-copy', 'target'].includes(token))
    )
      throw new Error(failure)
  }
  const { fingerprint, ...payload } = value
  if (
    new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_SNAPSHOT_BYTES ||
    fingerprint !== acquisitionDigest(payload)
  )
    throw new Error(failure)
}

/** Resolve explicitly, then use the ordinary strict validator/reducer unchanged. */
export function resolveAcquisitionLesson<T extends AcquisitionTarget>(
  envelope: AcquisitionProgressEnvelope<T>,
  latest: AcquisitionPersistenceContext<T>,
): AcquisitionPersistenceContext<T> {
  if (!('lessonSnapshot' in envelope)) return latest
  const snapshot = envelope.lessonSnapshot
  validateSnapshot(snapshot)
  const context: AcquisitionPersistenceContext<T> = {
    ...latest,
    applicationVersion: snapshot.applicationVersion,
    targetSet: snapshot.targetSet as AcquisitionPersistenceContext<T>['targetSet'],
    strategy: snapshot.strategy as AcquisitionPersistenceContext<T>['strategy'],
    // Never upgrade a pinned strategy implicitly.
    strategyUpgrades: [],
  }
  if (!validateAcquisitionProgressEnvelope(envelope, context).valid) throw new Error(failure)
  return context
}

/** Only bind legacy progress after the complete original context validates exactly. */
export function pinAcquisitionLesson<T extends AcquisitionTarget>(
  envelope: AcquisitionProgressEnvelope<T>,
  context: AcquisitionPersistenceContext<T>,
): AcquisitionProgressEnvelope<T> {
  if ('lessonSnapshot' in envelope) {
    resolveAcquisitionLesson(envelope, context)
    return envelope
  }
  if (!validateAcquisitionProgressEnvelope(envelope, context).valid) throw new Error(failure)
  const payload = JSON.parse(
    JSON.stringify({
      schema: 1,
      engineContract: 'acquisition-engine-v1',
      applicationVersion: context.applicationVersion,
      targetSet: context.targetSet,
      strategy: context.strategy,
    }),
  )
  const lessonSnapshot = { ...payload, fingerprint: acquisitionDigest(payload) } as AcquisitionLessonSnapshot<T>
  validateSnapshot(lessonSnapshot)
  return { ...envelope, lessonSnapshot }
}
