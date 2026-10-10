import type { LearningModuleId } from './contracts.ts'

export type LearningModuleCatalogEntry = {
  readonly id: LearningModuleId
  readonly title: string
  readonly eyebrow: string
  readonly description: string
  readonly icon: string
  readonly missingDataDescription: string
}

export const LEARNING_MODULE_CATALOG = [
  {
    id: 'dictation-streak',
    title: 'Dictation Streak',
    eyebrow: 'Tier 1 + Tier 2',
    description: 'Listen to a Mandarin word, type its Pinyin, and choose the correct characters.',
    icon: '🎧',
    missingDataDescription: 'approved Pinyin steps',
  },
  {
    id: 'speed-match',
    title: 'Shuriken Match',
    eyebrow: 'Tier 1 + Tier 2 · Meaning match',
    description: 'Match each Mandarin word seal with its validated English meaning.',
    icon: '🥷',
    missingDataDescription: 'approved English meanings',
  },
  {
    id: 'target-blast',
    title: 'Shadow Strike Dojo',
    eyebrow: 'Tier 2 · Listen and choose',
    description: 'Hear a word and strike the matching character target.',
    icon: '🎯',
    missingDataDescription: 'at least two distinct cohort targets',
  },
  {
    id: 'memory-flip',
    title: 'Memory Lanterns',
    eyebrow: 'Tier 2 · Character memory',
    description: 'Turn over lanterns and find each character’s identical twin.',
    icon: '🏮',
    missingDataDescription: 'at least two distinct cohort targets',
  },
  {
    id: 'context-gap-dash',
    title: 'Context Gap Dash',
    eyebrow: 'Tier 1 · Writing targets',
    description: 'Listen to a Mandarin sentence and choose its missing word.',
    icon: '🏃',
    missingDataDescription: 'approved context sentences and distinct choices',
  },
  {
    id: 'sentence-scramble',
    title: 'Sushi Scramble',
    eyebrow: 'Tier 1 · Writing targets',
    description: 'Rebuild a validated Mandarin sentence from its ordered word tokens.',
    icon: '🍣',
    missingDataDescription: 'approved sentences and ordered tokens',
  },
] as const satisfies readonly LearningModuleCatalogEntry[]

export function learningModuleCatalogEntry(id: LearningModuleId) {
  return LEARNING_MODULE_CATALOG.find((entry) => entry.id === id)!
}
