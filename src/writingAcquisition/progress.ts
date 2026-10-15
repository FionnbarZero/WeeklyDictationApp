import type { AcquisitionAssessment } from '../acquisition/contracts.ts'
import { startAcquisition } from '../acquisition/engine.ts'
import type {
  AcquisitionPersistenceContext,
  AcquisitionProgressEnvelope,
} from '../acquisition/persistence/contracts.ts'
import { acquisitionDigest } from '../acquisition/persistence/identity.ts'
import { pinAcquisitionLesson } from '../acquisition/persistence/lessonSnapshot.ts'
import { createAcquisitionProgressEnvelope } from '../acquisition/persistence/migration.ts'
import { applyAcquisitionCheckpoint, buildAcquisitionCheckpoint } from '../acquisition/persistence/reducer.ts'
import { validateAcquisitionProgressEnvelope } from '../acquisition/persistence/validation.ts'
import { grade2AcquisitionStrategy } from '../acquisition/strategies/grade2.ts'
import type { Word } from '../domain/contracts.ts'
import { validateWritingLesson, type WritingLesson } from './lesson.ts'

export const WRITING_PROGRESS_CONTRACT = 'grade2-writing-progress-v1' as const
const fail = 'Saved writing could not be safely continued. Your progress was preserved; please report the problem.'
export type WritingProgress = {
  contract: typeof WRITING_PROGRESS_CONTRACT
  owner: string
  attemptId: string
  revision: number
  createdAt: string
  updatedAt: string
  lesson: WritingLesson
  /** Legacy target already in progress finishes under its old rules. */
  firstTeacherTargetIndex: number
  initialAcquisitionRevision: number
  completedTeachingSteps: number[]
  acquisition: AcquisitionProgressEnvelope<Word>
  assessments: AcquisitionAssessment<Word, string>[]
  lastCommand?: { id: string; fingerprint: string }
}
export type TeachingPosition = { targetIndex: number; targetId: string; characterIndex: number; step: number }
export type WritingCommand =
  | { id: string; expectedRevision: number; kind: 'complete-teaching-step'; position: TeachingPosition }
  | { id: string; expectedRevision: number; kind: 'answer'; promptId: string; correct: boolean; revealMethod: string }

const canonicalTime = (value: string) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
const validId = (value: string) => typeof value === 'string' && /^[\w-]{1,160}$/.test(value)

export function writingContext(lesson: WritingLesson, owner: string): AcquisitionPersistenceContext<Word> {
  return {
    identity: {
      childId: owner,
      grade: 'Grade 2',
      datasetId: lesson.dataset.id,
      schoolYear: '2026-27',
      activityModule: 'mandarin-tier1-writing',
      tier: 'tier-1',
    },
    lifecycleStage: { kind: 'acquisition' },
    applicationVersion: WRITING_PROGRESS_CONTRACT,
    targetSet: { id: lesson.dataset.id, targets: lesson.dataset.words },
    strategy: grade2AcquisitionStrategy,
  }
}

export function teachingPosition(progress: WritingProgress): TeachingPosition | null {
  const flow = progress.acquisition.flow
  const index = flow.targetIndex
  if (
    flow.mode !== 'teaching' ||
    flow.teachingComplete ||
    flow.correctionRole === 'earned-dt' ||
    index < progress.firstTeacherTargetIndex
  )
    return null
  const target = progress.lesson.targets[index]
  if (!target || progress.completedTeachingSteps[index] === [...target.text].length * 6) return null
  if (flow.currentTarget?.id !== target.id || flow.phase !== 'introduction' || flow.step !== 0)
    throw new Error('The writing target advanced before its teaching was complete. Your progress was preserved.')
  const completed = progress.completedTeachingSteps[index]
  return { targetIndex: index, targetId: target.id, characterIndex: Math.floor(completed / 6), step: completed % 6 }
}

