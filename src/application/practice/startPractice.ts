import type {
  AcquisitionCheckpoint,
  AcquisitionPersistenceContext,
  AcquisitionProgressEnvelope,
} from '../../acquisition/persistence/contracts.ts'
import {
  createPracticeSessionForTarget,
  localDateKey,
  type AppState,
  type Dataset,
  type DatasetLifecycleResolution,
  type PracticeSession,
  type PracticeTarget,
  type Word,
} from '../../domain.ts'
import type { CloudSession } from '../../persistence/cloudRecords.ts'
import type { CloudWarmupRotation } from '../../persistence/warmup/cloudContracts.ts'
import type { VersionedChildMasteryState, WarmupTransition, WarmupVisit } from '../../warmup/visits/contracts.ts'
import {
  applyAcquisitionCheckpointToAppState,
  createAcquisitionResumeCheckpoint,
  markAcquisitionCheckpointCommitted,
  prepareAcquisitionProgress,
} from '../acquisitionPersistence.ts'
import {
  cloudWarmupSeedForVisit,
  prepareAdaptiveWarmupVisit,
  revalidateWarmupVisitBeforePresentation,
  wordsForWarmupVisit,
} from '../warmup/index.ts'

export type StartPracticePersistence = {
  cloud: boolean
  saveLocalState: (state: AppState) => boolean
  journalWarmup: (transition: WarmupTransition, baseVisit: WarmupVisit) => void
  acknowledgeWarmup: (transitionId: string) => void
  ensureWarmupSeed?: (
    visit: WarmupVisit,
    mastery: readonly VersionedChildMasteryState[],
    rotations: readonly CloudWarmupRotation[],
  ) => Promise<void>
  commitWarmupTransition?: (transition: WarmupTransition) => Promise<'applied' | 'idempotent'>
  startCloudSession?: (input: Omit<CloudSession, 'familyId' | 'status' | 'applicationVersion'>) => Promise<CloudSession>
  journalAcquisition: (checkpoint: AcquisitionCheckpoint<Word>, envelope: AcquisitionProgressEnvelope<Word>) => void
  acknowledgeAcquisition: (transitionId: string) => void
  commitAcquisitionCheckpoint?: (
    envelope: AcquisitionProgressEnvelope<Word>,
    checkpoint: AcquisitionCheckpoint<Word>,
  ) => Promise<'applied' | 'idempotent'>
}

export type StartPracticeResult =
  | { status: 'no-op' }
  | { status: 'blocked'; message: string; state?: AppState }
  | {
      status: 'started'
      state: AppState
      session: PracticeSession
      cloudSession?: CloudSession
      warning?: string
    }

