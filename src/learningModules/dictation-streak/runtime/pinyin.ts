const UMLAUTED_U = /[üǖǘǚǜ]/g
const PINYIN_SYLLABLE = /^[a-züǖǘǚǜāáǎàēéěèīíǐìōóǒòūúǔùńňǹêv:]+[1-5]?$/iu

export function normalizePinyin(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/u:/g, 'v')
    .replace(UMLAUTED_U, 'v')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[1-5]/g, '')
    .replace(/[^a-zv]/g, '')
}

export function isPinyinPrefix(input: string, expectedPinyin = '') {
  if (!PINYIN_SYLLABLE.test(input)) return false
  const normalizedInput = normalizePinyin(input)
  const normalizedExpected = normalizePinyin(expectedPinyin)
  return normalizedInput.length > 0 && normalizedExpected.startsWith(normalizedInput)
}

export function isExactPinyin(input: string, expectedPinyin = '') {
  if (!PINYIN_SYLLABLE.test(input)) return false
  const normalizedInput = normalizePinyin(input)
  return normalizedInput.length > 0 && normalizedInput === normalizePinyin(expectedPinyin)
}

export type CharacterCorrection = {
  readonly index: number
  readonly chosen: string
  readonly correct: string
}

export function findCharacterCorrections(response: string, target: string): readonly CharacterCorrection[] {
  const responseCharacters = Array.from(response.trim())
  return Array.from(target.trim()).flatMap((correct, index) => {
    const chosen = responseCharacters[index] || '—'
    return chosen === correct ? [] : [{ index, chosen, correct }]
  })
}

export function isCorrectCharacterAt(candidate: string, target: string, index: number) {
  return candidate === Array.from(target.trim())[index]
}