export function validateWritingProgress(value: unknown, owner: string): asserts value is WritingProgress {
  try {
    const p = value as WritingProgress
    if (
      !p ||
      p.contract !== WRITING_PROGRESS_CONTRACT ||
      p.owner !== owner ||
      !validId(p.owner) ||
      !validId(p.attemptId) ||
      !Number.isSafeInteger(p.revision) ||
      p.revision < 0 ||
      !canonicalTime(p.createdAt) ||
      !canonicalTime(p.updatedAt) ||
      p.updatedAt < p.createdAt ||
      !Array.isArray(p.completedTeachingSteps) ||
      !Array.isArray(p.assessments) ||
      p.assessments.length > 500 ||
      !Number.isInteger(p.firstTeacherTargetIndex) ||
      p.firstTeacherTargetIndex < 0 ||
      Object.keys(p).some(
        (key) =>
          ![
            'contract',
            'owner',
            'attemptId',
            'revision',
            'createdAt',
            'updatedAt',
            'lesson',
            'firstTeacherTargetIndex',
            'initialAcquisitionRevision',
            'completedTeachingSteps',
            'acquisition',
            'assessments',
            'lastCommand',
          ].includes(key),
      )
    )
      throw new Error(fail)
    validateWritingLesson(p.lesson)
    const count = p.lesson.targets.length
    if (
      p.firstTeacherTargetIndex > count ||
      !Number.isSafeInteger(p.initialAcquisitionRevision) ||
      p.initialAcquisitionRevision < 0 ||
      p.initialAcquisitionRevision > p.acquisition.revision ||
      p.revision !==
        p.completedTeachingSteps.reduce((sum, n) => sum + n, 0) +
          p.acquisition.revision -
          p.initialAcquisitionRevision ||
      p.completedTeachingSteps.length !== count ||
      !validateAcquisitionProgressEnvelope(p.acquisition, writingContext(p.lesson, owner)).valid
    )
      throw new Error(fail)
    const currentIndex = p.acquisition.flow.targetIndex
    if (
      p.completedTeachingSteps.some(
        (steps, i) =>
          !Number.isInteger(steps) ||
          steps < 0 ||
          steps > [...p.lesson.targets[i].text].length * 6 ||
          (i < p.firstTeacherTargetIndex && steps !== 0) ||
          (i > currentIndex && steps !== 0) ||
          (i >= p.firstTeacherTargetIndex && i < currentIndex && steps !== [...p.lesson.targets[i].text].length * 6),
      )
    )
      throw new Error(fail)
    if (
      p.assessments.some(
        (a) =>
          !a ||
          typeof a.correct !== 'boolean' ||
          typeof a.countsTowardWeeklyScore !== 'boolean' ||
          typeof a.promptId !== 'string' ||
          typeof a.revealMethod !== 'string' ||
          !a.target ||
          typeof a.target.id !== 'string' ||
          Object.keys(a).some(
            (k) =>
              ![
                'promptId',
                'targetOccurrenceId',
                'target',
                'kind',
                'correct',
                'countsTowardWeeklyScore',
                'dtPoolType',
                'revealMethod',
              ].includes(k),
          ),
      )
    )
      throw new Error(fail)
    if (p.lastCommand && (!validId(p.lastCommand.id) || !/^[a-f0-9]{16}$/.test(p.lastCommand.fingerprint)))
      throw new Error(fail)
    teachingPosition(p)
  } catch (error) {
    throw new Error(error instanceof Error && /guide|target advanced/.test(error.message) ? error.message : fail)
  }
}

export function createWritingProgress(
  lesson: WritingLesson,
  owner: string,
  attemptId: string,
  timestamp: string,
  options: { random?: () => number; legacy?: AcquisitionProgressEnvelope<Word> } = {},
): WritingProgress {
  const context = writingContext(lesson, owner)
  const acquisition =
    options.legacy ||
    pinAcquisitionLesson(
      createAcquisitionProgressEnvelope(
        context,
        startAcquisition(context.targetSet, context.strategy, options.random || Math.random),
        timestamp,
      ),
      context,
    )
  const firstTeacherTargetIndex = options.legacy ? Math.min(lesson.targets.length, acquisition.flow.targetIndex + 1) : 0
  const progress: WritingProgress = {
    contract: WRITING_PROGRESS_CONTRACT,
    owner,
    attemptId,
    revision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    lesson,
    firstTeacherTargetIndex,
    initialAcquisitionRevision: acquisition.revision,
    completedTeachingSteps: lesson.targets.map(() => 0),
    acquisition,
    assessments: [],
  }
  validateWritingProgress(progress, owner)
  return progress
}

/** One pure operation retains the exact engine checkpoint and separate non-scoring teacher progress. */
export function advanceWritingProgress(
  progress: WritingProgress,
  command: WritingCommand,
  timestamp: string,
  random = Math.random,
): WritingProgress {
  validateWritingProgress(progress, progress.owner)
  if (!validId(command.id) || !canonicalTime(timestamp) || timestamp < progress.updatedAt)
    throw new Error('The writing save identity or clock is invalid.')
  const fingerprint = acquisitionDigest(command)
  if (progress.lastCommand?.id === command.id) {
    if (progress.lastCommand.fingerprint !== fingerprint)
      throw new Error('A writing save was retried with different content.')
    return progress
  }
  if (command.expectedRevision !== progress.revision)
    throw new Error('Writing changed in another window. Reopen the saved lesson to continue.')
  let next = {
    ...progress,
    revision: progress.revision + 1,
    updatedAt: timestamp,
    lastCommand: { id: command.id, fingerprint },
  }
  if (command.kind === 'complete-teaching-step') {
    const position = teachingPosition(progress)
    if (!position || acquisitionDigest(position) !== acquisitionDigest(command.position))
      throw new Error('This teaching step is no longer current.')
    next = {
      ...next,
      completedTeachingSteps: progress.completedTeachingSteps.map((value, i) =>
        i === position.targetIndex ? value + 1 : value,
      ),
    }
  } else {
    if (teachingPosition(progress))
      throw new Error('Complete every character before starting acquisition for this word.')
    if (progress.acquisition.flow.complete || !progress.acquisition.flow.prompt)
      throw new Error('This lesson is complete.')
    const context = writingContext(progress.lesson, progress.owner)
    const checkpoint = buildAcquisitionCheckpoint({
      envelope: progress.acquisition,
      context,
      sessionId: progress.attemptId,
      answeredPromptId: command.promptId,
      occurredAt: timestamp,
      response: { correct: command.correct, revealMethod: command.revealMethod },
      random,
    })
    const result = applyAcquisitionCheckpoint(progress.acquisition, checkpoint, context)
    if (result.status === 'conflict') throw new Error(result.reason)
    next = {
      ...next,
      acquisition: result.envelope,
      assessments: checkpoint.assessment ? [...progress.assessments, checkpoint.assessment] : progress.assessments,
    }
  }
  validateWritingProgress(next, progress.owner)
  return next
}
