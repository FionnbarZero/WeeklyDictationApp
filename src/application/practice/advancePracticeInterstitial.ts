import type { AppState, Dataset, DatasetLifecycleResolution, PracticeSession } from '../../domain.ts'
import type { WarmupTransition, WarmupVisit } from '../../warmup/visits/contracts.ts'
import { prepareAdaptiveWarmupVisit, revalidateWarmupVisitBeforePresentation } from '../warmup/index.ts'
import { primaryStartState } from './warmupTransitions.ts'

export type WarmupEligibilityPersistence = {
  cloud: boolean
  saveLocalState: (state: AppState) => boolean
  journalWarmup: (transition: WarmupTransition, visit: WarmupVisit) => void
  acknowledgeWarmup: (transitionId: string) => void
  commitWarmup?: (transition: WarmupTransition) => Promise<'applied' | 'idempotent'>
}

export async function advancePracticeInterstitial(input: {
  state: AppState
  session: PracticeSession | null
  child?: { id: string; grade: string; schoolYear: string }
  primaryDatasets: Dataset[]
  lifecycleResolution: DatasetLifecycleResolution | null
  occurredAt: Date
  persistence: WarmupEligibilityPersistence
  formatError?: (error: unknown) => string
}) {
  const current = input.session
  if (!current || current.stage !== 'interstitial') return { status: 'ignored' as const }
  if (current.segment !== 'warmup' || !current.adaptiveWarmupVisitId || !input.child || !input.lifecycleResolution) {
    return { status: 'advanced' as const, state: input.state, session: { ...current, stage: 'dictation' as const } }
  }
  const occurredAt = input.occurredAt.toISOString()
  const associatedPrimaryActivity = current.warmupOnly
    ? undefined
    : {
        phase: current.primaryPhase,
        datasetId: current.primaryDatasetId,
        ...(current.reviewGroupId ? { reviewGroupId: current.reviewGroupId } : {}),
        ...(current.primaryPhase === 'test-review' ? { reviewCycle: current.reviewCycle ?? 1 } : {}),
      }
  const refreshed = prepareAdaptiveWarmupVisit({
    state: input.state,
    childId: input.child.id,
    grade: input.child.grade,
    schoolYear: input.child.schoolYear,
    datasets: input.primaryDatasets,
    lifecycleResolution: input.lifecycleResolution,
    visitType: current.warmupOnly ? 'standalone' : 'pre-activity',
    visitId: current.adaptiveWarmupVisitId,
    createdAt: occurredAt,
    associatedPrimaryActivity,
  })
  if (refreshed.status === 'blocked') {
    return {
      status: 'blocked' as const,
      message: `Warmup eligibility could not be refreshed: ${refreshed.reason}`,
    }
  }
  const revalidated = revalidateWarmupVisitBeforePresentation(refreshed.state, refreshed.visit.id, occurredAt, false)
  if (!revalidated.visit || revalidated.reason) {
    return {
      status: 'blocked' as const,
      message: `Warmup eligibility could not be refreshed: ${revalidated.reason || 'The visit is unavailable.'}`,
    }
  }
  const formatError = input.formatError || errorMessage
  let baseVisit = refreshed.visit
  for (const transition of revalidated.transitions) {
    try {
      input.persistence.journalWarmup(transition, baseVisit)
      if (input.persistence.cloud && input.persistence.commitWarmup) {
        await input.persistence.commitWarmup(transition)
        input.persistence.acknowledgeWarmup(transition.transitionId)
      } else if (input.persistence.saveLocalState(revalidated.state)) {
        input.persistence.acknowledgeWarmup(transition.transitionId)
      } else {
        throw new Error('The browser could not save the eligibility update.')
      }
    } catch (error) {
      return {
        status: 'blocked' as const,
        message: `Warmup eligibility is preserved for recovery: ${formatError(error)}`,
      }
    }
    baseVisit = transition.nextVisit
  }
  if (revalidated.visit.status === 'completed') {
    if (current.primaryQueue.length === 0) {
      return {
        status: 'completed' as const,
        state: revalidated.state,
        session: { ...current, segment: 'primary' as const, stage: 'complete' as const, queue: [], index: 0 },
      }
    }
    return {
      status: 'advanced' as const,
      state: revalidated.state,
      session: primaryStartState(current),
    }
  }
  return {
    status: 'advanced' as const,
    state: revalidated.state,
    session: { ...current, index: revalidated.visit.nextPosition, stage: 'dictation' as const },
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