export async function startPractice(input: {
  state: AppState
  child: { id: string; grade: string; schoolYear: string }
  target: PracticeTarget | null
  primaryDatasets: Dataset[]
  lifecycleResolution: DatasetLifecycleResolution
  sessionId: string
  startedAt: Date
  persistence: StartPracticePersistence
  formatError?: (error: unknown) => string
  resolveAcquisitionContext?: (context: AcquisitionPersistenceContext<Word>) => AcquisitionPersistenceContext<Word>
}): Promise<StartPracticeResult> {
  const formatError = input.formatError || errorMessage
  const startedAt = input.startedAt.toISOString()
  const associatedPrimaryActivity = input.target
    ? {
        phase: input.target.phase,
        datasetId: input.target.dataset.id,
        ...(input.target.reviewGroupId ? { reviewGroupId: input.target.reviewGroupId } : {}),
        ...(input.target.phase === 'test-review' ? { reviewCycle: input.target.reviewCycle ?? 1 } : {}),
      }
    : undefined
  const preparedWarmup = prepareAdaptiveWarmupVisit({
    state: input.state,
    childId: input.child.id,
    grade: input.child.grade,
    schoolYear: input.child.schoolYear,
    datasets: input.primaryDatasets,
    lifecycleResolution: input.lifecycleResolution,
    visitType: input.target ? 'pre-activity' : 'standalone',
    visitId: `${input.sessionId}-warmup`,
    createdAt: startedAt,
    associatedPrimaryActivity,
  })
  if (preparedWarmup.status === 'blocked') {
    return {
      status: 'blocked',
      state: preparedWarmup.state,
      message: `Adaptive Warmup needs review before practice can continue: ${preparedWarmup.reason}`,
    }
  }

  if (input.persistence.cloud) {
    try {
      const seed = cloudWarmupSeedForVisit(preparedWarmup.state, preparedWarmup.visit)
      await input.persistence.ensureWarmupSeed?.(preparedWarmup.visit, seed.mastery, seed.rotations)
    } catch (error) {
      return {
        status: 'blocked',
        message: `Warmup could not start because its initial state was not saved safely: ${formatError(error)}`,
      }
    }
  }

  const revalidatedWarmup = revalidateWarmupVisitBeforePresentation(
    preparedWarmup.state,
    preparedWarmup.visit.id,
    startedAt,
    false,
  )
  if (!revalidatedWarmup.visit || revalidatedWarmup.reason) {
    return {
      status: 'blocked',
      message: `Adaptive Warmup could not be safely opened: ${revalidatedWarmup.reason || 'The saved visit is unavailable.'}`,
    }
  }

  let revalidationBaseVisit = preparedWarmup.visit
  for (const transition of revalidatedWarmup.transitions) {
    try {
      input.persistence.journalWarmup(transition, revalidationBaseVisit)
      if (input.persistence.cloud) {
        await input.persistence.commitWarmupTransition?.(transition)
        input.persistence.acknowledgeWarmup(transition.transitionId)
      } else if (input.persistence.saveLocalState(revalidatedWarmup.state)) {
        input.persistence.acknowledgeWarmup(transition.transitionId)
      } else {
        throw new Error('The browser could not save the eligibility update.')
      }
    } catch (error) {
      return {
        status: 'blocked',
        message: `Warmup cannot open until its eligibility update is saved: ${formatError(error)}`,
      }
    }
    revalidationBaseVisit = transition.nextVisit
  }

  const warmupVisit = revalidatedWarmup.visit
  let warmupWords: Word[]
  try {
    warmupWords = wordsForWarmupVisit(revalidatedWarmup.state, warmupVisit)
  } catch (error) {
    return {
      status: 'blocked',
      message: `Adaptive Warmup could not safely load its saved queue: ${formatError(error)}`,
    }
  }
  if (!input.target && warmupVisit.assignedQueueSize === 0) return { status: 'no-op' }

  const primaryDatasetId = input.target?.dataset.id || warmupWords[0]?.datasetId || 'warmup-only'
  const primaryPhase = input.target?.phase || 'acquisition'
  const warmupOnly = !input.target
  let state = revalidatedWarmup.state
  let preparedAcquisition =
    input.target?.phase === 'acquisition'
      ? prepareAcquisitionProgress(
          state,
          input.child.id,
          input.target.dataset,
          startedAt,
          Math.random,
          !input.persistence.cloud,
          input.resolveAcquisitionContext,
        )
      : null
  if (preparedAcquisition?.status === 'blocked') {
    return {
      status: 'blocked',
      state: preparedAcquisition.state,
      message: `Saved Acquisition progress needs review before practice can continue: ${preparedAcquisition.reason}`,
    }
  }
  if (preparedAcquisition) state = preparedAcquisition.state
  if (!input.persistence.cloud && preparedAcquisition && !input.persistence.saveLocalState(state)) {
    return {
      status: 'blocked',
      message: 'Acquisition cannot start because this browser could not save its initial progress record.',
    }
  }

  let cloudSession: CloudSession | undefined
  if (input.persistence.cloud) {
    try {
      cloudSession = await input.persistence.startCloudSession?.({
        id: input.sessionId,
        childId: input.child.id,
        sessionDate: startedAt,
        localDate: localDateKey(input.startedAt),
        startedAt,
        primaryPhase,
        datasetId: primaryDatasetId,
        datasetIds: input.target?.reviewDatasets?.map((dataset) => dataset.id),
        reviewGroupId: input.target?.reviewGroupId,
        reviewCycle: input.target?.phase === 'test-review' ? (input.target.reviewCycle ?? 1) : undefined,
        warmupOnly,
        warmupStatus: 'in_progress',
      })
      if (!cloudSession) throw new Error('The cloud session capability is unavailable.')
    } catch (error) {
      return { status: 'blocked', message: `Practice could not be saved: ${formatError(error)}` }
    }
  }

  let warning: string | undefined
  if (
    preparedAcquisition?.status === 'ready' &&
    preparedAcquisition.envelope.status === 'teaching-complete' &&
    preparedAcquisition.envelope.flow.mode === 'teaching'
  ) {
    const checkpoint = createAcquisitionResumeCheckpoint({
      envelope: preparedAcquisition.envelope,
      context: preparedAcquisition.context,
      sessionId: input.sessionId,
      occurredAt: startedAt,
    })
    try {
      input.persistence.journalAcquisition(checkpoint, preparedAcquisition.envelope)
    } catch (error) {
      return {
        status: 'blocked',
        message: `Acquisition cannot resume until its recovery journal is available: ${formatError(error)}`,
      }
    }
    const applied = applyAcquisitionCheckpointToAppState(
      state,
      checkpoint,
      preparedAcquisition.context,
      input.persistence.cloud,
    )
    if (applied.status === 'conflict') {
      input.persistence.acknowledgeAcquisition(checkpoint.transitionId)
      return { status: 'blocked', message: `Acquisition could not resume safely: ${applied.reason}` }
    }
    state = applied.state
    preparedAcquisition = { ...preparedAcquisition, state: applied.state, envelope: applied.envelope }
    if (input.persistence.cloud) {
      try {
        await input.persistence.commitAcquisitionCheckpoint?.(applied.envelope, checkpoint)
        input.persistence.acknowledgeAcquisition(checkpoint.transitionId)
        state = markAcquisitionCheckpointCommitted(state, checkpoint.transitionId)
      } catch (error) {
        warning = `Acquisition resume is saved on this device and will retry: ${formatError(error)}`
      }
    } else if (input.persistence.saveLocalState(state)) {
      input.persistence.acknowledgeAcquisition(checkpoint.transitionId)
    } else {
      warning = 'Acquisition resume is preserved in the recovery journal and will retry when the app reopens.'
    }
  }

  const warmupSelection = {
    words: warmupWords,
    randomRotationWordIds: warmupVisit.queue
      .filter((entry) => entry.sourceBucket === 'mastery-rotation')
      .map((entry) => entry.prompt.wordId),
    recentReviewWordIds: warmupVisit.queue
      .filter((entry) => entry.sourceBucket === 'recent-entry')
      .map((entry) => entry.prompt.wordId),
    erroredWordIds: warmupVisit.queue
      .filter((entry) => entry.sourceBucket === 'needs-attention')
      .map((entry) => entry.prompt.wordId),
    rotationCycleId: warmupVisit.rotationCycle,
  }
  const practiceSession = createPracticeSessionForTarget({
    id: input.sessionId,
    childId: input.child.id,
    grade: input.child.grade,
    target:
      input.target && preparedAcquisition?.status === 'ready'
        ? {
            ...input.target,
            dataset: { ...input.target.dataset, words: [...preparedAcquisition.context.targetSet.targets] },
          }
        : input.target,
    warmup: warmupSelection,
    startedAt,
    cloudSessionId: input.persistence.cloud ? input.sessionId : undefined,
    preparedAcquisitionProgress:
      preparedAcquisition?.status === 'ready' ? preparedAcquisition.envelope.flow : undefined,
  })
  return {
    status: 'started',
    state,
    session: {
      ...practiceSession,
      ...(preparedAcquisition?.status === 'ready' ? { acquisitionProgressionId: preparedAcquisition.envelope.id } : {}),
      adaptiveWarmupVisitId: warmupVisit.id,
      warmupResumePosition: warmupVisit.nextPosition,
      index: warmupVisit.nextPosition,
    },
    cloudSession,
    warning,
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
