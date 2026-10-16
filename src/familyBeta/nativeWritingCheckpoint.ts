import type { AcquisitionTarget } from '../acquisition/contracts.ts'
import type { AcquisitionCheckpoint, AcquisitionProgressEnvelope } from '../acquisition/persistence/contracts.ts'
import { acquisitionDigest } from '../acquisition/persistence/identity.ts'
import {
  createWritingLesson,
  GRADE5_WRITING_POLICY,
  KINDERGARTEN_WRITING_POLICY,
} from '../application/writingAcquisition/lesson.ts'
import {
  advanceWritingProgress,
  createWritingProgress,
  teachingPosition,
  validateWritingProgress,
  type WritingCommand,
  type WritingProgress,
} from '../application/writingAcquisition/progress.ts'
import type { Dataset, Word } from '../domain/contracts.ts'
import { validWriter } from './deviceWriter.ts'

/** Supplied only by the native writing launchers; other games keep schema 1. */
export type NativeWritingAdapter<T extends AcquisitionTarget> = {
  prepare: (envelope: AcquisitionProgressEnvelope<T>, legacy: boolean, timestamp: string) => WritingProgress
  validate: (progress: unknown, envelope: AcquisitionProgressEnvelope<T>) => void
  validateRecord: (record: unknown, childId: string) => void
  checkpoint: (
    progress: WritingProgress,
    envelope: AcquisitionProgressEnvelope<T>,
    checkpoint: AcquisitionCheckpoint<T>,
  ) => WritingProgress
  teach: (progress: WritingProgress, command: WritingCommand, timestamp: string) => WritingProgress
  assertAnswer: (progress: WritingProgress) => void
}

export function nativeWritingAdapter<T extends AcquisitionTarget>(dataset: Dataset): NativeWritingAdapter<T> {
  if (!['Kindergarten', 'Grade 5'].includes(dataset.grade)) throw new Error('Choose a supported native writing grade.')
  return {
    prepare(envelope, legacy, timestamp) {
      if (!envelope.lessonSnapshot || envelope.grade !== dataset.grade || envelope.datasetId !== dataset.id)
        throw new Error('The pinned writing lesson is unavailable. Nothing was changed.')
      const lesson = createWritingLesson(
        { ...dataset, words: [...envelope.lessonSnapshot.targetSet.targets] as Word[] },
        dataset.grade === 'Kindergarten' ? KINDERGARTEN_WRITING_POLICY : GRADE5_WRITING_POLICY,
      )
      const pinned = envelope as unknown as AcquisitionProgressEnvelope<Word>
      return createWritingProgress(
        lesson,
        envelope.childId,
        envelope.id,
        timestamp,
        legacy ? { legacy: pinned } : { initial: pinned },
      )
    },
    validate(progress, envelope) {
      validateNativeWritingProgress(progress, envelope)
    },
    validateRecord(record, childId) {
      nativeWritingPayload(JSON.stringify(record), childId)
    },
    assertAnswer(progress) {
      if (teachingPosition(progress)) throw new Error('Complete every character before the acquisition trial.')
    },
    checkpoint(progress, envelope, checkpoint) {
      if (checkpoint.expectedRevision !== progress.acquisition.revision || checkpoint.occurredAt < progress.updatedAt)
        throw new Error('Writing changed or its clock moved backwards. Nothing was advanced.')
      const next: WritingProgress = {
        ...progress,
        acquisition: envelope as unknown as AcquisitionProgressEnvelope<Word>,
        revision: progress.revision + 1,
        updatedAt: checkpoint.occurredAt,
        // Native reviewedTrials is the scoring source. This mirror retains only
        // post-integration assessments and is never submitted as another score.
        assessments: checkpoint.assessment
          ? [...progress.assessments, checkpoint.assessment as unknown as WritingProgress['assessments'][number]]
          : progress.assessments,
        lastCommand: { id: checkpoint.transitionId, fingerprint: acquisitionDigest(checkpoint) },
      }
      validateNativeWritingProgress(next, envelope)
      return next
    },
    teach(progress, command, timestamp) {
      if (command.kind !== 'complete-teaching-step') throw new Error('Use the native acquisition answer checkpoint.')
      return advanceWritingProgress(progress, command, timestamp)
    },
  }
}

export function validateNativeWritingProgress(progress: unknown, envelope: AcquisitionProgressEnvelope) {
  validateWritingProgress(progress, envelope.childId)
  if (
    !['Kindergarten', 'Grade 5'].includes(envelope.grade) ||
    !/^writing-dojo(?::restart-[a-f0-9]{16})?$/.test(envelope.activityModule || '') ||
    progress.attemptId !== envelope.id ||
    acquisitionDigest(progress.acquisition) !== acquisitionDigest(envelope)
  )
    throw new Error('Writing and native acquisition checkpoints disagree. Both copies were preserved.')
}

