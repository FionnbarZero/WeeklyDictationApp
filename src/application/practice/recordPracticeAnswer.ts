import { type AppState, type PracticeSession, type SessionAnswer } from '../../domain.ts'
import type { AcquisitionCheckpoint, AcquisitionProgressEnvelope } from '../../acquisition/persistence/contracts.ts'
import type { CloudAttempt, CloudSession } from '../../persistence/cloudRecords.ts'
import type { VersionedChildMasteryState, WarmupTransition, WarmupVisit } from '../../warmup/visits/contracts.ts'
import {
  acquisitionPersistenceContext,
  applyAcquisitionCheckpointToAppState,
  createAcquisitionAnswerCheckpoint,
  markAcquisitionCheckpointCommitted,
  sessionAnswerForCheckpoint,
} from '../acquisitionPersistence.ts'
import {
  applyWarmupTransitionToAppState,
  createWarmupAnswerCheckpoint,
  markWarmupTransitionCommitted,
} from '../warmup/index.ts'

export type PracticeAnswerBackgroundTask = {
  promise: Promise<unknown>
  failureMessage: string
  onSuccess?: (state: AppState) => AppState
  updatedCloudSessionId?: string
}

export type RecordPracticeAnswerPersistence = {
  cloud: boolean
  saveLocalState: (state: AppState) => boolean
  journalAcquisition: (
    checkpoint: AcquisitionCheckpoint<import('../../domain.ts').Word>,
    envelope: AcquisitionProgressEnvelope<import('../../domain.ts').Word>,
  ) => void
  acknowledgeAcquisition: (transitionId: string) => void
  commitAcquisition?: (
    envelope: AcquisitionProgressEnvelope<import('../../domain.ts').Word>,
    checkpoint: AcquisitionCheckpoint<import('../../domain.ts').Word>,
  ) => Promise<'applied' | 'idempotent'>
  journalWarmup: (transition: WarmupTransition, visit: WarmupVisit, mastery?: VersionedChildMasteryState) => void
  acknowledgeWarmup: (transitionId: string) => void
  commitWarmup?: (transition: WarmupTransition) => Promise<'applied' | 'idempotent'>
  saveAttempt?: (sessionId: string, attempt: CloudAttempt) => Promise<void>
  updateSession?: (session: CloudSession, patch: Partial<CloudSession>) => Promise<CloudSession>
}

export type RecordPracticeAnswerResult =
  | { status: 'ignored' }
  | { status: 'error'; message: string }
  | {
      status: 'advanced'
      state?: AppState
      session?: PracticeSession
      completion?: { session: PracticeSession; state: AppState }
      background: PracticeAnswerBackgroundTask[]
    }

