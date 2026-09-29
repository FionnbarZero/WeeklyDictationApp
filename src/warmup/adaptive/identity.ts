import type {
  MasteryActivityModule,
  MasteryIdentityTuple,
  MasteryLanguage,
  MasteryNormalizerVersion,
  MasteryOccurrence,
  MasteryTermDefinition,
  MasteryVocabularyTier,
} from './contracts.ts'

export const MASTERY_NORMALIZER_VERSION: MasteryNormalizerVersion = 'mastery-normalizer-v1'

export type MasteryTermIdFactory = (identity: MasteryIdentityTuple) => string

export type MasteryOccurrenceInput = {
  occurrenceId: string
  wordId?: string
  datasetId: string
  grade: string
  schoolYear: string
  text: string
  activityModule: MasteryActivityModule
  tier: MasteryVocabularyTier
  language: MasteryLanguage
}

export type UpsertMasteryOccurrenceResult =
  | { status: 'created' | 'added' | 'unchanged'; term: MasteryTermDefinition }
  | { status: 'collision'; code: 'mastery-id-collision' | 'occurrence-identity-mismatch'; message: string }

export function normalizeMasteryTermV1(value: string) {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ')
}

function canonicalIdentityValue(identity: MasteryIdentityTuple) {
  return JSON.stringify([
    identity.normalizerVersion,
    identity.activityModule,
    identity.tier,
    identity.language,
    identity.normalizedTerm,
  ])
}

function fnv1a32(bytes: Uint8Array, seed: number) {
  let hash = seed >>> 0
  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function pathSafeDigest(value: string) {
  const bytes = new TextEncoder().encode(value)
  return `${fnv1a32(bytes, 0x811c9dc5)}${fnv1a32(bytes, 0x9e3779b9)}${fnv1a32(bytes, 0x85ebca6b)}`
}

export function deterministicMasteryTermId(identity: MasteryIdentityTuple) {
  return `mastery-v1-${pathSafeDigest(canonicalIdentityValue(identity))}`
}

export function createMasteryIdentity(input: {
  activityModule: MasteryActivityModule
  tier: MasteryVocabularyTier
  language: MasteryLanguage
  text: string
}) : MasteryIdentityTuple {
  const normalizedTerm = normalizeMasteryTermV1(input.text)
  if (!input.activityModule.trim()) throw new Error('A mastery activity module is required.')
  if (!normalizedTerm) throw new Error('A mastery term cannot be empty after normalization.')
  return {
    normalizerVersion: MASTERY_NORMALIZER_VERSION,
    activityModule: input.activityModule,
    tier: input.tier,
    language: input.language,
    normalizedTerm,
  }
}

export function masteryIdentitiesEqual(left: MasteryIdentityTuple, right: MasteryIdentityTuple) {
  return canonicalIdentityValue(left) === canonicalIdentityValue(right)
}

export function validateMasteryTermIdentity(term: Pick<MasteryTermDefinition, 'id' | 'identity'>, idFactory: MasteryTermIdFactory = deterministicMasteryTermId) {
  return term.id === idFactory(term.identity)
}

export function createMasteryOccurrence(input: MasteryOccurrenceInput, idFactory: MasteryTermIdFactory = deterministicMasteryTermId): MasteryOccurrence {
  if (!input.occurrenceId || !input.datasetId || !input.grade || !input.schoolYear) throw new Error('Mastery occurrence provenance is incomplete.')
  const identity = createMasteryIdentity(input)
  return {
    occurrenceId: input.occurrenceId,
    wordId: input.wordId || input.occurrenceId,
    datasetId: input.datasetId,
    grade: input.grade,
    schoolYear: input.schoolYear,
    displayText: input.text,
    identity,
    masteryTermId: idFactory(identity),
  }
}

function immutableOccurrenceValue(occurrence: MasteryOccurrence) {
  return JSON.stringify([
    occurrence.occurrenceId,
    occurrence.wordId,
    occurrence.datasetId,
    occurrence.grade,
    occurrence.schoolYear,
    occurrence.displayText,
    canonicalIdentityValue(occurrence.identity),
    occurrence.masteryTermId,
  ])
}

export function masteryOccurrencesEqual(left: MasteryOccurrence, right: MasteryOccurrence) {
  return immutableOccurrenceValue(left) === immutableOccurrenceValue(right)
}

export function upsertMasteryOccurrence(existing: MasteryTermDefinition | undefined, occurrence: MasteryOccurrence): UpsertMasteryOccurrenceResult {
  if (!existing) {
    return {
      status: 'created',
      term: { id: occurrence.masteryTermId, identity: occurrence.identity, occurrences: [occurrence] },
    }
  }
  if (existing.id !== occurrence.masteryTermId || !masteryIdentitiesEqual(existing.identity, occurrence.identity)) {
    return { status: 'collision', code: 'mastery-id-collision', message: `Mastery term ${occurrence.masteryTermId} resolves to a conflicting identity tuple.` }
  }
  const occurrenceIndex = existing.occurrences.findIndex((candidate) => candidate.occurrenceId === occurrence.occurrenceId)
  if (occurrenceIndex < 0) {
    return { status: 'added', term: { ...existing, occurrences: [...existing.occurrences, occurrence] } }
  }
  const current = existing.occurrences[occurrenceIndex]
  if (!masteryOccurrencesEqual(current, occurrence)) {
    return { status: 'collision', code: 'occurrence-identity-mismatch', message: `Occurrence ${occurrence.occurrenceId} was reused with conflicting provenance or identity.` }
  }
  return { status: 'unchanged', term: existing }
}

export function childMasteryStateId(childId: string, masteryTermId: string) {
  return `child-mastery-v1-${pathSafeDigest(JSON.stringify([childId, masteryTermId]))}`
}

export function masteryRotationStateId(childId: string, activityModule: MasteryActivityModule) {
  return `rotation-v1-${pathSafeDigest(JSON.stringify([childId, activityModule]))}`
}
