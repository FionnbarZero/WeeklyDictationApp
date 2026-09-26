import { candidateContentFingerprint, canonicalDatasetId, schoolYearToken, targetOccurrenceIdFor } from './identity.ts'
import type { ValidationOutcome, VocabularyOccurrenceCandidate, VocabularyTier, WeeklyDatasetCandidate } from './model.ts'

export type CandidateDraft = Omit<WeeklyDatasetCandidate, 'datasetId' | 'contentFingerprint' | 'status' | 'validationOutcomes' | 'tier1' | 'tier2' | 'tier3'> & {
  tier1: Array<string | VocabularyOccurrenceCandidate>
  tier2: Array<string | VocabularyOccurrenceCandidate>
  tier3: Array<string | VocabularyOccurrenceCandidate>
  validationOutcomes?: ValidationOutcome[]
  requestedStatus?: WeeklyDatasetCandidate['status']
}

function normalizeOccurrences(datasetId: string | null, tier: VocabularyTier, values: Array<string | VocabularyOccurrenceCandidate>) {
  return values.map((value, index): VocabularyOccurrenceCandidate => {
    const text = typeof value === 'string' ? value : value.text
    const sourcePosition = typeof value === 'string' ? index + 1 : value.sourcePosition
    return { text, sourcePosition, targetOccurrenceId: datasetId ? targetOccurrenceIdFor(datasetId, tier, sourcePosition) : null }
  })
}

function isIsoDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function isCurrentRole(role: WeeklyDatasetCandidate['instructionalRole']) {
  return role === 'weekly-acquisition' || role === 'current-confirmation'
}

export type CandidateCollisionClassification = 'unrelated' | 'duplicate' | 'confirmation' | 'conflict'

export function classifyCandidateCollision(existing: WeeklyDatasetCandidate, incoming: WeeklyDatasetCandidate): CandidateCollisionClassification {
  if (!existing.datasetId || existing.datasetId !== incoming.datasetId) return 'unrelated'
  if (existing.status !== incoming.status || existing.contentFingerprint !== incoming.contentFingerprint) return 'conflict'
  const previewAndCurrent = (existing.instructionalRole === 'next-week-preview' && isCurrentRole(incoming.instructionalRole)) ||
    (incoming.instructionalRole === 'next-week-preview' && isCurrentRole(existing.instructionalRole))
  return previewAndCurrent ? 'confirmation' : 'duplicate'
}

