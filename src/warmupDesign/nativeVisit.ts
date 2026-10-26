import type { Word } from '../domain.ts'

export type NativeWarmupVisit = {
  version: 1
  id: string
  words: { id: string; text: string; datasetId: string }[]
  answers: boolean[]
  closed: boolean
}

/** Grade-owned selection is pinned for one visit. Only target identity and
 * first answers are durable; never handwriting, typed responses or recordings. */
export function readNativeWarmupVisit(raw: string | null, pool: Word[]): NativeWarmupVisit | null {
  if (!raw) return null
  const v = JSON.parse(raw) as NativeWarmupVisit
  if (
    !v ||
    v.version !== 1 ||
    typeof v.id !== 'string' ||
    !v.id ||
    !Array.isArray(v.words) ||
    !v.words.length ||
    v.words.length > 100 ||
    !Array.isArray(v.answers) ||
    v.answers.length > v.words.length ||
    v.answers.some((a) => typeof a !== 'boolean') ||
    typeof v.closed !== 'boolean' ||
    v.words.some((w) => !w || !pool.some((p) => p.id === w.id && p.text === w.text && p.datasetId === w.datasetId))
  )
    throw new Error('This Warmup’s saved words could not be verified. Your progress has been preserved.')
  return v
}

export function newNativeWarmupVisit(words: Word[], id: string): NativeWarmupVisit {
  return {
    version: 1,
    id,
    words: words.map(({ id, text, datasetId }) => ({ id, text, datasetId })),
    answers: [],
    closed: false,
  }
}

export function nativeVisitWords(v: NativeWarmupVisit, pool: Word[]) {
  return v.words.map((w) => {
    const word = pool.find((p) => p.id === w.id && p.text === w.text && p.datasetId === w.datasetId)
    if (!word) throw new Error('A saved Warmup word is unavailable. No progress was changed.')
    return word
  })
}

export function answerNativeWarmup(v: NativeWarmupVisit, position: number, correct: boolean): NativeWarmupVisit {
  if (v.closed || position !== v.answers.length || position >= v.words.length)
    throw new Error('This Warmup has moved ahead. Reopen it to continue from its saved place.')
  return { ...v, answers: [...v.answers, correct] }
}

/** Call under withScrollsWrite. A storage event alone is not a stale-tab fence. */
export function writeNativeWarmup(storage: Storage, key: string, expected: string | null, value: unknown) {
  const raw = JSON.stringify(value)
  const current = storage.getItem(key)
  // A write may succeed even if its confirmation read fails. Confirm the exact
  // same transition on retry; never accept a different next state.
  if (current === raw) return raw
  if (current !== expected) throw new Error('Warmup changed in another tab. Exit and reopen to use its saved place.')
  storage.setItem(key, raw)
  if (storage.getItem(key) !== raw) throw new Error('Warmup could not confirm saving. Please try again.')
  return raw
}
