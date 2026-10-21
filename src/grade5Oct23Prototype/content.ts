import type { Dataset, Word } from '../domain/contracts.ts'
import { TARGETS } from '../grade5PresentationPreview/assessmentData.ts'
import type { LearningModulePair, LearningModuleSequenceRound } from '../ninjaSkills/contracts.ts'
import type { Tier2ReadingPathway, Tier2ReadingTarget } from '../tier2/contracts.ts'

export const PROTOTYPE_TITLE = '10/19 – Fifth Grade Ninja Dojo'
export const ASSESSMENT_ID = 'grade5-oct23-2026-page2-v1'
export const PROTOTYPE_OWNER = 'synthetic-grade5-oct23-owner'
export const WRITING_KEY = `ninja-grade5-oct23-prototype-v1:${PROTOTYPE_OWNER}:writing`
export { SOURCE, TARGETS } from '../grade5PresentationPreview/assessmentData.ts'

export const writingTargets: Word[] = TARGETS.map((target) => ({
  id: `${ASSESSMENT_ID}:${target.key}`,
  datasetId: ASSESSMENT_ID,
  grade: 'Grade 5',
  text: target.text,
  sentence: target.sentence,
  language: 'mandarin',
  tier: 'tier-1',
  activityType: 'dictation',
  learningModule: {
    meaning: target.meaning,
    pinyinText: target.pinyin,
    context: { sentence: target.sentence, tokens: [...target.tokens] },
  },
}))
export const readingTargets: Tier2ReadingTarget[] = writingTargets.map((target) => ({
  ...target,
  language: 'mandarin',
  tier: 'tier-2',
  activityType: 'reading',
}))
export const writingDataset: Dataset = {
  id: ASSESSMENT_ID,
  dateRange: 'October 23 test · shared reading and writing targets',
  startDate: '2026-10-19',
  endDate: '2026-10-23',
  grade: 'Grade 5',
  schoolYear: '2026–2027',
  description:
    'Isolated owner-requested assessment prototype, transcribed from PDF page 2; not an imported slide cohort.',
  words: writingTargets,
}
export const readingPathway: Tier2ReadingPathway = {
  kind: 'acquisition',
  available: true,
  cohorts: [{ datasetId: ASSESSMENT_ID, available: true, targets: readingTargets }],
}
export const shurikenPairs: LearningModulePair[] = TARGETS.map((target) => ({
  id: `meaning:${target.key}`,
  targetId: `${ASSESSMENT_ID}:${target.key}`,
  left: { id: `word:${target.key}`, label: target.text },
  right: { id: `definition:${target.key}`, label: target.meaning },
}))
export const sushiRounds: LearningModuleSequenceRound[] = TARGETS.map((target) => {
  const tokens = target.tokens.map((label, index) => ({ id: `token:${target.key}:${index}`, label }))
  return {
    id: `sentence:${target.key}`,
    targetId: `${ASSESSMENT_ID}:${target.key}`,
    targetText: target.sentence,
    audioText: target.sentence,
    tokens: [...tokens.slice(2), ...tokens.slice(0, 2)],
    correctTokenIds: tokens.map((token) => token.id),
  }
})