export function validateWeeklyDatasetCandidate(candidate: WeeklyDatasetCandidate): ValidationOutcome[] {
  const outcomes: ValidationOutcome[] = []
  if (!candidate.grade.trim()) outcomes.push({ code: 'missing_grade', severity: 'error', message: 'The candidate has no grade.' })
  try {
    schoolYearToken(candidate.schoolYear)
  } catch {
    outcomes.push({ code: 'invalid_school_year', severity: 'error', message: 'The candidate school year cannot be normalized.' })
  }
  if (!candidate.source.sourceDocumentId) outcomes.push({ code: 'missing_source_id', severity: 'error', message: 'The source file has no stable identity.' })
  if (!candidate.source.sourceUnitId) outcomes.push({ code: 'missing_source_unit_id', severity: 'error', message: 'The source unit has no stable identity.' })
  if (!candidate.assignedWeek || !candidate.datasetId) outcomes.push({ code: 'invalid_week', severity: 'error', message: 'The source unit has no valid assigned instructional week.' })
  if (candidate.assignedWeek && (!isIsoDate(candidate.assignedWeek.startDate) || !isIsoDate(candidate.assignedWeek.endDate))) outcomes.push({ code: 'invalid_week_date', severity: 'error', message: 'The assigned week must contain real ISO calendar dates.' })
  if (candidate.assignedWeek && isIsoDate(candidate.assignedWeek.startDate) && isIsoDate(candidate.assignedWeek.endDate) && candidate.assignedWeek.endDate < candidate.assignedWeek.startDate) outcomes.push({ code: 'invalid_week_order', severity: 'error', message: 'The assigned week cannot end before it starts.' })
  if (candidate.assignedWeek && candidate.normalizedStartDate !== candidate.assignedWeek.startDate) outcomes.push({ code: 'start_date_mismatch', severity: 'error', message: 'The normalized start date does not match the assigned week.' })
  if (candidate.assignedWeek && candidate.normalizedEndDate !== candidate.assignedWeek.endDate) outcomes.push({ code: 'end_date_mismatch', severity: 'error', message: 'The normalized end date does not match the assigned week.' })
  if (candidate.assignedWeek && candidate.datasetId) {
    try {
      if (candidate.datasetId !== canonicalDatasetId(candidate.grade, candidate.schoolYear, candidate.assignedWeek)) outcomes.push({ code: 'dataset_id_mismatch', severity: 'error', message: 'The dataset ID does not match the canonical grade, school year, and assigned week.' })
    } catch {
      // The invalid school-year outcome above is the actionable error.
    }
  }
  if (candidate.status !== 'no-instruction' && candidate.tier1.length === 0) outcomes.push({ code: 'missing_tier_1', severity: 'error', message: 'The weekly candidate has no Tier 1 vocabulary.' })

  for (const [tier, values] of [['tier-1', candidate.tier1], ['tier-2', candidate.tier2], ['tier-3', candidate.tier3]] as const) {
    const ids = new Set<string>()
    values.forEach((value, index) => {
      if (!value.text.trim()) outcomes.push({ code: 'empty_vocabulary_value', severity: 'error', message: `${tier} item ${index + 1} is empty.` })
      if (value.sourcePosition !== index + 1) outcomes.push({ code: 'invalid_source_position', severity: 'error', message: `${tier} positions must preserve source order.` })
      if (candidate.datasetId && value.targetOccurrenceId !== targetOccurrenceIdFor(candidate.datasetId, tier, index + 1)) outcomes.push({ code: 'invalid_occurrence_id', severity: 'error', message: `${tier} item ${index + 1} has an invalid occurrence identity.` })
      if (value.targetOccurrenceId && ids.has(value.targetOccurrenceId)) outcomes.push({ code: 'duplicate_occurrence_id', severity: 'error', message: `${tier} contains a repeated occurrence identity.` })
      if (value.targetOccurrenceId) ids.add(value.targetOccurrenceId)
    })
  }

  if (candidate.contentFingerprint !== candidateContentFingerprint(candidate)) outcomes.push({ code: 'fingerprint_mismatch', severity: 'error', message: 'The candidate fingerprint does not match its normalized content.' })
  return outcomes
}

export function canonicalizeWeeklyDatasetCandidate(draft: CandidateDraft): WeeklyDatasetCandidate {
  const { requestedStatus = 'valid', validationOutcomes = [], ...candidateDraft } = draft
  let datasetId: string | null = null
  if (candidateDraft.assignedWeek) {
    try {
      datasetId = canonicalDatasetId(candidateDraft.grade, candidateDraft.schoolYear, candidateDraft.assignedWeek)
    } catch {
      // Canonical validation records invalid profile identity without throwing.
    }
  }
  const candidate: WeeklyDatasetCandidate = {
    ...candidateDraft,
    datasetId,
    tier1: normalizeOccurrences(datasetId, 'tier-1', candidateDraft.tier1),
    tier2: normalizeOccurrences(datasetId, 'tier-2', candidateDraft.tier2),
    tier3: normalizeOccurrences(datasetId, 'tier-3', candidateDraft.tier3),
    contentFingerprint: '',
    status: requestedStatus,
    validationOutcomes: [...validationOutcomes],
  }
  candidate.contentFingerprint = candidateContentFingerprint(candidate)
  candidate.validationOutcomes.push(...validateWeeklyDatasetCandidate(candidate))
  if (candidate.validationOutcomes.some((outcome) => outcome.severity === 'error')) candidate.status = 'malformed'
  return candidate
}

export function isCanonicalWeeklyDatasetCandidate(candidate: WeeklyDatasetCandidate) {
  return candidate.status !== 'malformed' && !candidate.validationOutcomes.some((outcome) => outcome.severity === 'error') && validateWeeklyDatasetCandidate(candidate).length === 0
}
