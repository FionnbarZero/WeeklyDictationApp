import { GRADE5_DECK_ID } from '../config.ts'
import type { LearningModuleCohort } from '../ninjaSkills/contracts.ts'

export const GRADE5_MASTERED_LANGUAGE_VERSION = 'grade5-mastered-practice-2026-10-21-v1'

// Generated practice support, not teacher-authored curriculum. The isolated
// Grade 5 preview uses this exact-match overlay only for its historical mastered
// cohort. It cannot add targets, change tiers, or replace source-authored content.
const language: ReadonlyMap<string, readonly [meaning: string, tokens?: readonly string[]]> = new Map([
  ['怎样', ['how', ['你', '知道', '怎样', '去', '学校', '吗', '？']]],
  ['吸收', ['absorb', ['植物', '会', '吸收', '水分', '。']]],
  ['通过', ['through / by means of', ['我们', '通过', '阅读', '学习', '知识', '。']]],
  ['像', ['like / resemble', ['这朵', '云', '像', '一只', '小兔子', '。']]],
  ['如果', ['if', ['如果', '下雨', '，', '我们', '就', '带', '伞', '。']]],
  ['需要', ['need', ['小树', '需要', '阳光', '和', '水', '。']]],
  ['部分', ['part / portion', ['我', '吃了', '一', '部分', '蛋糕', '。']]],
  ['重要', ['important', ['每天', '喝水', '很', '重要', '。']]],
  ['开始', ['begin / start', ['我们', '开始', '做', '作业', '了', '。']]],
  ['各种各样', ['all kinds of', ['公园', '里', '有', '各种各样', '的', '花', '。']]],
  ['提醒', ['remind']],
  ['年长的', ['older']],
  ['并且', ['and / moreover']],
  ['表达', ['express']],
  ['碰', ['touch / bump into']],
  ['空气', ['air']],
  ['根', ['root']],
  ['帮助', ['help']],
  ['植物', ['plant']],
  ['食物', ['food']],
  ['得到', ['get / obtain']],
  ['关', ['close / turn off']],
  ['打开', ['open']],
  ['海洋', ['ocean']],
  ['阳光', ['sunlight']],
  ['鲨鱼', ['shark']],
  ['天敌', ['natural enemy / predator']],
  ['生存', ['survive']],
])

export function withGrade5MasteredLanguage(cohort: LearningModuleCohort): LearningModuleCohort {
  if (
    cohort.grade !== 'Grade 5' ||
    !cohort.provenance.length ||
    cohort.provenance.some(
      ({ source }) => source.sourceType !== 'google-slides' || source.sourceDocumentId !== GRADE5_DECK_ID,
    )
  ) {
    return cohort
  }
  return {
    ...cohort,
    terms: cohort.terms.map((term) => {
      const entry = language.get(term.text)
      if (!entry) return term
      const [meaning, tokens] = entry
      const addMeaning = !term.meaning
      const addContext = !term.context && Boolean(tokens)
      if (!addMeaning && !addContext) return term
      return {
        ...term,
        ...(addMeaning ? { meaning } : {}),
        ...(addContext && tokens ? { context: { sentence: tokens.join(''), tokens: [...tokens] } } : {}),
        supplementalVersion: GRADE5_MASTERED_LANGUAGE_VERSION,
      }
    }),
  }
}