/** Validate before adopting or ordering a combined native checkpoint. */
export function nativeWritingPayload(raw: string, childId: string): WritingProgress | null {
  const saved = JSON.parse(raw)
  if (saved?.schema !== 2) {
    if (saved?.writing !== undefined) throw new Error('Unsupported native writing record. Nothing was replaced.')
    return null
  }
  const validTime = (value: unknown) =>
    typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
  const validAssessment = (a: WritingProgress['assessments'][number]) =>
    a &&
    typeof a.correct === 'boolean' &&
    typeof a.countsTowardWeeklyScore === 'boolean' &&
    typeof a.promptId === 'string' &&
    typeof a.revealMethod === 'string' &&
    a.target &&
    typeof a.target.id === 'string' &&
    Object.keys(a).every((key) =>
      [
        'promptId',
        'targetOccurrenceId',
        'target',
        'kind',
        'correct',
        'countsTowardWeeklyScore',
        'dtPoolType',
        'revealMethod',
      ].includes(key),
    )
  if (
    !saved.envelope ||
    saved.envelope.childId !== childId ||
    typeof saved.sessionId !== 'string' ||
    !/^[\w-]{1,160}$/.test(saved.sessionId) ||
    ('writerId' in saved && !validWriter(saved.writerId)) ||
    Object.keys(saved).some(
      (key) =>
        !['schema', 'sessionId', 'writerId', 'envelope', 'assessments', 'reviewedTrials', 'writing'].includes(key),
    ) ||
    !Array.isArray(saved.assessments) ||
    !Array.isArray(saved.reviewedTrials) ||
    saved.assessments.length > 500 ||
    saved.reviewedTrials.length > 500 ||
    !saved.assessments.every(validAssessment) ||
    saved.reviewedTrials.some(
      (trial: { sessionId: string; reviewedAt: string; assessment: WritingProgress['assessments'][number] }) =>
        !trial ||
        typeof trial.sessionId !== 'string' ||
        !/^[\w-]{1,160}$/.test(trial.sessionId) ||
        !validTime(trial.reviewedAt) ||
        !validAssessment(trial.assessment) ||
        Object.keys(trial).some((key) => !['sessionId', 'reviewedAt', 'assessment'].includes(key)),
    )
  )
    throw new Error('The combined native writing record is invalid. Nothing was replaced.')
  validateNativeWritingProgress(saved.writing, saved.envelope)
  const facts = saved.reviewedTrials.map((trial: { assessment: unknown }) => trial.assessment)
  for (const assessments of [saved.assessments, saved.writing.assessments]) {
    if (
      assessments.length > facts.length ||
      (assessments.length && acquisitionDigest(assessments) !== acquisitionDigest(facts.slice(-assessments.length)))
    )
      throw new Error('Native writing review history disagrees. Nothing was replaced.')
  }
  return saved.writing
}

export function chooseNativeWritingPayload(local: string, online: string, childId: string, referenceNow: string) {
  const a = nativeWritingPayload(local, childId),
    b = nativeWritingPayload(online, childId)
  // A legacy device may have advanced independently. Never downgrade or merge
  // across that schema boundary; preserve both copies for explicit recovery.
  if (
    !a ||
    !b ||
    a.lesson.fingerprint !== b.lesson.fingerprint ||
    a.acquisition.id !== b.acquisition.id ||
    a.firstTeacherTargetIndex !== b.firstTeacherTargetIndex ||
    a.initialAcquisitionRevision !== b.initialAcquisitionRevision
  )
    return null
  const reference = Date.parse(referenceNow)
  const at = a.revision && a.lastCommand ? Date.parse(a.updatedAt) : null
  const bt = b.revision && b.lastCommand ? Date.parse(b.updatedAt) : null
  if (
    !Number.isFinite(reference) ||
    (at !== null && at > reference + 300_000) ||
    (bt !== null && bt > reference + 300_000)
  )
    return null
  if (at === null && bt === null) return null
  if (at === null) return 'online'
  if (bt === null) return 'local'
  return at !== bt
    ? at > bt
      ? 'local'
      : 'online'
    : a.revision !== b.revision
      ? a.revision > b.revision
        ? 'local'
        : 'online'
      : local.localeCompare(online) >= 0
        ? 'local'
        : 'online'
}
