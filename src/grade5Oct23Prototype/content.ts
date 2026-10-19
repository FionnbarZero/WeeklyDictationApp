import type { Dataset, Word } from '../domain/contracts.ts'
import type { LearningModulePair, LearningModuleSequenceRound } from '../ninjaSkills/contracts.ts'
import type { Tier2ReadingPathway, Tier2ReadingTarget } from '../tier2/contracts.ts'

export const PROTOTYPE_TITLE = '10/19 – Fifth Grade Ninja Dojo'
export const ASSESSMENT_ID = 'grade5-oct23-2026-page2-v1'
export const PROTOTYPE_OWNER = 'synthetic-grade5-oct23-owner'
export const WRITING_KEY = `ninja-grade5-oct23-prototype-v1:${PROTOTYPE_OWNER}:writing`
export const SOURCE = {
  url: 'https://drive.google.com/file/d/1Nw8bUxSQzyQt7QFj7d-zj_0ngh2Yzi3i/view',
  page: 2,
  heading: '10/23 Chinese Dictation to Review',
  testDate: '2026-10-23',
} as const

// One teacher-authored assessment list. Reading/writing are response modes,
// not two different vocabulary cohorts. Preserve the supplied sentences verbatim.
export const TARGETS = [
  {
    key: 'or',
    text: '或者',
    pinyin: 'huò zhě',
    meaning: 'or',
    sentence: '你可以画画，或者看书。',
    tokens: ['你', '可以', '画画，', '或者', '看书。'],
  },
  {
    key: 'understand',
    text: '了解',
    pinyin: 'liǎo jiě',
    meaning: 'understand / learn about',
    sentence: '我想了解大象是怎么生活的。',
    tokens: ['我', '想', '了解', '大象', '是', '怎么', '生活', '的。'],
  },
  {
    key: 'finish',
    text: '完',
    pinyin: 'wán',
    meaning: 'finish',
    sentence: '我已经看完这本书了。',
    tokens: ['我', '已经', '看', '完', '这', '本', '书', '了。'],
  },
  {
    key: 'excited',
    text: '兴奋的',
    pinyin: 'xīng fèn de',
    meaning: 'excited',
    sentence: '听到这个好消息，他是很兴奋的。',
    tokens: ['听到', '这个', '好消息，', '他', '是', '很', '兴奋的。'],
  },
  {
    key: 'tell',
    text: '告诉',
    pinyin: 'gào su',
    meaning: 'tell',
    sentence: '老师告诉我们一个有趣的故事。',
    tokens: ['老师', '告诉', '我们', '一个', '有趣的', '故事。'],
  },
  {
    key: 'communicate',
    text: '沟通',
    pinyin: 'gōu tōng',
    meaning: 'communicate',
    sentence: '大象会用声音互相沟通。',
    tokens: ['大象', '会', '用', '声音', '互相', '沟通。'],
  },
  {
    key: 'quickly',
    text: '快速地',
    pinyin: 'kuài sù de',
    meaning: 'quickly',
    sentence: '大象快速地跑向前方。',
    tokens: ['大象', '快速地', '跑', '向', '前方。'],
  },
  {
    key: 'interesting',
    text: '有意思',
    pinyin: 'yǒu yì si',
    meaning: 'interesting',
    sentence: '大象的沟通方式很有意思。',
    tokens: ['大象', '的', '沟通', '方式', '很', '有意思。'],
  },
] as const

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
