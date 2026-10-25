import { GRADE2_DECK_ID, GRADE5_DECK_ID, KINDERGARTEN_SHEETS_ID } from '../config.ts'
import type { LearningModuleCohort } from './contracts.ts'
import { GAME_CONTENT_VERSION, GAME_LANGUAGE } from './gameLanguagePreviewCatalog.ts'

const sources: Readonly<Record<string, string>> = {
  Kindergarten: KINDERGARTEN_SHEETS_ID,
  'Grade 2': GRADE2_DECK_ID,
  'Grade 5': GRADE5_DECK_ID,
}

/** Add support only to fresh, exact source targets. Saved packs bypass catalog
 * hydration in content.ts; no word, occurrence, tier or source identity changes. */
export function withPreviewGameLanguage(cohort: LearningModuleCohort): LearningModuleCohort {
  const source = sources[cohort.grade]
  if (!source || !cohort.provenance.length || cohort.provenance.some((p) => p.source.sourceDocumentId !== source))
    return cohort
  return {
    ...cohort,
    terms: cohort.terms.map((term) => {
      if (term.tier === 'tier-3') return term
      const row = GAME_LANGUAGE[cohort.grade]?.find(([text]) => text === term.text)
      if (!row) return term
      const [, meaning, pinyin, tokens, choices] = row
      // Preserve source-supplied support, including an alternate pronunciation.
      // Never attach generated syllables to conflicting source Pinyin.
      const addPinyin = !term.pinyinSteps && (!term.pinyinText || term.pinyinText === pinyin)
      if (term.meaning && term.context && !addPinyin) return term
      return {
        ...term,
        meaning: term.meaning || meaning,
        ...(term.context ? {} : { context: { sentence: tokens.join(''), tokens } }),
        ...(addPinyin
          ? {
              pinyinText: term.pinyinText || pinyin,
              pinyinSteps: pinyin.split(' ').map((syllable, index) => ({
                pinyin: syllable,
                candidates: Array.from(choices[index]),
              })),
            }
          : {}),
        supplementalVersion: GAME_CONTENT_VERSION,
      }
    }),
  }
}
