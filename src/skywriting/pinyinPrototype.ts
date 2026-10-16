import { isExactPinyin } from '../learningModules/dictation-streak/runtime/pinyin.ts'

// One locally supported word for evaluating Pinyin input in Writing Dojo.
export const PERSON_PINYIN_CANDIDATES = ['仁', '人', '任'] as const

export function personPinyinCandidates(input: string, composing: boolean) {
  return !composing && isExactPinyin(input, 'rén') ? PERSON_PINYIN_CANDIDATES : []
}
