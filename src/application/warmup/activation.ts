import type { AppState, Dataset, DatasetLifecycleResolution } from '../../domain.ts'
import type { WarmupVisitType } from '../../warmup/adaptive/contracts.ts'
import { grade2Tier1WritingAdaptiveWarmupProfile } from '../../warmup/adaptive/profiles/grade2.ts'
import { materializeAdaptiveWarmupSelection } from '../../warmup/adaptive/scheduler.ts'
import type { MasteryTermDefinition } from '../../warmup/adaptive/contracts.ts'
import type { VersionedChildMasteryState, WarmupVisit } from '../../warmup/visits/contracts.ts'
import { createWarmupVisit } from '../../warmup/visits/reducer.ts'
import { validateWarmupVisit } from '../../warmup/visits/validation.ts'
import { grade2AdaptiveWarmupRegistry, projectionFromState } from './modelAdapter.ts'

function samePrimary(left: WarmupVisit['associatedPrimaryActivity'], right: WarmupVisit['associatedPrimaryActivity']) {
  return JSON.stringify(left || null) === JSON.stringify(right || null)
}

function newestPrompt(term: MasteryTermDefinition, occurrenceIds: readonly string[], datasets: readonly Dataset[]) {
  const datasetsById = new Map(datasets.map((dataset) => [dataset.id, dataset]))
  const candidates = term.occurrences.filter((occurrence) => occurrenceIds.includes(occurrence.occurrenceId))
    .sort((left, right) => {
      const leftDataset = datasetsById.get(left.datasetId)
      const rightDataset = datasetsById.get(right.datasetId)
      return (rightDataset?.startDate || '').localeCompare(leftDataset?.startDate || '') || right.occurrenceId.localeCompare(left.occurrenceId)
    })
  const occurrence = candidates[0]
  const word = occurrence ? datasetsById.get(occurrence.datasetId)?.words.find((candidate) => candidate.id === occurrence.wordId) : undefined
  if (!occurrence || !word) throw new Error(`Mastery term ${term.id} has no available canonical prompt occurrence.`)
  return { wordId: word.id, datasetId: word.datasetId, text: word.text, sentence: word.sentence }
}

export type PrepareWarmupVisitResult =
  | { status: 'ready'; state: AppState; visit: WarmupVisit; resumed: boolean }
  | { status: 'blocked'; state: AppState; reason: string }

export function prepareAdaptiveWarmupVisit(input: {
  state: AppState
  childId: string
  grade: string
  schoolYear: string
  datasets: readonly Dataset[]
  lifecycleResolution: DatasetLifecycleResolution
  visitType: WarmupVisitType
  visitId: string
  createdAt: string
  associatedPrimaryActivity?: WarmupVisit['associatedPrimaryActivity']
  random?: () => number
}): PrepareWarmupVisitResult {
  if (input.grade !== 'Grade 2') return { status: 'blocked', state: input.state, reason: `Adaptive Warmup is not activated for ${input.grade}.` }
  const prepared = projectionFromState(input.state, input.childId, input.datasets, input.lifecycleResolution)
  if (!prepared.projection) return { status: 'blocked', state: input.state, reason: prepared.reason || 'Adaptive Warmup could not be prepared.' }
  const withProjection = { ...input.state, adaptiveWarmup: prepared.projection }
  const existing = (withProjection.warmupVisitsV1 || []).find((visit) => visit.childId === input.childId
    && visit.grade === input.grade
    && visit.schoolYear === input.schoolYear
    && visit.activityModule === grade2Tier1WritingAdaptiveWarmupProfile.activityModule
    && visit.visitType === input.visitType
    && visit.status === 'in-progress'
    && samePrimary(visit.associatedPrimaryActivity, input.associatedPrimaryActivity))
  if (existing) {
    const validation = validateWarmupVisit(existing, grade2AdaptiveWarmupRegistry)
    return validation.valid ? { status: 'ready', state: withProjection, visit: existing, resumed: true } : { status: 'blocked', state: withProjection, reason: validation.errors.join(' ') }
  }
  const rotationState = prepared.projection.rotationStates.find((rotation) => rotation.childId === input.childId && rotation.activityModule === grade2Tier1WritingAdaptiveWarmupProfile.activityModule)
  const selection = materializeAdaptiveWarmupSelection({
    childId: input.childId,
    schoolYear: input.schoolYear,
    visitType: input.visitType,
    profile: grade2Tier1WritingAdaptiveWarmupProfile,
    profileRegistry: grade2AdaptiveWarmupRegistry,
    terms: prepared.projection.terms,
    lifecycleAssignments: prepared.projection.lifecycleAssignments,
    childStates: prepared.projection.childStates,
    rotationState,
    random: input.random,
  })
  const termsById = new Map(prepared.projection.terms.map((term) => [term.id, term]))
  const visit = createWarmupVisit({
    id: input.visitId,
    childId: input.childId,
    grade: input.grade,
    schoolYear: input.schoolYear,
    profile: grade2Tier1WritingAdaptiveWarmupProfile,
    tier: 'tier-1',
    language: 'mandarin',
    selection,
    promptForEntry: (termId, occurrenceIds) => newestPrompt(termsById.get(termId)!, occurrenceIds, input.datasets),
    createdAt: input.createdAt,
    associatedPrimaryActivity: input.associatedPrimaryActivity,
  })
  let projection = prepared.projection
  if (selection.rotationAdvanced && rotationState) {
    projection = { ...projection, rotationStates: projection.rotationStates.map((rotation) => rotation.id === rotationState.id ? { ...rotation, cycle: selection.rotationCycle } : rotation) }
  }
  return { status: 'ready', resumed: false, visit, state: { ...withProjection, adaptiveWarmup: projection, warmupVisitsV1: [...(withProjection.warmupVisitsV1 || []), visit] } }
}

export function cloudWarmupSeedForVisit(state: AppState, visit: WarmupVisit) {
  const queuedTermIds = new Set(visit.queue.map((entry) => entry.masteryTermId))
  const mastery: VersionedChildMasteryState[] = (state.adaptiveWarmup?.childStates || [])
    .filter((candidate) => candidate.childId === visit.childId
      && queuedTermIds.has(candidate.masteryTermId)
      && state.adaptiveWarmup?.terms.find((term) => term.id === candidate.masteryTermId)?.identity.activityModule === visit.activityModule)
    .map((candidate) => ({ revision: state.warmupMasteryRevisionsV1?.[candidate.id] || 0, state: candidate }))
  const rotations = (state.adaptiveWarmup?.rotationStates || []).filter((candidate) => candidate.childId === visit.childId && candidate.activityModule === visit.activityModule)
  return { mastery, rotations }
}
