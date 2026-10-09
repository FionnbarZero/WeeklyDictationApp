import type { LearningModuleCohort } from './contracts.ts'
import { GRADE2_DECK_ID, GRADE5_DECK_ID, KINDERGARTEN_SHEETS_ID } from '../config.ts'

const sourceIds: Readonly<Record<string, string>> = {
  Kindergarten: KINDERGARTEN_SHEETS_ID,
  'Grade 2': GRADE2_DECK_ID,
  'Grade 5': GRADE5_DECK_ID,
}

export const SUPPLEMENTAL_VERSION = 'practice-language-2026-10-08-v1'
// Generated practice support, not teacher-authored curriculum. Only exact source
// targets receive an overlay; this catalog cannot add or retier teacher words.
const language: Record<string, readonly (readonly [text: string, meaning: string, tokens?: readonly string[]])[]> = {
  Kindergarten: [
    ['九', 'nine', ['我', '有', '九', '个', '苹果', '。']],
    ['十', 'ten', ['这里', '有', '十', '本', '书', '。']],
    ['白', 'white', ['小', '兔子', '的', '毛', '很', '白', '。']],
    ['红色', 'red'],
    ['蓝色', 'blue'],
  ],
  'Grade 2': [
    ['英雄', 'hero', ['这位', '英雄', '救了', '一个', '孩子', '。']],
    ['每个', 'each', ['每个', '孩子', '都', '有', '一本', '书', '。']],
    ['勇敢', 'brave', ['这个', '孩子', '非常', '勇敢', '。']],
    ['保护', 'protect', ['我们', '应该', '保护', '小', '动物', '。']],
    ['动物', 'animal', ['森林', '里', '住着', '许多', '动物', '。']],
    ['让', 'let', ['请', '让', '我', '帮助', '你', '。']],
    ['因为', 'because', ['因为', '下雨', '，', '我们', '留在', '家里', '。']],
    ['帮助', 'help', ['朋友', '会', '互相', '帮助', '。']],
    ['有爱心', 'caring', ['她', '是', '一个', '有爱心', '的', '人', '。']],
    ['城市', 'city'],
    ['上班', 'go to work'],
    ['公园', 'park'],
    ['图书馆', 'library'],
    ['散步', 'take a walk'],
    ['漂亮', 'pretty'],
    ['各种各样的', 'all kinds of'],
  ],
  'Grade 5': [
    ['盐', 'salt', ['妈妈', '在', '汤里', '加了', '一点', '盐', '。']],
    ['咸', 'salty', ['这碗', '汤', '太', '咸', '了', '。']],
    ['层', 'layer', ['桌子', '上', '有', '一', '层', '薄薄的', '灰尘', '。']],
    ['用处', 'usefulness', ['这把', '小', '剪刀', '有', '很多', '用处', '。']],
    ['神奇的', 'magical', ['故事', '里', '有', '一扇', '神奇的', '门', '。']],
    ['河流', 'river'],
    ['躺', 'lie down'],
    ['留', 'stay'],
    ['不断地', 'continuously'],
    ['美味的', 'delicious'],
    ['刷牙', 'brush teeth'],
    ['洒', 'sprinkle'],
    ['沉', 'sink'],
    ['浮', 'float'],
  ],
}

export function withSupplementalContent(cohort: LearningModuleCohort): LearningModuleCohort {
  const sourceId = sourceIds[cohort.grade]
  if (!sourceId || !cohort.provenance.length || cohort.provenance.some((p) => p.source.sourceDocumentId !== sourceId))
    return cohort
  const entries = language[cohort.grade] || []
  return {
    ...cohort,
    terms: cohort.terms.map((term) => {
      const entry = entries.find(([text]) => text === term.text)
      if (!entry || (term.meaning && term.context)) return term
      const tokens = entry[2]
      return {
        ...term,
        meaning: term.meaning || entry[1],
        ...(term.context ? {} : tokens ? { context: { sentence: tokens.join(''), tokens } } : {}),
        supplementalVersion: SUPPLEMENTAL_VERSION,
      }
    }),
  }
}
