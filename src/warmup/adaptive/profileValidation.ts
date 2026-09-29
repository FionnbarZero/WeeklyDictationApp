import type {
  AdaptiveWarmupProfile,
  AdaptiveWarmupProfileIdentity,
  AdaptiveWarmupProfileRegistry,
  ChildMasteryState,
  MasteryOccurrence,
  WarmupSchedulingBucket,
} from './contracts.ts'

const BUCKETS: readonly WarmupSchedulingBucket[] = ['recent-entry', 'needs-attention', 'mastery-rotation']

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function nonNegativeInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0
}

function positiveInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) > 0
}

export function profileIdentityKey(identity: AdaptiveWarmupProfileIdentity) {
  return `${identity.id}\u0000${identity.version}`
}

export function profileScopeKey(value: { grade: string; activityModule: string }) {
  return `${value.grade}\u0000${value.activityModule}`
}

export function adaptiveWarmupProfileErrors(profile: AdaptiveWarmupProfile) {
  const errors: string[] = []
  if (!profile || typeof profile !== 'object') return ['Profile must be an object.']
  if (!nonEmptyString(profile.id)) errors.push('Profile ID is required.')
  if (!positiveInteger(profile.version)) errors.push('Profile version must be a positive integer.')
  if (!nonEmptyString(profile.grade)) errors.push('Profile grade is required.')
  if (!nonEmptyString(profile.activityModule)) errors.push('Profile activity module is required.')
  if (!['optional', 'required'].includes(profile.preActivityWarmupRequirement)) errors.push('Pre-activity Warmup requirement is invalid.')
  if (!positiveInteger(profile.recentEntryPromotionCorrect)) errors.push('Recent Entry promotion threshold must be a positive integer.')
  if (!['unique', 'repeat-after-unique-exhaustion'].includes(profile.ordinaryDuplicatePolicy)) errors.push('Ordinary duplicate policy is invalid.')
  if (typeof profile.rotationPolicy?.exhaustBeforeReuse !== 'boolean'
    || typeof profile.rotationPolicy?.advanceCycleWhenExhausted !== 'boolean'
    || !['current-cycle', 'next-cycle'].includes(profile.rotationPolicy?.promotedTermEligibility)) {
    errors.push('Rotation policy is invalid.')
  }
  if (profile.rotationPolicy?.promotedTermEligibility === 'next-cycle'
    && (!profile.rotationPolicy.exhaustBeforeReuse || !profile.rotationPolicy.advanceCycleWhenExhausted)) {
    errors.push('Next-cycle promotion requires exhaust-before-reuse and automatic cycle advancement.')
  }
  if (!profile.rotationPolicy?.exhaustBeforeReuse && profile.rotationPolicy?.advanceCycleWhenExhausted) {
    errors.push('Automatic cycle advancement requires exhaust-before-reuse.')
  }
  for (const visitType of ['standalone', 'pre-activity'] as const) {
    const visit = profile.visits?.[visitType]
    if (!visit || !positiveInteger(visit.maximum)) {
      errors.push(`${visitType} maximum must be a positive integer.`)
      continue
    }
    const allocation = visit.allocation
    if (!allocation || !BUCKETS.every((bucket) => nonNegativeInteger(allocation[bucket]))) {
      errors.push(`${visitType} allocation is invalid.`)
      continue
    }
    const allocationTotal = BUCKETS.reduce((total, bucket) => total + allocation[bucket], 0)
    if (allocationTotal > visit.maximum) errors.push(`${visitType} allocation exceeds its maximum.`)
  }
  if (!Array.isArray(profile.fillPriority)
    || profile.fillPriority.length !== BUCKETS.length
    || new Set(profile.fillPriority).size !== BUCKETS.length
    || !profile.fillPriority.every((bucket) => BUCKETS.includes(bucket))) {
    errors.push('Fill priority must contain every scheduling bucket exactly once.')
  }
  return errors
}

export function activeRegistryForProfiles(profiles: readonly AdaptiveWarmupProfile[]): AdaptiveWarmupProfileRegistry {
  return {
    definitions: profiles,
    activeProfiles: profiles.map((profile) => ({
      grade: profile.grade,
      activityModule: profile.activityModule,
      profile: { id: profile.id, version: profile.version },
    })),
    upgrades: [],
  }
}

