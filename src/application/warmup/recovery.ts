import type { AppState } from '../../domain.ts'
import type { PendingWarmupCommit } from '../../persistence/warmup/pendingJournal.ts'
import { applyWarmupTransitionToAppState, markWarmupTransitionCommitted } from './state.ts'

export type WarmupRecoveryResult = { status: 'recovered' | 'blocked'; state: AppState; recoveredTransitionIds: string[]; reason?: string }

export function recoverWarmupTransitions(initialState: AppState, entries: readonly PendingWarmupCommit[]): WarmupRecoveryResult {
  let state = initialState
  const recoveredTransitionIds: string[] = []
  const ordered = [...entries].sort((left, right) => left.transition.expectedVisitRevision - right.transition.expectedVisitRevision || left.transition.transitionId.localeCompare(right.transition.transitionId))
  for (const entry of ordered) {
    const existingReceipt = (state.warmupTransitionReceiptsV1 || []).find((receipt) => receipt.transitionId === entry.transition.transitionId)
    if (existingReceipt) {
      if (existingReceipt.payloadFingerprint !== entry.transition.payloadFingerprint) return { status: 'blocked', state, recoveredTransitionIds, reason: `Pending Warmup transition ${entry.transition.transitionId} conflicts with its saved receipt.` }
      state = markWarmupTransitionCommitted(state, entry.transition.transitionId)
      recoveredTransitionIds.push(entry.transition.transitionId)
      continue
    }
    const adaptiveWarmup = state.adaptiveWarmup
    if (!adaptiveWarmup) return { status: 'blocked', state, recoveredTransitionIds, reason: 'Pending Warmup progress cannot be restored without the mastery projection.' }
    const visit = (state.warmupVisitsV1 || []).find((candidate) => candidate.id === entry.transition.visitId)
    if (!visit) state = { ...state, warmupVisitsV1: [...(state.warmupVisitsV1 || []), entry.baseVisit] }
    if (entry.baseMastery && !adaptiveWarmup.childStates.some((candidate) => candidate.id === entry.baseMastery!.state.id)) {
      state = { ...state, adaptiveWarmup: { ...adaptiveWarmup, childStates: [...adaptiveWarmup.childStates, entry.baseMastery.state] }, warmupMasteryRevisionsV1: { ...(state.warmupMasteryRevisionsV1 || {}), [entry.baseMastery.state.id]: entry.baseMastery.revision } }
    }
    const applied = applyWarmupTransitionToAppState(state, entry.transition, false)
    if (applied.status === 'conflict') return { status: 'blocked', state, recoveredTransitionIds, reason: applied.reason }
    if (applied.status === 'idempotent') return { status: 'blocked', state, recoveredTransitionIds, reason: `Pending Warmup transition ${entry.transition.transitionId} is missing its durable receipt.` }
    state = markWarmupTransitionCommitted(applied.state, entry.transition.transitionId)
    recoveredTransitionIds.push(entry.transition.transitionId)
  }
  return { status: 'recovered', state, recoveredTransitionIds }
}
