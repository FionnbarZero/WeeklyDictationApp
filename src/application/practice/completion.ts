import {
  commitCompletedSession,
  commitPartialSession,
  commitSkippedTestReview,
  type AppState,
  type DatasetScore,
  type PracticeSession,
} from '../../domain.ts'
import type { CloudAttempt, CloudSession } from '../../persistence/cloudRecords.ts'

export type PracticeCompletionPersistence = {
  completeSession: (session: CloudSession, attempts: CloudAttempt[], scores: DatasetScore[]) => Promise<void>
  finishSession: (
    session: CloudSession,
    status: 'partial' | 'completed' | 'skipped',
    attempts: CloudAttempt[],
    scores: DatasetScore[],
  ) => Promise<void>
  discardTestReview: (session: CloudSession, warmupAttempts: CloudAttempt[]) => Promise<void>
  saveAdaptiveState: (state: AppState, updatedAt: string) => Promise<void>
}

type CompletionCloudInput = {
  session?: CloudSession
  persistence?: PracticeCompletionPersistence
}

function warmupAttempts(session: PracticeSession, completedAt: string): CloudAttempt[] {
  if (session.adaptiveWarmupVisitId) return []
  return session.warmupAnswers.map((answer, index) => ({
    id: `${session.id}-warmup-${answer.word.id}-${index}`,
    sessionId: session.id,
    wordId: answer.word.id,
    sourceDatasetId: answer.word.datasetId,
    phase: 'warmup',
    correct: answer.correct,
    reviewedAt: completedAt,
    completionStatus: 'complete',
  }))
}

function allCompletionAttempts(session: PracticeSession, completedAt: string): CloudAttempt[] {
  // Acquisition attempts are already committed atomically with progression
  // checkpoints and must not be written again under completion IDs.
  const answers = [
    ...(session.adaptiveWarmupVisitId ? [] : session.warmupAnswers),
    ...(session.primaryPhase === 'acquisition' ? [] : session.primaryAnswers),
  ]
  return answers.map((answer, index) => {
    const phase = session.warmupAnswers.includes(answer) ? ('warmup' as const) : session.primaryPhase
    return {
      id: `${session.id}-${answer.word.id}-${index}`,
      sessionId: session.id,
      wordId: answer.word.id,
      sourceDatasetId: answer.word.datasetId,
      phase,
      correct: answer.correct,
      reviewedAt: completedAt,
      completionStatus: 'complete' as const,
      ...(phase === 'test-review' ? { reviewCycle: session.reviewCycle ?? 1 } : {}),
    }
  })
}

function cloudCommit(tasks: Promise<void>[]): Promise<void> | undefined {
  return tasks.length > 0 ? Promise.all(tasks).then(() => undefined) : undefined
}

export function completePractice(input: {
  state: AppState
  session: PracticeSession
  completedAt: Date
  cloud?: CompletionCloudInput
}) {
  const state = commitCompletedSession(input.state, input.session, input.completedAt)
  const persistence = input.cloud?.persistence
  const session = input.cloud?.session
  return {
    state,
    summary: input.session.warmupOnly
      ? 'Mastery warmup complete. Your warmup results are saved.'
      : 'Practice complete. Your warmup and dataset results are saved.',
    cloudCommit:
      persistence && session
        ? cloudCommit([
            persistence.completeSession(
              session,
              allCompletionAttempts(input.session, input.completedAt.toISOString()),
              state.scores.filter((score) => score.sessionId === input.session.id),
            ),
            persistence.saveAdaptiveState(state, input.completedAt.toISOString()),
          ])
        : undefined,
  }
}

export function completeAcquisitionForToday(input: {
  state: AppState
  session: PracticeSession
  completedAt: Date
  cloud?: CompletionCloudInput
}) {
  const state = commitPartialSession(input.state, input.session, input.completedAt)
  const attempts = warmupAttempts(input.session, input.completedAt.toISOString())
  const warmupStatus = input.session.warmupSkipped
    ? ('skipped' as const)
    : input.session.warmupAnswers.length === input.session.warmupQueue.length
      ? ('completed' as const)
      : input.session.warmupAnswers.length > 0
        ? ('partial' as const)
        : ('in_progress' as const)
  const targetAttempts = input.session.primaryAnswers.filter((answer) => answer.countsTowardWeeklyScore).length
  const persistence = input.cloud?.persistence
  const session = input.cloud?.session
  return {
    state,
    summary:
      targetAttempts > 0
        ? `Acquisition saved with ${targetAttempts} weekly-target response${targetAttempts === 1 ? '' : 's'} scored for today.`
        : 'Acquisition progress and DT practice were saved. No weekly-target score was created.',
    cloudCommit:
      persistence && session
        ? cloudCommit([
            persistence.finishSession(
              { ...session, warmupStatus },
              'completed',
              attempts,
              state.scores.filter((score) => score.sessionId === input.session.id),
            ),
            persistence.saveAdaptiveState(state, input.completedAt.toISOString()),
          ])
        : undefined,
  }
}

export function discardTestReview(input: {
  state: AppState
  session: PracticeSession
  completedAt: Date
  cloud?: CompletionCloudInput
}) {
  const skippedSession = { ...input.session, primaryAnswers: [], testReviewSkipped: true }
  const state = commitSkippedTestReview(input.state, skippedSession, input.completedAt)
  const attempts = warmupAttempts(input.session, input.completedAt.toISOString())
  const warmupStatus = input.session.warmupSkipped
    ? ('skipped' as const)
    : input.session.warmupAnswers.length === input.session.warmupQueue.length
      ? ('completed' as const)
      : input.session.warmupAnswers.length > 0
        ? ('partial' as const)
        : ('not_started' as const)
  const persistence = input.cloud?.persistence
  const session = input.cloud?.session
  return {
    state,
    summary: 'Test Review was skipped. Any completed Warmup results were saved; no Test Review score was created.',
    cloudCommit:
      persistence && session
        ? cloudCommit([
            persistence.discardTestReview({ ...session, warmupStatus }, attempts),
            persistence.saveAdaptiveState(state, input.completedAt.toISOString()),
          ])
        : undefined,
  }
}