export function validateAdaptiveWarmupProfileRegistry(registry: AdaptiveWarmupProfileRegistry) {
  const errors: string[] = []
  if (!registry || typeof registry !== 'object'
    || !Array.isArray(registry.definitions)
    || !Array.isArray(registry.activeProfiles)
    || !Array.isArray(registry.upgrades)) {
    return { valid: false, errors: ['Adaptive Warmup profile registry is malformed.'] }
  }
  const definitions = new Map<string, AdaptiveWarmupProfile>()
  for (const profile of registry.definitions) {
    const label = profile && typeof profile === 'object' && nonEmptyString(profile.id) ? profile.id : '<missing-profile-id>'
    for (const error of adaptiveWarmupProfileErrors(profile)) errors.push(`${label}: ${error}`)
    if (!profile || typeof profile !== 'object') continue
    const key = profileIdentityKey(profile)
    if (definitions.has(key)) errors.push(`Adaptive Warmup profile ${profile.id} version ${profile.version} is duplicated.`)
    definitions.set(key, profile)
  }

  const activeScopes = new Set<string>()
  for (const active of registry.activeProfiles) {
    if (!active || typeof active !== 'object'
      || !nonEmptyString(active.grade)
      || !nonEmptyString(active.activityModule)
      || !active.profile
      || !nonEmptyString(active.profile.id)
      || !positiveInteger(active.profile.version)) {
      errors.push('An active Adaptive Warmup profile registration is malformed.')
      continue
    }
    const scope = profileScopeKey(active)
    if (activeScopes.has(scope)) errors.push(`Adaptive Warmup scope ${active.grade}/${active.activityModule} has more than one active profile.`)
    activeScopes.add(scope)
    const definition = definitions.get(profileIdentityKey(active.profile))
    if (!definition) {
      errors.push(`Active profile ${active.profile.id} version ${active.profile.version} has no retained definition.`)
    } else if (definition.grade !== active.grade || definition.activityModule !== active.activityModule) {
      errors.push(`Active profile ${active.profile.id} version ${active.profile.version} does not match its registered scope.`)
    }
  }

  const upgradeIds = new Set<string>()
  const upgradeSources = new Set<string>()
  const edges = new Map<string, string>()
  for (const upgrade of registry.upgrades) {
    if (!upgrade || typeof upgrade !== 'object'
      || !nonEmptyString(upgrade.id)
      || !['version-upgrade', 'grade-rebind'].includes(upgrade.kind)
      || !upgrade.from || !upgrade.to
      || !nonEmptyString(upgrade.from.id) || !positiveInteger(upgrade.from.version)
      || !nonEmptyString(upgrade.to.id) || !positiveInteger(upgrade.to.version)) {
      errors.push('An Adaptive Warmup profile upgrade is malformed.')
      continue
    }
    if (upgradeIds.has(upgrade.id)) errors.push(`Adaptive Warmup profile upgrade ${upgrade.id} is duplicated.`)
    upgradeIds.add(upgrade.id)
    const fromKey = profileIdentityKey(upgrade.from)
    const toKey = profileIdentityKey(upgrade.to)
    if (upgradeSources.has(fromKey)) errors.push(`Profile ${upgrade.from.id} version ${upgrade.from.version} has more than one direct upgrade.`)
    upgradeSources.add(fromKey)
    const from = definitions.get(fromKey)
    const to = definitions.get(toKey)
    if (!from || !to) {
      errors.push(`Profile upgrade ${upgrade.id} references a missing retained definition.`)
      continue
    }
    if (fromKey === toKey) errors.push(`Profile upgrade ${upgrade.id} cannot target the same profile.`)
    if (from.activityModule !== to.activityModule) errors.push(`Profile upgrade ${upgrade.id} cannot cross activity modules.`)
    if (upgrade.kind === 'version-upgrade' && from.grade !== to.grade) errors.push(`Version upgrade ${upgrade.id} cannot cross grades.`)
    if (upgrade.kind === 'grade-rebind' && from.grade === to.grade) errors.push(`Grade rebind ${upgrade.id} must cross grades.`)
    edges.set(fromKey, toKey)
  }
  for (const start of edges.keys()) {
    const seen = new Set<string>()
    let current: string | undefined = start
    while (current && edges.has(current)) {
      if (seen.has(current)) {
        errors.push(`Adaptive Warmup profile upgrades contain a cycle beginning at ${start}.`)
        break
      }
      seen.add(current)
      current = edges.get(current)
    }
  }
  return { valid: errors.length === 0, errors }
}

export function profileDefinition(registry: AdaptiveWarmupProfileRegistry, identity: AdaptiveWarmupProfileIdentity) {
  return registry.definitions.find((profile) => profile.id === identity.id && profile.version === identity.version)
}

export function activeProfileForScope(registry: AdaptiveWarmupProfileRegistry, scope: { grade: string; activityModule: string }) {
  const active = registry.activeProfiles.find((entry) => entry.grade === scope.grade && entry.activityModule === scope.activityModule)
  return active ? profileDefinition(registry, active.profile) : undefined
}

export function profileForOccurrence(occurrence: MasteryOccurrence, registry: AdaptiveWarmupProfileRegistry) {
  return activeProfileForScope(registry, { grade: occurrence.grade, activityModule: occurrence.identity.activityModule })
}

export function profileForState(registry: AdaptiveWarmupProfileRegistry, state: Pick<ChildMasteryState, 'schedulingProfile'>) {
  return profileDefinition(registry, state.schedulingProfile)
}

export function profileMatchesState(profile: AdaptiveWarmupProfile, state: { schedulingProfile: AdaptiveWarmupProfileIdentity }) {
  return state.schedulingProfile.id === profile.id && state.schedulingProfile.version === profile.version
}

export function upgradeFromState(registry: AdaptiveWarmupProfileRegistry, state: Pick<ChildMasteryState, 'schedulingProfile'>) {
  return registry.upgrades.find((upgrade) => profileIdentityKey(upgrade.from) === profileIdentityKey(state.schedulingProfile))
}
