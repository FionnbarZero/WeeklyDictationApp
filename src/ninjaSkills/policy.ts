import type { LearningModuleId, LearningModuleTerm } from './contracts.ts'

export const GAME_POLICY_VERSION = 'ninja-dojo-games-v1' as const
type Tier = LearningModuleTerm['tier']
type Policy = {
  tiers: readonly Tier[]
  phase: 'reinforcement' | 'acquisition'
  content: readonly string[]
  audio: string
  scoring: 'reviewed-game-attempts' | 'grade-acquisition'
  implementation: 'stage-b' | 'later-stage'
}

/** Approved product rules. Availability is separate from the intended contract. */
export const GAME_POLICIES = {
  'memory-flip': {
    tiers: ['tier-2'],
    phase: 'reinforcement',
    content: ['characters'],
    audio: 'tapped-character',
    scoring: 'reviewed-game-attempts',
    implementation: 'stage-b',
  },
  'speed-match': {
    tiers: ['tier-1', 'tier-2'],
    phase: 'reinforcement',
    content: ['distinct-meanings'],
    audio: 'tapped-word-or-meaning',
    scoring: 'reviewed-game-attempts',
    implementation: 'stage-b',
  },
  'context-gap-dash': {
    tiers: ['tier-1'],
    phase: 'reinforcement',
    content: ['sentence', 'distinct-choices'],
    audio: 'sentence',
    scoring: 'reviewed-game-attempts',
    implementation: 'stage-b',
  },
  'sentence-scramble': {
    tiers: ['tier-1'],
    phase: 'reinforcement',
    content: ['sentence', 'ordered-tokens'],
    audio: 'sentence',
    scoring: 'reviewed-game-attempts',
    implementation: 'stage-b',
  },
  'target-blast': {
    tiers: ['tier-2'],
    phase: 'reinforcement',
    content: ['characters'],
    audio: 'target',
    scoring: 'reviewed-game-attempts',
    implementation: 'later-stage',
  },
  'dictation-streak': {
    tiers: ['tier-1', 'tier-2'],
    phase: 'reinforcement',
    content: ['pinyin-choices', 'sentence'],
    audio: 'word-sentence-word-word',
    scoring: 'reviewed-game-attempts',
    implementation: 'later-stage',
  },
  'whispering-scrolls': {
    tiers: ['tier-2'],
    phase: 'acquisition',
    content: ['temporary-recording-comparison'],
    audio: 'grade-reading-acquisition',
    scoring: 'grade-acquisition',
    implementation: 'later-stage',
  },
  'stroke-order-slay': {
    tiers: ['tier-1'],
    phase: 'acquisition',
    content: ['stroke-guides'],
    audio: 'grade-writing-acquisition',
    scoring: 'grade-acquisition',
    implementation: 'later-stage',
  },
} as const satisfies Record<string, Policy>

export function eligibleGameTier(id: LearningModuleId, tier: Tier) {
  return (GAME_POLICIES[id].tiers as readonly Tier[]).includes(tier)
}

/** Rotation is an input, so menus, launches, and pinned attempts agree. */
export function rotatingGameTerms(
  id: LearningModuleId,
  terms: readonly LearningModuleTerm[],
  limit: number,
  visit = 0,
) {
  if (!Number.isSafeInteger(visit) || visit < 0 || !Number.isSafeInteger(limit) || limit < 1)
    throw new Error('Invalid game selection.')
  if (!terms.length) return []
  const start = ((visit % terms.length) * Math.min(limit, terms.length)) % terms.length
  const rotated = [...terms.slice(start), ...terms.slice(0, start)]
  const selected = rotated.slice(0, limit)
  if (id === 'speed-match') {
    // Every mixed round needs both tiers, including when one tier is much smaller.
    for (const tier of GAME_POLICIES[id].tiers) {
      if (!selected.some((term) => term.tier === tier)) {
        const replacement = rotated.find((term) => term.tier === tier)
        if (!replacement || selected.length < 2) return []
        selected[selected.length - 1] = replacement
      }
    }
  }
  return selected
}
