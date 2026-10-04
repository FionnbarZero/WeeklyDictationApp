import type { AppState, PracticeSession } from '../../domain.ts'
import type { CloudSession } from '../../persistence/cloudRecords.ts'
import type { WarmupTransition, WarmupVisit } from '../../warmup/visits/contracts.ts'
import {
  applyWarmupTransitionToAppState,
  createWarmupFinalizationCheckpoint,
  markWarmupTransitionCommitted,
} from '../warmup/index.ts'
import type { PracticeAnswerBackgroundTask } from './recordPracticeAnswer.ts'

export type PracticeTransitionPersistence = {
  cloud: boolean
  saveLocalState: (state: AppState) => boolean
  journalWarmup: (transition: WarmupTransition, visit: WarmupVisit) => void
  acknowledgeWarmup: (transitionId: string) => void
  commitWarmup?: (transition: WarmupTransition) => Promise<'applied' | 'idempotent'>
  updateCloudSession?: (session: CloudSession, patch: Partial<CloudSession>) => Promise<CloudSession>
  abandonCloudSession?: (session: CloudSession) => Promise<void>
}

type TransitionInput = {
  state: AppState
  session: PracticeSession | null
  occurredAt: Date
  persistence: PracticeTransitionPersistence
  cloudSession?: CloudSession
  formatError?: (error: unknown) => string
}

export function primaryStartState(current: PracticeSession): PracticeSession {
  if (current.primaryQueue.length === 0) {
    return { ...current, segment: 'primary', stage: 'complete', queue: [], index: 0 }
  }
  if (current.acquisition?.prompt) {
    return {
      ...current,
      segment: 'primary',
      stage: 'dictation',
      queue: [current.acquisition.prompt.word],
      index: 0,
    }
  }
  return {
    ...current,
    segment: 'primary',
    stage: 'interstitial',
    queue: current.primaryQueue,
    index: 0,
  }
}

function finalizeWarmup(input: TransitionInput, operation: 'finalize-partial' | 'skip', failurePrefix: string) {
  const current = input.session
  if (!current?.adaptiveWarmupVisitId) return { status: 'ignored' as const }
  const visit = (input.state.warmupVisitsV1 || []).find((candidate) => candidate.id === current.adaptiveWarmupVisitId)
  if (!visit || visit.status !== 'in-progress') return { status: 'ignored' as const }
  const formatError = input.formatError || errorMessage
  try {
    const checkpoint = createWarmupFinalizationCheckpoint({
      state: input.state,
      visitId: visit.id,
      operation,
      occurredAt: input.occurredAt.toISOString(),
    })
    input.persistence.journalWarmup(checkpoint.transition, checkpoint.baseVisit)
    const applied = applyWarmupTransitionToAppState(input.state, checkpoint.transition, input.persistence.cloud)
    if (applied.status !== 'applied') {
      throw new Error(
        applied.status === 'conflict'
          ? applied.reason
          : operation === 'skip'
            ? 'Warmup skip was already applied.'
            : 'The partial Warmup was already finalized.',
      )
    }
    const background: PracticeAnswerBackgroundTask[] = []
    if (input.persistence.cloud && input.persistence.commitWarmup) {
      background.push({
        promise: input.persistence
          .commitWarmup(checkpoint.transition)
          .then(() => input.persistence.acknowledgeWarmup(checkpoint.transition.transitionId)),
        failureMessage:
          operation === 'skip'
            ? 'Warmup skip is saved on this device and will retry:'
            : 'Partial Warmup progress is saved on this device and will retry:',
        onSuccess: (state) => markWarmupTransitionCommitted(state, checkpoint.transition.transitionId),
      })
    } else if (input.persistence.saveLocalState(applied.state)) {
      input.persistence.acknowledgeWarmup(checkpoint.transition.transitionId)
    }
    return { status: 'applied' as const, state: applied.state, background }
  } catch (error) {
    return { status: 'error' as const, message: `${failurePrefix}: ${formatError(error)}` }
  }
}

export function skipWarmup(input: TransitionInput) {
  const current = input.session
  if (!current || current.stage !== 'warmup-intro' || current.warmupOnly) {
    return { status: 'ignored' as const }
  }
  let state = input.state
  const background: PracticeAnswerBackgroundTask[] = []
  if (current.adaptiveWarmupVisitId) {
    const finalized = finalizeWarmup(input, 'skip', 'Warmup could not be skipped safely')
    if (finalized.status === 'error') return finalized
    if (finalized.status === 'ignored') return finalized
    state = finalized.state
    background.push(...finalized.background)
  }
  if (input.persistence.cloud && input.cloudSession && input.persistence.updateCloudSession) {
    background.push({
      promise: input.persistence.updateCloudSession(input.cloudSession, { warmupStatus: 'skipped' }),
      failureMessage: '',
      updatedCloudSessionId: input.cloudSession.id,
    })
  }
  return {
    status: 'applied' as const,
    state,
    session: primaryStartState({ ...current, warmupSkipped: true, warmupAnswers: [] }),
    background,
  }
}

export function continueAfterPartialWarmup(input: TransitionInput) {
  const current = input.session
  if (
    !current ||
    current.segment !== 'warmup' ||
    current.warmupOnly ||
    current.warmupAnswers.length === 0 ||
    !current.adaptiveWarmupVisitId
  ) {
    return { status: 'ignored' as const }
  }
  const finalized = finalizeWarmup(input, 'finalize-partial', 'Warmup could not continue safely to the activity')
  if (finalized.status !== 'applied') return finalized
  const background = [...finalized.background]
  if (input.persistence.cloud && input.cloudSession && input.persistence.updateCloudSession) {
    background.push({
      promise: input.persistence.updateCloudSession(input.cloudSession, { warmupStatus: 'partial' }),
      failureMessage: '',
      updatedCloudSessionId: input.cloudSession.id,
    })
  }
  return {
    status: 'applied' as const,
    state: finalized.state,
    session: primaryStartState(current),
    background,
  }
}

export function leavePractice(input: TransitionInput) {
  const current = input.session
  let state = input.state
  let message: string | undefined
  const background: PracticeAnswerBackgroundTask[] = []
  if (current?.adaptiveWarmupVisitId && current.segment === 'warmup') {
    const visit = (input.state.warmupVisitsV1 || []).find((candidate) => candidate.id === current.adaptiveWarmupVisitId)
    if (visit?.status === 'in-progress' && visit.attemptedCount > 0) {
      const finalized = finalizeWarmup(input, 'finalize-partial', 'Partial Warmup progress is preserved for recovery')
      if (finalized.status === 'applied') {
        state = finalized.state
        background.push(...finalized.background)
      } else if (finalized.status === 'error') {
        message = finalized.message
      }
    }
  }
  if (input.persistence.cloud && input.cloudSession) {
    const request =
      current?.primaryPhase === 'acquisition'
        ? input.persistence.updateCloudSession?.(input.cloudSession, { status: 'partial' })
        : input.persistence.abandonCloudSession?.(input.cloudSession)
    if (request) background.push({ promise: request, failureMessage: '' })
  }
  return { state, message, background }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
