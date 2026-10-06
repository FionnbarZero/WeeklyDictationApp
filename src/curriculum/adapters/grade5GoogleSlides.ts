import { DEFAULT_SCHOOL_YEAR, GRADE5_DECK_ID } from '../../config.ts'
import { canonicalizeWeeklyDatasetCandidate } from '../canonical.ts'
import {
  classifyWeeklyDatasetCandidates,
  type CandidateClassificationBatch,
} from '../classification.ts'
import { schoolYearToken } from '../identity.ts'
import type {
  CurriculumImportResult,
  CurriculumProgressionEvidence,
  CurriculumResource,
  CurriculumSourceIssue,
  SlidesPresentationPayload,
  SourceAdapter,
  ValidationOutcome,
  WeeklyDatasetCandidate,
} from '../model.ts'
import {
  dateRangeFromText,
  slideText,
  type SlideLike,
  type SlidesParserProfile,
} from './googleSlides.ts'

export type Grade5SlidesSourceProfile = SlidesParserProfile & {
  baselineStartDate: string
  minimumTier1Count: number
  maximumTier1Count: number
}

const weeklyHeading = /\bweek(?:\s+\d+(?=\s*\())?\s*(?:\(\s*)?(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[-–]\s*(?:(\d{1,2})\s*[/.-]\s*)?(\d{1,2})(?:\s*\))?/i

export const grade5SlidesSourceProfile: Grade5SlidesSourceProfile = {
  id: 'grade-5-2026-27-weekly-focus',
  version: 1,
  sourceAdapterId: 'grade-5-google-slides-v1',
  grade: 'Grade 5',
  schoolYear: DEFAULT_SCHOOL_YEAR,
  sourceDeckId: GRADE5_DECK_ID,
  weeklyHeading,
  tier1Heading: /tier\s*1\s*[:：]/i,
  tierStops: [/tier\s*2\s*[:：]/i, /tier\s*3\s*[:：]/i],
  termSeparators: /[、,，;；\n]+/,
  workshopMarkers: [],
  baselineStartDate: '2026-08-31',
  minimumTier1Count: 3,
  maximumTier1Count: 10,
}

type VocabularySections = {
  tier1: string[]
  tier2: string[]
  tier3: string[]
}

type ParsedGrade5SourceUnit = {
  candidate: WeeklyDatasetCandidate
  confirmation: VocabularySections
  acquisitionBook: Grade5BookLink | null
  confirmationBook: Grade5BookLink | null
}

type Grade5BookLink = {
  title: string
  url: string
}

export type Grade5BookResource = Grade5BookLink & {
  resourceId: string
  kind: 'book-link'
  datasetId: string
  relationship: 'acquisition' | 'review'
  source: CurriculumResource['source']
}

export type Grade5SourceIssue = CurriculumSourceIssue & {
  code:
    | 'source_identity_mismatch'
    | 'missing_source_unit_id'
    | 'invalid_week'
    | 'pre_baseline_source_unit'
    | 'missing_mandarin_table'
    | 'missing_acquisition_section_marker'
    | 'missing_confirmation_section_marker'
    | 'grade5_tier1_count_out_of_range'
    | 'duplicate_source_unit'
    | 'same_week_conflict'
    | 'missing_activation_baseline'
    | 'missing_confirmation_vocabulary'
    | 'confirmation_mismatch'
    | 'progression_chain_blocked'
    | 'unchanged_cohort'
  severity: 'info' | 'warning' | 'error'
  message: string
  sourceUnitId?: string
  datasetId?: string
}

export type Grade5SourceExtraction = {
  classification: CandidateClassificationBatch
} & CurriculumImportResult<Grade5SourceIssue, CurriculumProgressionEvidence, Grade5BookResource>

function textFromUnknown(value: unknown): string {
  // Slides responses also contain style strings (font families, alignment,
  // units, URLs). Only actual text/content fields belong in the vocabulary.
  if (typeof value === 'string') return ''
  if (!value || typeof value !== 'object') return ''
  if (Array.isArray(value)) return value.map(textFromUnknown).filter(Boolean).join('')
  const record = value as Record<string, unknown>
  if (typeof record.content === 'string') return record.content
  if (typeof record.text === 'string') return record.text
  return Object.values(record).map(textFromUnknown).filter(Boolean).join('')
}

function tablesFromSlide(slide: SlideLike) {
  if (!Array.isArray(slide.pageElements)) return [] as Array<{ rawRows: unknown[]; textRows: string[][] }>
  return slide.pageElements.flatMap((element) => {
    if (!element || typeof element !== 'object') return []
    const table = (element as Record<string, unknown>).table
    if (!table || typeof table !== 'object') return []
    const rows = (table as Record<string, unknown>).tableRows
    if (!Array.isArray(rows)) return []
    return [{ rawRows: rows, textRows: rows.map((row) => {
      if (!row || typeof row !== 'object') return []
      const cells = (row as Record<string, unknown>).tableCells
      if (!Array.isArray(cells)) return []
      return cells.map((cell) => textFromUnknown(cell).trim())
    }) }]
  })
}

function mandarinTable(slide: SlideLike) {
  return tablesFromSlide(slide).find(({ textRows }) => /\bMandarin\b/i.test(textRows[0]?.join('\n') || '')) || null
}

function linkedBookFromUnknown(value: unknown): Grade5BookLink | null {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    for (const child of value) {
      const linkedBook = linkedBookFromUnknown(child)
      if (linkedBook) return linkedBook
    }
    return null
  }
  const record = value as Record<string, unknown>
  const textRun = record.textRun
  if (textRun && typeof textRun === 'object') {
    const run = textRun as Record<string, unknown>
    const style = run.style
    const link = style && typeof style === 'object' ? (style as Record<string, unknown>).link : null
    const url = link && typeof link === 'object' ? (link as Record<string, unknown>).url : null
    const content = typeof run.content === 'string' ? run.content : ''
    if (typeof url === 'string' && /^https:\/\//.test(url)) {
      const title = content.match(/《[^》]+》/)?.[0] || content.trim()
      if (title) return { title, url }
    }
  }
  for (const child of Object.values(record)) {
    const linkedBook = linkedBookFromUnknown(child)
    if (linkedBook) return linkedBook
  }
  return null
}

function cleanVocabularyValue(value: string) {
  return value.replace(/^[\s“”".。:：]+|[\s“”".。:：]+$/g, '').replace(/\s+/g, '').trim()
}

function tierValues(text: string, tier: 1 | 2 | 3) {
  const headings = [...text.matchAll(/tier\s*([123])\s*[:：]/gi)]
  const headingIndex = headings.findIndex((heading) => Number(heading[1]) === tier)
  if (headingIndex < 0) return []
  const heading = headings[headingIndex]
  const start = (heading.index || 0) + heading[0].length
  const end = headings[headingIndex + 1]?.index ?? text.length
  return text.slice(start, end)
    .split(/[、,，;；\n]+/)
    .map(cleanVocabularyValue)
    .filter(Boolean)
}

function vocabularySections(text: string): VocabularySections {
  return {
    tier1: tierValues(text, 1),
    tier2: tierValues(text, 2),
    tier3: tierValues(text, 3),
  }
}

function sameVocabulary(left: VocabularySections, right: VocabularySections) {
  return (['tier1', 'tier2', 'tier3'] as const).every((tier) =>
    left[tier].length === right[tier].length && left[tier].every((value, index) => value === right[tier][index]))
}

function candidateVocabulary(candidate: WeeklyDatasetCandidate): VocabularySections {
  return {
    tier1: candidate.tier1.map((item) => item.text),
    tier2: candidate.tier2.map((item) => item.text),
    tier3: candidate.tier3.map((item) => item.text),
  }
}

function progressionEvidenceId(candidate: WeeklyDatasetCandidate) {
  return `${candidate.datasetId}__progression__${candidate.source.sourceUnitId}`.replace(/[^a-zA-Z0-9_-]/g, '-')
}

function resourceId(datasetId: string, relationship: Grade5BookResource['relationship'], sourceUnitId: string) {
  return `${datasetId}__${relationship}__book__${sourceUnitId}`.replace(/[^a-zA-Z0-9_-]/g, '-')
}

function issueForCandidate(
  candidate: WeeklyDatasetCandidate,
  code: Grade5SourceIssue['code'],
  severity: Grade5SourceIssue['severity'],
  message: string,
): Grade5SourceIssue {
  return {
    code,
    severity,
    message,
    sourceUnitId: candidate.source.sourceUnitId,
    ...(candidate.datasetId ? { datasetId: candidate.datasetId } : {}),
  }
}

function parseGrade5SourceUnit(
  slide: SlideLike,
  sourceDocumentId: string,
  profile: Grade5SlidesSourceProfile,
): { parsed?: ParsedGrade5SourceUnit; issues: Grade5SourceIssue[] } {
  const sourceUnitId = slide.objectId || slide.pageObjectId || ''
  const fullText = slideText(slide)
  const range = dateRangeFromText(fullText, profile)
  const issues: Grade5SourceIssue[] = []

  if (!sourceUnitId) {
    issues.push({ code: 'missing_source_unit_id', severity: 'error', message: 'The Grade 5 slide has no stable source unit ID.' })
    return { issues }
  }
  if (!range) {
    issues.push({ code: 'invalid_week', severity: 'warning', message: 'The Grade 5 slide has no approved instructional date range and remains a source issue.', sourceUnitId })
    return { issues }
  }
  if (range.startDate < profile.baselineStartDate) {
    issues.push({
      code: 'pre_baseline_source_unit',
      severity: 'info',
      message: `The Grade 5 slide predates the ${profile.baselineStartDate} activation baseline and is retained only as source provenance.`,
      sourceUnitId,
    })
    return { issues }
  }

  const table = mandarinTable(slide)
  const rows = table?.textRows || null
  const topText = rows?.[1]?.join('\n') || ''
  const bottomText = rows?.slice(2).flat().join('\n') || ''
  const confirmation = vocabularySections(topText)
  const acquisition = vocabularySections(bottomText)
  const confirmationBook = linkedBookFromUnknown(table?.rawRows[1])
  const acquisitionBook = linkedBookFromUnknown(table?.rawRows.slice(2))
  const validationOutcomes: ValidationOutcome[] = []

  if (sourceDocumentId !== profile.sourceDeckId) {
    validationOutcomes.push({ code: 'source_identity_mismatch', severity: 'error', message: 'The source identity does not match the configured Grade 5 deck.' })
    issues.push({ code: 'source_identity_mismatch', severity: 'error', message: 'The source identity does not match the configured Grade 5 deck.', sourceUnitId })
  }
  if (!rows) {
    validationOutcomes.push({ code: 'missing_mandarin_table', severity: 'error', message: 'The slide has no structurally identifiable Mandarin table.' })
    issues.push({ code: 'missing_mandarin_table', severity: 'error', message: 'The slide has no structurally identifiable Mandarin table.', sourceUnitId })
  }
  if (rows && !/\bthis\s+week\b/i.test(topText)) {
    validationOutcomes.push({ code: 'missing_confirmation_section_marker', severity: 'error', message: 'The Mandarin table has no top This week section.' })
    issues.push({ code: 'missing_confirmation_section_marker', severity: 'error', message: 'The Mandarin table has no top This week section.', sourceUnitId })
  }
  if (rows && !/(?:coming\s+next\s+week|core\s+vocab)/i.test(bottomText)) {
    validationOutcomes.push({ code: 'missing_acquisition_section_marker', severity: 'error', message: 'The Mandarin table has no bottom Coming next week/Core vocab section.' })
    issues.push({ code: 'missing_acquisition_section_marker', severity: 'error', message: 'The Mandarin table has no bottom Coming next week/Core vocab section.', sourceUnitId })
  }
  if (acquisition.tier1.length < profile.minimumTier1Count || acquisition.tier1.length > profile.maximumTier1Count) {
    const message = `Grade 5 Tier 1 requires ${profile.minimumTier1Count}–${profile.maximumTier1Count} ordered targets; this source unit contains ${acquisition.tier1.length}.`
    validationOutcomes.push({ code: 'grade5_tier1_count_out_of_range', severity: 'error', message })
    issues.push({ code: 'grade5_tier1_count_out_of_range', severity: 'error', message, sourceUnitId })
  }

  const candidate = canonicalizeWeeklyDatasetCandidate({
    grade: profile.grade,
    schoolYear: profile.schoolYear,
    rawDate: fullText.match(profile.weeklyHeading)?.[0] || null,
    dateRangeLabel: range.dateRange,
    normalizedStartDate: range.startDate,
    normalizedEndDate: range.endDate,
    assignedWeek: { startDate: range.startDate, endDate: range.endDate },
    source: {
      sourceType: 'google-slides',
      sourceDocumentId,
      sourceUnitId,
      adapterId: profile.sourceAdapterId,
    },
    sourceSectionLabel: 'Mandarin/Coming next week/Core vocab',
    instructionalRole: 'weekly-acquisition',
    tier1: acquisition.tier1,
    tier2: acquisition.tier2,
    tier3: acquisition.tier3,
    requestedStatus: 'valid',
    validationOutcomes,
  })

  return { parsed: { candidate, confirmation, acquisitionBook, confirmationBook }, issues }
}

function bookResourcesFor(
  progressionEvidence: CurriculumProgressionEvidence[],
  selectedCandidates: WeeklyDatasetCandidate[],
  parsedBySourceUnitId: Map<string, ParsedGrade5SourceUnit>,
) {
  const selectedByDatasetId = new Map(selectedCandidates.map((candidate) => [candidate.datasetId, candidate]))
  const resources: Grade5BookResource[] = []
  for (const evidence of progressionEvidence) {
    const introducedCandidate = selectedByDatasetId.get(evidence.introducedDatasetId)
    const parsed = introducedCandidate
      ? parsedBySourceUnitId.get(introducedCandidate.source.sourceUnitId)
      : undefined
    if (introducedCandidate && parsed?.acquisitionBook) {
      resources.push({
        ...parsed.acquisitionBook,
        resourceId: resourceId(evidence.introducedDatasetId, 'acquisition', introducedCandidate.source.sourceUnitId),
        kind: 'book-link',
        datasetId: evidence.introducedDatasetId,
        relationship: 'acquisition',
        source: introducedCandidate.source,
      })
    }
    if (evidence.confirmedDatasetId && introducedCandidate && parsed?.confirmationBook) {
      resources.push({
        ...parsed.confirmationBook,
        resourceId: resourceId(evidence.confirmedDatasetId, 'review', introducedCandidate.source.sourceUnitId),
        kind: 'book-link',
        datasetId: evidence.confirmedDatasetId,
        relationship: 'review',
        source: introducedCandidate.source,
      })
    }
  }
  return resources
}

function progressionEvidenceFor(
  selectedCandidates: WeeklyDatasetCandidate[],
  parsedBySourceUnitId: Map<string, ParsedGrade5SourceUnit>,
  profile: Grade5SlidesSourceProfile,
) {
  const evidence: CurriculumProgressionEvidence[] = []
  const issues: Grade5SourceIssue[] = []
  const ordered = [...selectedCandidates].sort((left, right) =>
    (left.assignedWeek?.startDate || '').localeCompare(right.assignedWeek?.startDate || ''))
  const baselineIndex = ordered.findIndex((candidate) => candidate.assignedWeek?.startDate === profile.baselineStartDate)

  if (baselineIndex < 0) {
    issues.push({
      code: 'missing_activation_baseline',
      severity: 'error',
      message: `No valid Grade 5 candidate establishes the approved ${profile.baselineStartDate} activation baseline.`,
    })
    return { evidence, issues }
  }

  const baseline = ordered[baselineIndex]
  evidence.push({
    evidenceId: progressionEvidenceId(baseline),
    kind: 'cohort-progression',
    grade: profile.grade,
    schoolYearKey: schoolYearToken(profile.schoolYear),
    effectiveDate: baseline.assignedWeek!.startDate,
    introducedDatasetId: baseline.datasetId!,
    source: baseline.source,
  })

  let previousAccepted = baseline
  let chainBlocked = false
  for (const candidate of ordered.slice(baselineIndex + 1)) {
    const parsed = parsedBySourceUnitId.get(candidate.source.sourceUnitId)
    const previousSource = parsedBySourceUnitId.get(previousAccepted.source.sourceUnitId)
    if (parsed && previousSource && sameVocabulary(candidateVocabulary(candidate), candidateVocabulary(previousAccepted))
      && sameVocabulary(parsed.confirmation, previousSource.confirmation)) {
      issues.push(issueForCandidate(candidate, 'unchanged_cohort', 'info', 'This teacher update repeats the same current and upcoming vocabulary. Existing assignments stay active without an extra progression event.'))
      continue
    }
    if (chainBlocked) {
      issues.push(issueForCandidate(candidate, 'progression_chain_blocked', 'error', 'This cohort remains pending because an earlier Grade 5 source conflict has not been resolved.'))
      continue
    }
    if (!parsed?.confirmation.tier1.length) {
      issues.push(issueForCandidate(candidate, 'missing_confirmation_vocabulary', 'error', 'The top This week section does not confirm the previously accepted Grade 5 cohort.'))
      chainBlocked = true
      continue
    }
    if (!sameVocabulary(parsed.confirmation, candidateVocabulary(previousAccepted))) {
      issues.push(issueForCandidate(candidate, 'confirmation_mismatch', 'error', 'The top This week vocabulary differs from the previously accepted bottom-row cohort. Existing lifecycle assignments are preserved and the new cohort remains pending.'))
      chainBlocked = true
      continue
    }
    evidence.push({
      evidenceId: progressionEvidenceId(candidate),
      kind: 'cohort-progression',
      grade: profile.grade,
      schoolYearKey: schoolYearToken(profile.schoolYear),
      effectiveDate: candidate.assignedWeek!.startDate,
      introducedDatasetId: candidate.datasetId!,
      confirmedDatasetId: previousAccepted.datasetId!,
      source: candidate.source,
    })
    previousAccepted = candidate
  }
  return { evidence, issues }
}

export function extractGrade5Presentation(
  payload: SlidesPresentationPayload,
  profile: Grade5SlidesSourceProfile = grade5SlidesSourceProfile,
): Grade5SourceExtraction {
  const issues: Grade5SourceIssue[] = []
  const parsedUnits = (payload.slides || []).flatMap((slide) => {
    const result = parseGrade5SourceUnit(slide, payload.presentationId || '', profile)
    issues.push(...result.issues)
    return result.parsed ? [result.parsed] : []
  })
  const candidates = parsedUnits.map(({ candidate }) => candidate)
  const classification = classifyWeeklyDatasetCandidates(candidates)
  const issueKeys = new Set(issues.map((issue) => `${issue.code}:${issue.sourceUnitId || ''}:${issue.datasetId || ''}`))

  for (const decision of classification.decisions) {
    const issue = decision.status === 'duplicate'
      ? issueForCandidate(decision.candidate, 'duplicate_source_unit', 'info', 'An identical Grade 5 cohort already appears for this instructional week; it does not create another progression event.')
      : decision.status === 'conflict'
        ? issueForCandidate(decision.candidate, 'same_week_conflict', 'error', 'Different Grade 5 vocabulary appears for the same instructional week; no version advances automatically.')
        : null
    if (!issue) continue
    const key = `${issue.code}:${issue.sourceUnitId || ''}:${issue.datasetId || ''}`
    if (!issueKeys.has(key)) {
      issues.push(issue)
      issueKeys.add(key)
    }
  }

  const parsedBySourceUnitId = new Map(parsedUnits.map((parsed) => [parsed.candidate.source.sourceUnitId, parsed]))
  const progression = progressionEvidenceFor(classification.selectedCandidates, parsedBySourceUnitId, profile)
  issues.push(...progression.issues)
  const resources = bookResourcesFor(
    progression.evidence,
    classification.selectedCandidates,
    parsedBySourceUnitId,
  )

  return {
    candidates,
    classification,
    progressionEvidence: progression.evidence,
    resources,
    issues,
  }
}

export const grade5SlidesSourceAdapter: SourceAdapter<SlidesPresentationPayload> = {
  id: grade5SlidesSourceProfile.sourceAdapterId,
  version: grade5SlidesSourceProfile.version,
  sourceType: 'google-slides',
  grade: grade5SlidesSourceProfile.grade,
  schoolYear: grade5SlidesSourceProfile.schoolYear,
  extract: extractGrade5Presentation,
  adapt(payload) {
    return this.extract(payload).candidates
  },
}
