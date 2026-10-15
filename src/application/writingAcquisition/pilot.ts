import type { AppState, Dataset, PracticeSession, Word } from '../../domain.ts'
import type { AcquisitionCheckpoint, AcquisitionProgressEnvelope } from '../../acquisition/persistence/contracts.ts'
import { acquisitionDigest } from '../../acquisition/persistence/identity.ts'
import { createWritingLesson } from './lesson.ts'
export { createConfirmedWritingTransition } from './confirmedTransition.ts'
export { createConfirmedWritingLaunch } from './confirmedLaunch.ts'
export { withScrollsWrite } from '../../familyBeta/scrollsCompletion.ts'
import {
  advanceWritingProgress,
  createWritingCommand,
  createWritingProgress,
  teachingPosition,
  validateWritingProgress,
  type WritingProgress,
} from './progress.ts'

const unavailable = 'This lesson needs the approved writing pilot. Your saved work was preserved.'

export function progressFor(state: AppState, progressionId?: string) {
  const matches = (state.writingAcquisitionProgress || []).filter((p) => p.acquisition.id === progressionId)
  if (matches.length > 1) throw new Error('Conflicting writing checkpoints were preserved.')
  return matches[0]
}

function replace(state: AppState, progress: WritingProgress): AppState {
  return {
    ...state,
    writingAcquisitionProgress: [
      ...(state.writingAcquisitionProgress || []).filter((p) => p.acquisition.id !== progress.acquisition.id),
      progress,
    ],
  }
}

export function assertWritingMatches(state: AppState, progress: WritingProgress) {
  validateWritingProgress(progress, progress.owner)
  const envelope = state.acquisitionProgressEnvelopes?.find((e) => e.id === progress.acquisition.id)
  if (!envelope || acquisitionDigest(envelope) !== acquisitionDigest(progress.acquisition))
    throw new Error('Writing and acquisition checkpoints disagree. Both copies were preserved.')
  if (state.acquisitionPendingCheckpoints?.some((c) => c.progressionId === envelope.id))
    throw new Error('An older pending answer needs review before this writing lesson can continue.')
}

export function prepare(input: {
  state: AppState
  dataset: Dataset
  envelope: AcquisitionProgressEnvelope<Word>
  legacy: boolean
  timestamp: string
}): AppState {
  const { state, envelope } = input
  if (envelope.grade !== 'Grade 2' || envelope.tier !== 'tier-1') throw new Error(unavailable)
  const saved = progressFor(state, envelope.id)
  if (saved) {
    assertWritingMatches(state, saved)
    return state
  }
  if (!envelope.lessonSnapshot) throw new Error('The original writing lesson is unavailable. Nothing was changed.')
  const lesson = createWritingLesson({ ...input.dataset, words: [...envelope.lessonSnapshot.targetSet.targets] })
  const progress = createWritingProgress(
    lesson,
    envelope.childId,
    envelope.id,
    input.timestamp,
    input.legacy ? { legacy: envelope } : { initial: envelope },
  )
  const next = replace(state, progress)
  assertWritingMatches(next, progress)
  return next
}

/** Consume the SAME checkpoint used by normal scoring, not another engine/random call. */
export function withCheckpoint(before: AppState, applied: AppState, checkpoint: AcquisitionCheckpoint<Word>): AppState {
  const progress = progressFor(before, checkpoint.progressionId)
  if (!progress) throw new Error(unavailable)
  assertWritingMatches(before, progress)
  if (teachingPosition(progress)) throw new Error('Complete every character before the acquisition trial.')
  if (checkpoint.expectedRevision !== progress.acquisition.revision || checkpoint.occurredAt < progress.updatedAt)
    throw new Error('The writing checkpoint changed or its clock moved backwards. Nothing was advanced.')
  const acquisition = applied.acquisitionProgressEnvelopes?.find((e) => e.id === checkpoint.progressionId)
  if (!acquisition || acquisition.revision !== progress.acquisition.revision + 1)
    throw new Error('The acquisition transition could not be confirmed.')
  const next: WritingProgress = {
    ...progress,
    acquisition,
    revision: progress.revision + 1,
    updatedAt: checkpoint.occurredAt,
    assessments: checkpoint.assessment ? [...progress.assessments, checkpoint.assessment] : progress.assessments,
    lastCommand: { id: checkpoint.transitionId, fingerprint: acquisitionDigest(checkpoint) },
  }
  validateWritingProgress(next, progress.owner)
  return replace(applied, next)
}

export function completeStep(state: AppState, session: PracticeSession, step: number, timestamp: string) {
  const progress = progressFor(state, session.acquisitionProgressionId)
  if (
    !progress ||
    session.segment !== 'primary' ||
    session.primaryPhase !== 'acquisition' ||
    session.childId !== progress.owner
  )
    throw new Error(unavailable)
  assertWritingMatches(state, progress)
  const position = teachingPosition(progress)
  if (!position || position.step !== step) throw new Error('This teaching step is no longer current.')
  return replace(
    state,
    advanceWritingProgress(
      progress,
      createWritingCommand({
        kind: 'complete-teaching-step',
        expectedRevision: progress.revision,
        position,
      }),
      timestamp,
    ),
  )
}

export type WritingPilotCoordinator = {
  prepare: typeof prepare
  withCheckpoint: typeof withCheckpoint
}
