import type { AppState } from '../../domain.ts'
import { grade2Tier1WritingAdaptiveWarmupProfile } from '../../warmup/adaptive/profiles/grade2.ts'
import type { VersionedChildMasteryState, WarmupTransition, WarmupVisit } from '../../warmup/visits/contracts.ts'
import { applyWarmupTransition, buildWarmupAnswerTransition, buildWarmupFinalizationTransition, buildWarmupUnavailableTransition } from '../../warmup/visits/reducer.ts'
import { validateWarmupTransition } from '../../warmup/visits/validation.ts'
import { grade2AdaptiveWarmupRegistry, updateProjectionReport } from './modelAdapter.ts'

export function applyWarmupTransitionToAppState(state: AppState, transition: WarmupTransition, queueForCloud = false) {
  const visits = state.warmupVisitsV1 || []
  const visit = visits.find((candidate) => candidate.id === transition.visitId)
  if (!visit || !state.adaptiveWarmup) return { status: 'conflict' as const, state, reason: 'The Warmup visit or mastery projection was not loaded.' }
  const childState = transition.queueEntryId
    ? state.adaptiveWarmup.childStates.find((candidate) => candidate.childId === visit.childId && candidate.masteryTermId === visit.queue.find((entry) => entry.id === transition.queueEntryId)?.masteryTermId)
    : undefined
  const mastery = childState ? { revision: state.warmupMasteryRevisionsV1?.[childState.id] || 0, state: childState } : undefined
  const receipt = (state.warmupTransitionReceiptsV1 || []).find((candidate) => candidate.transitionId === transition.transitionId)
  const validation = validateWarmupTransition(transition, visit, mastery, grade2AdaptiveWarmupRegistry)
  if (!validation.valid) return { status: 'conflict' as const, state, reason: validation.errors.join(' ') }
  const applied = applyWarmupTransition(visit, transition, mastery, receipt)
  if (applied.status !== 'applied') return { status: applied.status, state, ...(applied.status === 'conflict' ? { reason: applied.reason } : {}) }
  const childStates = applied.mastery
    ? state.adaptiveWarmup.childStates.map((candidate) => candidate.id === applied.mastery!.state.id ? applied.mastery!.state : candidate)
    : state.adaptiveWarmup.childStates
  const attempts = state.warmupAttemptsV1 || []
  const graphPoints = state.warmupGraphPointsV1 || []
  const pending = state.warmupPendingTransitionsV1 || []
  return {
    status: 'applied' as const,
    state: {
      ...state,
      adaptiveWarmup: updateProjectionReport({ ...state.adaptiveWarmup, childStates }),
      warmupVisitsV1: visits.map((candidate) => candidate.id === visit.id ? applied.visit : candidate),
      warmupAttemptsV1: applied.attempt && !attempts.some((attempt) => attempt.id === applied.attempt!.id) ? [...attempts, applied.attempt] : attempts,
      warmupTransitionReceiptsV1: [...(state.warmupTransitionReceiptsV1 || []), applied.receipt],
      warmupGraphPointsV1: applied.graphPoint
        ? graphPoints.some((point) => point.id === applied.graphPoint!.id) ? graphPoints.map((point) => point.id === applied.graphPoint!.id ? applied.graphPoint! : point) : [...graphPoints, applied.graphPoint]
        : graphPoints,
      warmupPendingTransitionsV1: queueForCloud && !pending.some((candidate) => candidate.transitionId === transition.transitionId) ? [...pending, transition] : pending,
      warmupMasteryRevisionsV1: applied.mastery ? { ...(state.warmupMasteryRevisionsV1 || {}), [applied.mastery.state.id]: applied.mastery.revision } : state.warmupMasteryRevisionsV1,
    },
  }
}

export type WarmupCheckpoint = {
  transition: WarmupTransition
  baseVisit: WarmupVisit
  baseMastery?: VersionedChildMasteryState
}

export function createWarmupAnswerCheckpoint(input: {
  state: AppState
  visitId: string
  correct: boolean
  revealMethod: 'timer' | 'skip_timer' | 'show_answer'
  occurredAt: string
}): WarmupCheckpoint {
  const visit = (input.state.warmupVisitsV1 || []).find((candidate) => candidate.id === input.visitId)
  const entry = visit?.queue[visit.nextPosition]
  const masteryState = entry
    ? input.state.adaptiveWarmup?.childStates.find((candidate) => candidate.childId === visit?.childId && candidate.masteryTermId === entry.masteryTermId)
    : undefined
  if (!visit || !entry || !masteryState) throw new Error('Adaptive Warmup progress was not loaded.')
  const baseMastery = { revision: input.state.warmupMasteryRevisionsV1?.[masteryState.id] || 0, state: masteryState }
  return {
    baseVisit: visit,
    baseMastery,
    transition: buildWarmupAnswerTransition({
      visit,
      mastery: baseMastery,
      profile: grade2Tier1WritingAdaptiveWarmupProfile,
      correct: input.correct,
      revealMethod: input.revealMethod,
      occurredAt: input.occurredAt,
    }),
  }
}

export function createWarmupFinalizationCheckpoint(input: {
  state: AppState
  visitId: string
  operation: 'finalize-partial' | 'skip'
  occurredAt: string
}): WarmupCheckpoint {
  const visit = (input.state.warmupVisitsV1 || []).find((candidate) => candidate.id === input.visitId)
  if (!visit) throw new Error('Adaptive Warmup visit was not loaded.')
  return {
    baseVisit: visit,
    transition: buildWarmupFinalizationTransition({ visit, operation: input.operation, occurredAt: input.occurredAt }),
  }
}

export function markWarmupTransitionCommitted(state: AppState, transitionId: string): AppState {
  return { ...state, warmupPendingTransitionsV1: (state.warmupPendingTransitionsV1 || []).filter((transition) => transition.transitionId !== transitionId) }
}

export function revalidateWarmupVisitBeforePresentation(state: AppState, visitId: string, occurredAt: string, queueForCloud = false) {
  let nextState = state
  const transitions: WarmupTransition[] = []
  while (true) {
    const visit = (nextState.warmupVisitsV1 || []).find((candidate) => candidate.id === visitId)
    if (!visit || !nextState.adaptiveWarmup || visit.status !== 'in-progress') return { state: nextState, visit: visit || null, transitions }
    const transition = buildWarmupUnavailableTransition({
      visit,
      terms: nextState.adaptiveWarmup.terms,
      lifecycleAssignments: nextState.adaptiveWarmup.lifecycleAssignments,
      occurredAt,
    })
    if (!transition) return { state: nextState, visit, transitions }
    const applied = applyWarmupTransitionToAppState(nextState, transition, queueForCloud)
    if (applied.status !== 'applied') return { state: nextState, visit, transitions, reason: applied.status === 'conflict' ? applied.reason : 'Warmup revalidation could not be applied.' }
    nextState = applied.state
    transitions.push(transition)
  }
}
