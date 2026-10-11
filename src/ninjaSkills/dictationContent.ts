import { GRADE2_DECK_ID, GRADE5_DECK_ID, KINDERGARTEN_SHEETS_ID } from '../config.ts'
import type { LearningModuleCohort } from './contracts.ts'

export const DICTATION_SUPPORT_VERSION = 'dictation-language-2026-10-11-v1'
// Generated support for exact teacher targets, not additional curriculum. Keep
// existing/pinned support untouched. Each row has one syllable/choice set per Hanzi.
const support: Record<string, readonly (readonly [string, string, string, readonly string[]])[]> = {
  Kindergarten: [
    ['九', 'jiǔ', '我有九个苹果。', ['九久酒']],
    ['十', 'shí', '这里有十本书。', ['十时石']],
    ['白', 'bái', '小兔子的毛很白。', ['白百摆']],
    ['红色', 'hóng sè', '我喜欢红色的花。', ['红洪虹', '色瑟涩']],
    ['蓝色', 'lán sè', '这是一个蓝色的书包。', ['蓝兰篮', '色瑟涩']],
  ],
  'Grade 2': [
    ['英雄', 'yīng xióng', '这位英雄救了一个孩子。', ['英应鹰', '雄熊兄']],
    ['每个', 'měi gè', '每个孩子都有一本书。', ['每美没', '个各哥']],
    ['勇敢', 'yǒng gǎn', '这个孩子非常勇敢。', ['勇永泳', '敢感赶']],
    ['城市', 'chéng shì', '我们住在这个城市。', ['城成程', '市是事']],
    ['上班', 'shàng bān', '爸爸每天坐车去上班。', ['上尚伤', '班搬般']],
    ['公园', 'gōng yuán', '周末我们去公园散步。', ['公共工', '园圆元']],
  ],
  'Grade 5': [
    ['盐', 'yán', '妈妈在汤里加了一点盐。', ['盐言岩']],
    ['咸', 'xián', '这碗汤太咸了。', ['咸闲贤']],
    ['层', 'céng', '桌子上有一层薄薄的灰尘。', ['层曾蹭']],
    ['河流', 'hé liú', '这条河流穿过我们的城市。', ['河和合', '流留刘']],
    ['躺', 'tǎng', '小猫躺在沙发上休息。', ['躺倘淌']],
    ['留', 'liú', '下雨了，我们留在家里。', ['留流刘']],
  ],
}
const sourceIds: Record<string, string> = {
  Kindergarten: KINDERGARTEN_SHEETS_ID,
  'Grade 2': GRADE2_DECK_ID,
  'Grade 5': GRADE5_DECK_ID,
}

export function withDictationContent(cohort: LearningModuleCohort): LearningModuleCohort {
  if (!cohort.provenance.length || cohort.provenance.some((p) => p.source.sourceDocumentId !== sourceIds[cohort.grade]))
    return cohort
  return {
    ...cohort,
    terms: cohort.terms.map((term) => {
      const row = support[cohort.grade]?.find(([text]) => text === term.text)
      if (!row || (term.pinyinSteps && term.context)) return term
      const [, pinyin, sentence, choices] = row
      return {
        ...term,
        ...(term.pinyinSteps
          ? {}
          : {
              pinyinText: term.pinyinText || pinyin,
              pinyinSteps: pinyin
                .split(' ')
                .map((syllable, index) => ({ pinyin: syllable, candidates: Array.from(choices[index]) })),
            }),
        ...(term.context ? {} : { context: { sentence, tokens: [sentence] } }),
        supplementalVersion: DICTATION_SUPPORT_VERSION,
      }
    }),
  }
}

/** One owned audio plan avoids overlapping replay chains. Punctuation separates
 * all four required parts; report/navigation pause is handled by the host player. */
export function dictationAudioText(word: string, sentence: string) {
  return `${word}。${sentence.replace(/[。！？.!?]+$/u, '')}。${word}。${word}。`
}
