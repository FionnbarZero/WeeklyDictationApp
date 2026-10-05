import type { Dataset, Word } from '../domain/contracts.ts'
import type { VocabularyTier } from './model.ts'

export const DICTATION_CONTEXT_CATALOG_SCHEMA_VERSION = 1 as const

export type DictationContextStatus = 'Draft' | 'Approved' | 'Revise'

export type DictationContextCandidate = {
  readonly id: string
  readonly grade: string
  readonly schoolYear: string
  readonly sourceDocumentId: string
  readonly sourceUnitId: string
  readonly tier: VocabularyTier
  readonly targetOccurrenceId: string
  readonly targetText: string
  /** One entry per Chinese vocabulary unit; at most six entries. */
  readonly contextTokens: readonly string[]
  readonly status: DictationContextStatus
  readonly reviewerNotes?: string
}

export type DictationContextCatalog = {
  readonly schemaVersion: typeof DICTATION_CONTEXT_CATALOG_SCHEMA_VERSION
  readonly generatedAt: string
  readonly candidates: readonly DictationContextCandidate[]
}

export type DictationContextValidation = {
  readonly valid: boolean
  readonly errors: readonly string[]
}

export function dictationContextText(candidate: DictationContextCandidate) {
  return candidate.contextTokens.join('')
}

/**
 * Familiar DTs are grade-owned seed words rather than source occurrences. They
 * may reuse an approved grade-level context only when every approved occurrence
 * of that text agrees on the exact same context. Ambiguity deliberately yields
 * no context instead of choosing curriculum content by accident.
 */
export function approvedContextTextForGradeTarget(
  catalog: DictationContextCatalog,
  grade: string,
  targetText: string,
) {
  const contexts = new Set(catalog.candidates
    .filter((candidate) => candidate.status === 'Approved'
      && candidate.grade === grade
      && candidate.targetText === targetText)
    .map(dictationContextText))
  return contexts.size === 1 ? [...contexts][0] : undefined
}

export function validateDictationContextCandidate(candidate: DictationContextCandidate): DictationContextValidation {
  const errors: string[] = []
  const required = [
    ['id', candidate.id],
    ['grade', candidate.grade],
    ['schoolYear', candidate.schoolYear],
    ['sourceDocumentId', candidate.sourceDocumentId],
    ['sourceUnitId', candidate.sourceUnitId],
    ['targetOccurrenceId', candidate.targetOccurrenceId],
    ['targetText', candidate.targetText],
  ] as const
  for (const [field, value] of required) if (!value.trim()) errors.push(`${field} is required.`)
  if (!['tier-1', 'tier-2', 'tier-3'].includes(candidate.tier)) errors.push('tier is invalid.')
  if (!['Draft', 'Approved', 'Revise'].includes(candidate.status)) errors.push('status is invalid.')
  if (candidate.contextTokens.length === 0 || candidate.contextTokens.length > 6) {
    errors.push('contextTokens must contain one to six Chinese vocabulary units.')
  }
  if (candidate.contextTokens.some((token) => !token.trim() || /\s/.test(token))) {
    errors.push('Each context token must be a nonblank vocabulary unit without spaces.')
  }
  if (!dictationContextText(candidate).includes(candidate.targetText)) {
    errors.push('The context must contain the exact target text at least once.')
  }
  return { valid: errors.length === 0, errors }
}

export function validateDictationContextCatalog(catalog: DictationContextCatalog) {
  const errors: string[] = []
  if (catalog.schemaVersion !== DICTATION_CONTEXT_CATALOG_SCHEMA_VERSION) errors.push('The context catalog schema version is unsupported.')
  if (Number.isNaN(Date.parse(catalog.generatedAt))) errors.push('generatedAt must be an ISO timestamp.')
  const ids = new Set<string>()
  const occurrences = new Set<string>()
  for (const [index, candidate] of catalog.candidates.entries()) {
    const validation = validateDictationContextCandidate(candidate)
    errors.push(...validation.errors.map((error) => `candidates[${index}]: ${error}`))
    if (ids.has(candidate.id)) errors.push(`candidates[${index}]: id is duplicated.`)
    ids.add(candidate.id)
    const occurrence = [candidate.grade, candidate.schoolYear, candidate.sourceDocumentId, candidate.sourceUnitId, candidate.tier, candidate.targetOccurrenceId].join('::')
    if (occurrences.has(occurrence)) errors.push(`candidates[${index}]: target occurrence is duplicated.`)
    occurrences.add(occurrence)
  }
  return { valid: errors.length === 0, errors }
}

function approvedContextFor(dataset: Dataset, word: Word, catalog: DictationContextCatalog) {
  if (!dataset.source) return undefined
  return catalog.candidates.find((candidate) => candidate.status === 'Approved'
    && candidate.grade === dataset.grade
    && candidate.schoolYear === dataset.schoolYear
    && candidate.sourceDocumentId === dataset.source?.sourceDocumentId
    && candidate.sourceUnitId === dataset.source.sourceUnitId
    && candidate.tier === (word.tier || 'tier-1')
    && candidate.targetOccurrenceId === word.id
    && candidate.targetText === word.text)
}

/**
 * Overlay only explicitly approved companion-sheet contexts. The teacher-owned
 * curriculum source remains unchanged and continues to own targets and order.
 */
export function applyApprovedDictationContexts(dataset: Dataset, catalog: DictationContextCatalog): Dataset {
  const validation = validateDictationContextCatalog(catalog)
  if (!validation.valid) throw new Error(validation.errors.join(' '))
  const enrich = (word: Word) => {
    const context = approvedContextFor(dataset, word, catalog)
    return context ? { ...word, sentence: dictationContextText(context) } : word
  }
  const words = dataset.words.map(enrich)
  const vocabulary = dataset.vocabulary ? {
    tier1: dataset.vocabulary.tier1.map(enrich),
    tier2: dataset.vocabulary.tier2.map(enrich),
    tier3: dataset.vocabulary.tier3.map(enrich),
  } : undefined
  return { ...dataset, words, ...(vocabulary ? { vocabulary } : {}) }
}
