import type {
  AdaptiveWarmupProfile,
  AdaptiveWarmupProfileRegistry,
  AdaptiveWarmupQueueEntry,
  AdaptiveWarmupSelection,
  ChildMasteryState,
  MasteryRotationState,
  MasteryLifecycleAssignment,
  MasteryTermDefinition,
  WarmupRotationPolicy,
  WarmupSchedulingBucket,
  WarmupVisitType,
} from './contracts.ts'
import { isMasteryTermWarmupEligibleFromHistory, isOccurrenceMasteryEligible } from './eligibility.ts'
import { activeProfileForScope, adaptiveWarmupProfileErrors, profileMatchesState, validateAdaptiveWarmupProfileRegistry } from './profileValidation.ts'

function shuffled<T>(values: readonly T[], random: () => number) {
  const output = [...values]
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[output[index], output[swapIndex]] = [output[swapIndex], output[index]]
  }
  return output
}

function rotationCycleForVisit(states: readonly ChildMasteryState[], currentCycle: number, policy: WarmupRotationPolicy) {
  if (!policy.exhaustBeforeReuse) return { cycle: currentCycle, advanced: false }
  const rotationStates = states.filter((state) => state.bucket === 'mastery-rotation')
  const availableInCurrentCycle = rotationStates.filter((state) => (state.rotationEligibleFromCycle || 1) <= currentCycle && state.lastConsumedRotationCycle !== currentCycle)
  if (rotationStates.length === 0 || availableInCurrentCycle.length > 0) return { cycle: currentCycle, advanced: false }
  return policy.advanceCycleWhenExhausted
    ? { cycle: currentCycle + 1, advanced: true }
    : { cycle: currentCycle, advanced: false }
}

function assignmentFor(assignments: readonly MasteryLifecycleAssignment[], occurrenceId: string) {
  return assignments.find((assignment) => assignment.occurrenceId === occurrenceId)
}

function queueEntry(
  term: MasteryTermDefinition,
  assignments: readonly MasteryLifecycleAssignment[],
  state: ChildMasteryState,
): AdaptiveWarmupQueueEntry {
  const historicallyIntegrated = new Set(state.integratedOccurrences.map((record) => record.occurrenceId))
  return {
    masteryTermId: term.id,
    sourceBucket: state.bucket,
    occurrenceIds: term.occurrences.filter((occurrence) => historicallyIntegrated.has(occurrence.occurrenceId)
      || isOccurrenceMasteryEligible(occurrence, assignmentFor(assignments, occurrence.occurrenceId)))
      .map((occurrence) => occurrence.occurrenceId),
  }
}

export function materializeAdaptiveWarmupSelection(input: {
  childId: string
  schoolYear: string
  visitType: WarmupVisitType
  profile: AdaptiveWarmupProfile
  profileRegistry: AdaptiveWarmupProfileRegistry
  terms: readonly MasteryTermDefinition[]
  lifecycleAssignments: readonly MasteryLifecycleAssignment[]
  childStates: readonly ChildMasteryState[]
  rotationState?: MasteryRotationState
  random?: () => number
}): AdaptiveWarmupSelection {
  const registryValidation = validateAdaptiveWarmupProfileRegistry(input.profileRegistry)
  if (!registryValidation.valid) throw new Error(`The Adaptive Warmup profile registry is invalid: ${registryValidation.errors.join(' ')}`)
  const profileErrors = adaptiveWarmupProfileErrors(input.profile)
  if (profileErrors.length > 0) throw new Error(`The Adaptive Warmup profile is invalid: ${profileErrors.join(' ')}`)
  const activeProfile = activeProfileForScope(input.profileRegistry, {
    grade: input.profile.grade,
    activityModule: input.profile.activityModule,
  })
  if (!activeProfile || activeProfile.id !== input.profile.id || activeProfile.version !== input.profile.version) {
    throw new Error('The requested Adaptive Warmup profile is not the active profile for this grade and activity module.')
  }
  const random = input.random || Math.random
  const visit = input.profile.visits[input.visitType]
  const currentCycle = input.rotationState?.cycle || 1
  if (input.rotationState && (input.rotationState.childId !== input.childId || input.rotationState.activityModule !== input.profile.activityModule)) {
    throw new Error('The Mastery Rotation state does not match the requested child and activity module.')
  }
  const termsById = new Map(input.terms.map((term) => [term.id, term]))
  const eligibleStates = input.childStates.filter((state) => {
    if (state.childId !== input.childId) return false
    const term = termsById.get(state.masteryTermId)
    return Boolean(term
      && term.identity.activityModule === input.profile.activityModule
      && isMasteryTermWarmupEligibleFromHistory(
        term,
        input.lifecycleAssignments,
        { grade: input.profile.grade, schoolYear: input.schoolYear },
        state.integratedOccurrences,
      ))
  })
  const mismatchedState = eligibleStates.find((state) => !profileMatchesState(input.profile, state))
  if (mismatchedState) {
    throw new Error(`Child mastery state ${mismatchedState.id} requires an explicit profile upgrade before selection.`)
  }
  const rotation = rotationCycleForVisit(eligibleStates, currentCycle, input.profile.rotationPolicy)
  const pools: Record<WarmupSchedulingBucket, ChildMasteryState[]> = {
    'recent-entry': [],
    'needs-attention': [],
    'mastery-rotation': [],
  }
  for (const state of eligibleStates) {
    if (state.bucket === 'mastery-rotation') {
      const eligibleFrom = state.rotationEligibleFromCycle || 1
      if (eligibleFrom > rotation.cycle
        || (input.profile.rotationPolicy.exhaustBeforeReuse && state.lastConsumedRotationCycle === rotation.cycle)) continue
    }
    pools[state.bucket].push(state)
  }
  for (const bucket of Object.keys(pools) as WarmupSchedulingBucket[]) pools[bucket] = shuffled(pools[bucket], random)

  const selected: ChildMasteryState[] = []
  const selectedIds = new Set<string>()
  const takeFrom = (bucket: WarmupSchedulingBucket, count: number) => {
    let taken = 0
    for (const state of pools[bucket]) {
      if (selected.length >= visit.maximum || taken >= count || selectedIds.has(state.masteryTermId)) continue
      selected.push(state)
      selectedIds.add(state.masteryTermId)
      taken += 1
    }
  }
  takeFrom('mastery-rotation', visit.allocation['mastery-rotation'])
  takeFrom('recent-entry', visit.allocation['recent-entry'])
  takeFrom('needs-attention', visit.allocation['needs-attention'])
  for (const bucket of input.profile.fillPriority) takeFrom(bucket, visit.maximum)
  if (input.profile.ordinaryDuplicatePolicy === 'repeat-after-unique-exhaustion' && selected.length > 0) {
    const uniqueSelection = [...selected]
    let repeatIndex = 0
    while (selected.length < visit.maximum) {
      selected.push(uniqueSelection[repeatIndex % uniqueSelection.length])
      repeatIndex += 1
    }
  }

  const entries = shuffled(selected.map((state) => queueEntry(
    termsById.get(state.masteryTermId)!,
    input.lifecycleAssignments,
    state,
  )), random)
  return {
    visitType: input.visitType,
    profile: { id: input.profile.id, version: input.profile.version },
    configuredMaximum: visit.maximum,
    entries,
    rotationCycle: rotation.cycle,
    rotationAdvanced: rotation.advanced,
  }
}
