import type {
  LearningGameChannel,
  LearningGameDefinition,
  LearningGameId,
} from './contracts.ts'

export const LEARNING_GAME_CATALOG = [
  {
    id: 'speed-match',
    title: 'Speed Match',
    description: 'Match each target with its paired word, meaning, image, or sound cue.',
    channels: ['tier-1-writing', 'tier-2-reading'],
    skills: ['receptive'],
    inputKind: 'pairs',
    estimatedSeconds: [45, 75],
  },
  {
    id: 'target-blast',
    title: 'Target Blast',
    description: 'Select the correct moving target before the next prompt appears.',
    channels: ['tier-1-writing', 'tier-2-reading'],
    skills: ['receptive'],
    inputKind: 'selection',
    estimatedSeconds: [45, 75],
  },
  {
    id: 'lily-pad-path',
    title: 'Lily-Pad Path',
    description: 'Move a character across a short path by selecting correct answers.',
    channels: ['tier-1-writing', 'tier-2-reading'],
    skills: ['receptive'],
    inputKind: 'selection',
    estimatedSeconds: [60, 90],
  },
  {
    id: 'memory-flip',
    title: 'Memory Flip',
    description: 'Reveal tiles and remember where each matching pair is located.',
    channels: ['tier-1-writing', 'tier-2-reading'],
    skills: ['receptive'],
    inputKind: 'pairs',
    estimatedSeconds: [60, 120],
  },
  {
    id: 'context-gap-dash',
    title: 'Context Gap Dash',
    description: 'Read an approved sentence and select the missing word.',
    channels: ['tier-2-reading'],
    skills: ['reading', 'receptive'],
    inputKind: 'context',
    estimatedSeconds: [60, 90],
  },
  {
    id: 'sentence-scramble',
    title: 'Sentence Scramble',
    description: 'Reorder approved sentence chunks into the correct reading order.',
    channels: ['tier-2-reading'],
    skills: ['reading', 'receptive'],
    inputKind: 'sequence',
    estimatedSeconds: [60, 120],
  },
  {
    id: 'read-aloud-boss-rush',
    title: 'Read-Aloud Boss Rush',
    description: 'Read, compare with the model, and self-assess each target.',
    channels: ['tier-2-reading'],
    skills: ['reading'],
    inputKind: 'production',
    estimatedSeconds: [90, 180],
  },
  {
    id: 'dictation-streak',
    title: 'Dictation Streak',
    description: 'Listen, write, reveal, and self-assess while building a streak.',
    channels: ['tier-1-writing'],
    skills: ['writing'],
    inputKind: 'production',
    estimatedSeconds: [60, 120],
  },
  {
    id: 'copy-hide-write-combo',
    title: 'Copy–Hide–Write Combo',
    description: 'Copy a visible target, hide it, then write it from memory.',
    channels: ['tier-1-writing'],
    skills: ['writing'],
    inputKind: 'production',
    estimatedSeconds: [60, 150],
  },
  {
    id: 'correction-rescue',
    title: 'Correction Rescue',
    description: 'Repair a missed target through visible copies and a hidden attempt.',
    channels: ['tier-1-writing'],
    skills: ['writing'],
    inputKind: 'production',
    estimatedSeconds: [60, 150],
  },
] as const satisfies readonly LearningGameDefinition[]

export function learningGameDefinition(id: LearningGameId) {
  return LEARNING_GAME_CATALOG.find((game) => game.id === id)
}

export function learningGamesForChannel(channel: LearningGameChannel) {
  return LEARNING_GAME_CATALOG.filter((game) =>
    (game.channels as readonly LearningGameChannel[]).includes(channel))
}

export function learningGameSupportsChannel(id: LearningGameId, channel: LearningGameChannel) {
  const game = learningGameDefinition(id)
  return Boolean(game && (game.channels as readonly LearningGameChannel[]).includes(channel))
}