export function recordPracticeAnswer(input: {
  state: AppState
  session: PracticeSession | null
  correct: boolean
  occurredAt: Date
  persistence: RecordPracticeAnswerPersistence
  cloudSession?: CloudSession
  formatError?: (error: unknown) => string
}): RecordPracticeAnswerResult {
  const current = input.session
  if (!current || current.stage !== 'review') return { status: 'ignored' }
  const occurredAt = input.occurredAt.toISOString()
  const formatError = input.formatError || errorMessage

  if (current.segment === 'primary' && current.acquisition) {
    const dataset = input.state.datasets.find((item) => item.id === current.primaryDatasetId)
    if (!dataset || !current.acquisition.prompt?.revealed) return { status: 'ignored' }
    const context = acquisitionPersistenceContext(current.childId, dataset, current.grade)
    const envelope = (input.state.acquisitionProgressEnvelopes || []).find(
      (item) => item.childId === current.childId && item.datasetId === dataset.id,
    )
    if (!envelope) {
      return {
        status: 'error',
        message:
          'Acquisition progress was not loaded. This answer was not recorded; reopen the activity and try again.',
      }
    }
    let checkpoint: ReturnType<typeof createAcquisitionAnswerCheckpoint>
    try {
      checkpoint = createAcquisitionAnswerCheckpoint({
        envelope,
        context,
        response: { correct: input.correct, revealMethod: current.currentRevealMethod || 'timer' },
        answeredPromptId: current.acquisition.prompt.id,
        sessionId: current.id,
        occurredAt,
      })
      input.persistence.journalAcquisition(checkpoint, envelope)
    } catch (error) {
      return {
        status: 'error',
        message: `This Acquisition answer was not advanced because it could not be checkpointed safely: ${formatError(error)}`,
      }
    }
    const applied = applyAcquisitionCheckpointToAppState(input.state, checkpoint, context, input.persistence.cloud)
    if (applied.status === 'conflict') {
      input.persistence.acknowledgeAcquisition(checkpoint.transitionId)
      return {
        status: 'error',
        message: `This Acquisition answer was not advanced because saved progress changed: ${applied.reason}`,
      }
    }
    const response = sessionAnswerForCheckpoint(checkpoint)
    const primaryAnswers = response ? [...current.primaryAnswers, response] : current.primaryAnswers
    const session: PracticeSession = {
      ...current,
      acquisition: checkpoint.nextFlow,
      primaryAnswers,
      currentRevealMethod: undefined,
      stage: checkpoint.nextFlow.complete ? 'complete' : 'dictation',
      queue: checkpoint.nextFlow.prompt ? [checkpoint.nextFlow.prompt.word] : [],
      index: 0,
    }
    const background: PracticeAnswerBackgroundTask[] = []
    if (input.persistence.cloud && input.persistence.commitAcquisition) {
      background.push({
        promise: input.persistence
          .commitAcquisition(applied.envelope, checkpoint)
          .then(() => input.persistence.acknowledgeAcquisition(checkpoint.transitionId)),
        failureMessage: 'Acquisition progress is saved on this device and will retry:',
        onSuccess: (state) => markAcquisitionCheckpointCommitted(state, checkpoint.transitionId),
      })
    } else if (input.persistence.saveLocalState(applied.state)) {
      input.persistence.acknowledgeAcquisition(checkpoint.transitionId)
    } else {
      return {
        status: 'advanced',
        state: applied.state,
        session,
        background: [
          {
            promise: Promise.reject(
              new Error(
                'This Acquisition answer is preserved in the recovery journal and will retry when the app reopens.',
              ),
            ),
            failureMessage: '',
          },
        ],
      }
    }
    return { status: 'advanced', state: applied.state, session, background }
  }

  if (current.segment === 'primary' && current.primaryPhase === 'test-review') return { status: 'ignored' }
  const word = current.queue[current.index]
  if (!word) return { status: 'ignored' }
  const response: SessionAnswer = {
    word,
    correct: input.correct,
    revealMethod: current.currentRevealMethod || 'timer',
  }
  const isWarmup = current.segment === 'warmup'

  if (isWarmup && current.adaptiveWarmupVisitId) {
    let checkpoint: ReturnType<typeof createWarmupAnswerCheckpoint>
    try {
      checkpoint = createWarmupAnswerCheckpoint({
        state: input.state,
        visitId: current.adaptiveWarmupVisitId,
        correct: input.correct,
        revealMethod: response.revealMethod,
        occurredAt,
      })
      input.persistence.journalWarmup(checkpoint.transition, checkpoint.baseVisit, checkpoint.baseMastery)
    } catch (error) {
      return {
        status: 'error',
        message: `This Warmup answer was not advanced because it could not be checkpointed safely: ${formatError(error)}`,
      }
    }
    const { transition } = checkpoint
    const applied = applyWarmupTransitionToAppState(input.state, transition, input.persistence.cloud)
    if (applied.status !== 'applied') {
      input.persistence.acknowledgeWarmup(transition.transitionId)
      return {
        status: 'error',
        message: `This Warmup answer was not advanced because saved progress changed: ${applied.status === 'conflict' ? applied.reason : 'The answer was already applied.'}`,
      }
    }
    const background: PracticeAnswerBackgroundTask[] = []
    if (input.persistence.cloud && input.persistence.commitWarmup) {
      background.push({
        promise: input.persistence
          .commitWarmup(transition)
          .then(() => input.persistence.acknowledgeWarmup(transition.transitionId)),
        failureMessage: 'Warmup progress is saved on this device and will retry:',
        onSuccess: (state) => markWarmupTransitionCommitted(state, transition.transitionId),
      })
    } else if (input.persistence.saveLocalState(applied.state)) {
      input.persistence.acknowledgeWarmup(transition.transitionId)
    } else {
      background.push({
        promise: Promise.reject(
          new Error('This Warmup answer is preserved in the recovery journal and will retry when the app reopens.'),
        ),
        failureMessage: '',
      })
    }
    const answers = [...current.warmupAnswers, response]
    if (transition.nextVisit.status === 'completed') {
      if (current.primaryQueue.length === 0) {
        return {
          status: 'advanced',
          state: applied.state,
          completion: {
            state: applied.state,
            session: {
              ...current,
              segment: 'primary',
              stage: 'complete',
              queue: [],
              index: 0,
              warmupAnswers: answers,
              primaryAnswers: [],
            },
          },
          background,
        }
      }
      return {
        status: 'advanced',
        state: applied.state,
        session: {
          ...current,
          segment: 'primary',
          stage: 'interstitial',
          queue: current.primaryQueue,
          index: 0,
          warmupAnswers: answers,
          currentRevealMethod: undefined,
        },
        background,
      }
    }
    return {
      status: 'advanced',
      state: applied.state,
      session: {
        ...current,
        warmupAnswers: answers,
        index: transition.nextVisit.nextPosition,
        stage: 'interstitial',
        currentRevealMethod: undefined,
      },
      background,
    }
  }

  const answers = isWarmup ? [...current.warmupAnswers, response] : [...current.primaryAnswers, response]
  const background: PracticeAnswerBackgroundTask[] = []
  if (input.persistence.cloud && input.cloudSession && input.persistence.saveAttempt) {
    const phase = isWarmup ? ('warmup' as const) : current.primaryPhase
    background.push({
      promise: input.persistence.saveAttempt(current.cloudSessionId || current.id, {
        id: `${current.id}-${response.word.id}-${current.index}`,
        sessionId: current.id,
        wordId: response.word.id,
        sourceDatasetId: response.word.datasetId,
        phase,
        correct: input.correct,
        reviewedAt: occurredAt,
        completionStatus: isWarmup && current.index === current.queue.length - 1 ? 'complete' : 'temporary',
        ...(phase === 'test-review' ? { reviewCycle: current.reviewCycle ?? 1 } : {}),
      }),
      failureMessage: 'A practice result could not be saved:',
    })
    if (isWarmup && current.index === current.queue.length - 1 && input.persistence.updateSession) {
      background.push({
        promise: input.persistence.updateSession(input.cloudSession, { warmupStatus: 'completed' }),
        failureMessage: '',
        updatedCloudSessionId: input.cloudSession.id,
      })
    }
  }

  if (current.index < current.queue.length - 1) {
    return {
      status: 'advanced',
      session: isWarmup
        ? { ...current, warmupAnswers: answers, index: current.index + 1 }
        : { ...current, primaryAnswers: answers, index: current.index + 1 },
      background,
    }
  }
  if (isWarmup) {
    if (current.primaryQueue.length === 0) {
      return {
        status: 'advanced',
        completion: {
          state: input.state,
          session: {
            ...current,
            segment: 'primary',
            stage: 'complete',
            queue: [],
            index: 0,
            warmupAnswers: answers,
            primaryAnswers: [],
          },
        },
        background,
      }
    }
    return {
      status: 'advanced',
      session: {
        ...current,
        segment: 'primary',
        stage: 'interstitial',
        queue: current.primaryQueue,
        index: 0,
        warmupAnswers: answers,
      },
      background,
    }
  }
  return {
    status: 'advanced',
    completion: { state: input.state, session: { ...current, primaryAnswers: answers } },
    background,
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
