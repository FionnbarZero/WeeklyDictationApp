import type { VocabularyOccurrenceCandidate, VocabularyTier, WeeklyDatasetCandidate } from './model.ts'

export function schoolYearToken(schoolYear: string) {
  const years = [...schoolYear.matchAll(/20\d{2}/g)].map((match) => Number(match[0]))
  if (years.length >= 2) return `${years[0]}-${String(years[1]).slice(-2)}`
  if (years.length === 1) return `${years[0]}-${String(years[0] + 1).slice(-2)}`
  throw new Error(`School year cannot be normalized: ${schoolYear}`)
}

export function canonicalDatasetId(grade: string, schoolYear: string, range: { startDate: string; endDate: string }) {
  return `${grade.toLowerCase().replace(/[^a-z0-9]+/g, '-')}__${schoolYearToken(schoolYear)}__${range.startDate}__${range.endDate}`
}

export function targetOccurrenceIdFor(datasetId: string, tier: VocabularyTier, sourcePosition: number) {
  if (!Number.isInteger(sourcePosition) || sourcePosition < 1) throw new Error('Vocabulary source positions must be positive integers.')
  // Grade 2 Tier 1 IDs already exist in local and cloud records. Keep that
  // format while making every ordered occurrence—duplicates included—unique.
  return tier === 'tier-1' ? `${datasetId}-${sourcePosition}` : `${datasetId}-${tier}-${sourcePosition}`
}

function orderedTierContent(values: VocabularyOccurrenceCandidate[]) {
  return values.map(({ text, sourcePosition }) => ({ text, sourcePosition }))
}

function stableHash(value: string) {
  let hash = 0xcbf29ce484222325n
  for (const character of value) {
    hash ^= BigInt(character.codePointAt(0) || 0)
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return hash.toString(16).padStart(16, '0')
}

export function candidateContentFingerprint(candidate: Pick<WeeklyDatasetCandidate,
  'grade' | 'schoolYear' | 'assignedWeek' | 'instructionalRole' | 'tier1' | 'tier2' | 'tier3' | 'noInstructionReason'
>) {
  const canonicalContent = JSON.stringify({
    version: 1,
    grade: candidate.grade,
    schoolYear: schoolYearToken(candidate.schoolYear),
    assignedWeek: candidate.assignedWeek,
    instructionalRole: candidate.instructionalRole,
    tier1: orderedTierContent(candidate.tier1),
    tier2: orderedTierContent(candidate.tier2),
    tier3: orderedTierContent(candidate.tier3),
    noInstructionReason: candidate.noInstructionReason || null,
  })
  return `v1-fnv1a64-${stableHash(canonicalContent)}`
}
