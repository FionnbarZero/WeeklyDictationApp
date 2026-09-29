import type {
  AdaptiveWarmupProfile,
  AdaptiveWarmupProfileRegistry,
  ChildMasteryState,
  MasteryTermDefinition,
} from './contracts.ts'
import {
  activeProfileForScope,
  profileDefinition,
  profileIdentityKey,
  profileMatchesState,
  upgradeFromState,
  validateAdaptiveWarmupProfileRegistry,
} from './profileValidation.ts'

export type AdaptiveWarmupProfileUpgradeResult =
  | { status: 'unchanged'; state: ChildMasteryState; profile: AdaptiveWarmupProfile; appliedUpgradeIds: [] }
  | { status: 'upgraded'; state: ChildMasteryState; profile: AdaptiveWarmupProfile; appliedUpgradeIds: string[] }
  | { status: 'blocked'; state: ChildMasteryState; reason: 'missing-profile-definition' | 'missing-active-profile' | 'missing-upgrade-path' | 'missing-rebind-occurrence' | 'invalid-registry' }

function applyProfileToState(
  state: ChildMasteryState,
  profile: AdaptiveWarmupProfile,
  sourceOccurrenceId: string,
  currentRotationCycle: number,
): ChildMasteryState {
  const schedulingProfile = { id: profile.id, version: profile.version, sourceOccurrenceId }
  if (state.bucket === 'recent-entry'
    && state.evidence === 'demonstrated'
    && state.consecutiveCorrect >= profile.recentEntryPromotionCorrect) {
    return {
      ...state,
      schedulingProfile,
      bucket: 'mastery-rotation',
      consecutiveCorrect: 0,
      rotationEligibleFromCycle: profile.rotationPolicy.promotedTermEligibility === 'next-cycle'
        ? currentRotationCycle + 1
        : currentRotationCycle,
      lastConsumedRotationCycle: undefined,
    }
  }
  return { ...state, schedulingProfile }
}

export function upgradeChildMasteryStateToActiveProfile(input: {
  state: ChildMasteryState
  term: MasteryTermDefinition
  registry: AdaptiveWarmupProfileRegistry
  targetGrade: string
  currentRotationCycle: number
}): AdaptiveWarmupProfileUpgradeResult {
  const registryValidation = validateAdaptiveWarmupProfileRegistry(input.registry)
  if (!registryValidation.valid) return { status: 'blocked', state: input.state, reason: 'invalid-registry' }
  const currentProfile = profileDefinition(input.registry, input.state.schedulingProfile)
  if (!currentProfile) return { status: 'blocked', state: input.state, reason: 'missing-profile-definition' }
  const activeProfile = activeProfileForScope(input.registry, {
    grade: input.targetGrade,
    activityModule: input.term.identity.activityModule,
  })
  if (!activeProfile) return { status: 'blocked', state: input.state, reason: 'missing-active-profile' }
  if (profileMatchesState(activeProfile, input.state)) {
    return { status: 'unchanged', state: input.state, profile: activeProfile, appliedUpgradeIds: [] }
  }

  let state = input.state
  let profile = currentProfile
  const appliedUpgradeIds: string[] = []
  const visited = new Set<string>()
  while (!profileMatchesState(activeProfile, state)) {
    const key = profileIdentityKey(state.schedulingProfile)
    if (visited.has(key)) return { status: 'blocked', state: input.state, reason: 'missing-upgrade-path' }
    visited.add(key)
    const upgrade = upgradeFromState(input.registry, state)
    if (!upgrade) return { status: 'blocked', state: input.state, reason: 'missing-upgrade-path' }
    const nextProfile = profileDefinition(input.registry, upgrade.to)
    if (!nextProfile) return { status: 'blocked', state: input.state, reason: 'missing-profile-definition' }
    let sourceOccurrenceId = state.schedulingProfile.sourceOccurrenceId
    if (upgrade.kind === 'grade-rebind') {
      const integratedIds = new Set(state.integratedOccurrences.map((record) => record.occurrenceId))
      const targetOccurrences = [...input.term.occurrences]
        .filter((occurrence) => occurrence.grade === nextProfile.grade && integratedIds.has(occurrence.occurrenceId))
        .sort((left, right) => left.occurrenceId.localeCompare(right.occurrenceId))
      const targetOccurrence = targetOccurrences[targetOccurrences.length - 1]
      if (!targetOccurrence) return { status: 'blocked', state: input.state, reason: 'missing-rebind-occurrence' }
      sourceOccurrenceId = targetOccurrence.occurrenceId
    }
    state = applyProfileToState(state, nextProfile, sourceOccurrenceId, input.currentRotationCycle)
    profile = nextProfile
    appliedUpgradeIds.push(upgrade.id)
  }
  return { status: 'upgraded', state, profile, appliedUpgradeIds }
}
