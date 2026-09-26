import { DEFAULT_GRADE, DEFAULT_SCHOOL_YEAR, DECK_REGISTRY, GRADE2_DECK_ID, GRADE5_DECK_ID } from './config.ts'
import {
  candidateFromSlide as candidateFromSlideWithProfile,
  candidatesFromPresentation as candidatesFromPresentationWithProfile,
  classifyWritingWorkshop as classifyWritingWorkshopWithProfile,
  dateRangeFromText as dateRangeFromTextWithProfile,
  extractTier1 as extractTier1WithProfile,
  slidesSourceAdapterFor,
  type PresentationLike as SlidesPresentationLike,
  type SlideLike as SlidesSlideLike,
  type SlidesParserProfile,
} from './curriculum/adapters/googleSlides.ts'
import { classifyWeeklyDatasetCandidates, type CandidateClassificationDecision, type ExistingDatasetReference } from './curriculum/classification.ts'
import { canonicalDatasetId, targetOccurrenceIdFor } from './curriculum/identity.ts'
import type { CandidateStatus, InstructionalRole, WeeklyDatasetCandidate } from './curriculum/model.ts'
import type { Dataset, Word } from './domain.ts'

export type { ExistingDatasetReference } from './curriculum/classification.ts'

export type ParserProfile = SlidesParserProfile

const weeklyHeading = /\bweek(?:\s+\d+(?=\s*\())?\s*(?:\(\s*)?(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[-–]\s*(?:(\d{1,2})\s*[/.\-]\s*)?(\d{1,2})(?:\s*\))?/i
const tierStops = [
  /tier\s*2\s*[:：]/i, /tier\s*3\s*[:：]/i, /coming\s+next\s+week/i, /core\s+vocab/i,
  /sentence\s+frames?\s*[:：]?/i, /writing\s+(?:project|workshop|ideas?)/i, /example\s+(?:sentences?|writing)/i,
  /\bELA\b/i, /\bMath\b/i, /\bScience\b/i, /\bSocial\s+Studies?\b/i,
]
const termSeparators = /[、,，;；\n]+/
const workshopMarkers = [/writing\s+project/i, /writing\s+workshop/i, /writers['’]?\s*workshop/i, /biography/i, /sample\s+writing/i, /no\s+(?:new\s+)?tier\s*1/i, /no\s+dictation/i, /homework\s+instructions/i, /mastery\s+warm\s*up/i]

export const grade2DeckProfile: ParserProfile = {
  id: 'grade-2-2026-27-weekly-focus', version: 1, sourceAdapterId: 'grade-2-google-slides', grade: DEFAULT_GRADE, schoolYear: DEFAULT_SCHOOL_YEAR, sourceDeckId: GRADE2_DECK_ID,
  weeklyHeading, tier1Heading: /tier\s*1\s*[:：]/i, tierStops, termSeparators, workshopMarkers,
}

export const grade5DeckProfile: ParserProfile = {
  id: 'grade-5-2026-27-weekly-focus', version: 0, sourceAdapterId: 'grade-5-google-slides-placeholder', grade: 'Grade 5', schoolYear: DEFAULT_SCHOOL_YEAR, sourceDeckId: GRADE5_DECK_ID,
  weeklyHeading, tier1Heading: /tier\s*1\s*[:：]/i, tierStops, termSeparators, workshopMarkers,
}

export const parserProfiles = [grade2DeckProfile, grade5DeckProfile] as const

export type SlideLike = SlidesSlideLike
export type PresentationLike = SlidesPresentationLike
export type ImportOutcome = { status: 'imported' | 'duplicate' | 'confirmation' | 'conflict' | 'writing-workshop' | 'error'; dataset?: Dataset; message: string; sourceDeckId?: string; sourceSlideId?: string; datasetId?: string; contentFingerprint?: string; candidateStatus?: CandidateStatus; instructionalRole?: InstructionalRole; refreshExistingMetadata?: boolean }
export type ImportBatchOutcome = {
  status: 'ok' | 'error'
  outcomes: ImportOutcome[]
  datasets: Dataset[]
  summary: { datasetCount: number; slideIds: string[]; dateRanges: string[]; wordCounts: number[] }
  message: string
}

function normalizedDataset(dataset: Dataset) {
  const { importedAt: _importedAt, words, ...metadata } = dataset
  return {
    ...metadata,
    words: [...words].sort((a, b) => a.id.localeCompare(b.id)),
  }
}

export function normalizeImportBatchForComparison(batch: ImportBatchOutcome) {
  const datasets = batch.datasets.map(normalizedDataset).sort((a, b) => a.id.localeCompare(b.id))
  const outcomes = batch.outcomes.map((outcome) => ({
    status: outcome.status,
    message: outcome.message,
    datasetId: outcome.datasetId || outcome.dataset?.id,
    sourceDeckId: outcome.dataset?.sourceDeckId,
    sourceSlideId: outcome.sourceSlideId || outcome.dataset?.sourceSlideId,
    isWritingWorkshop: outcome.dataset?.isWritingWorkshop,
  })).sort((a, b) => `${a.datasetId || ''}:${a.sourceSlideId || ''}:${a.status}`.localeCompare(`${b.datasetId || ''}:${b.sourceSlideId || ''}:${b.status}`))
  const summary = datasets.map((dataset) => ({ id: dataset.id, sourceSlideId: dataset.sourceSlideId, dateRange: dataset.dateRange, wordCount: dataset.words.length }))
  return { status: batch.status, message: batch.message, datasets, outcomes, summary }
}

export function importLogIdFor(outcome: ImportOutcome) {
  return `import-${outcome.datasetId || 'none'}-${outcome.sourceSlideId || 'unknown'}-${outcome.status}`.replace(/[^a-zA-Z0-9_-]/g, '-')
}

export function isDuplicateOnlyBatch(batch: ImportBatchOutcome) {
  return batch.outcomes.length > 0 && batch.outcomes.every((outcome) => outcome.status === 'duplicate')
}

function outcomeWithoutDataset(outcome: ImportOutcome, status: ImportOutcome['status'], message: string): ImportOutcome {
  const { dataset: _dataset, refreshExistingMetadata: _refreshExistingMetadata, ...metadata } = outcome
  return { ...metadata, status, message }
}

function outcomeForDecision(outcome: ImportOutcome, decision: CandidateClassificationDecision): ImportOutcome {
  if (decision.status === 'selected' || decision.status === 'malformed') return outcome
  if (decision.reason === 'same-week-conflict') return outcomeWithoutDataset(outcome, 'conflict', 'Different normalized vocabulary was found for the same instructional week; neither new version may be imported automatically.')
  if (decision.reason === 'existing-conflict') return outcomeWithoutDataset(outcome, 'conflict', 'The existing dataset and current source contain different normalized content for the same instructional week; the previous valid dataset was preserved.')
  if (decision.reason === 'same-week-confirmation') return outcomeWithoutDataset(outcome, 'confirmation', 'The preview and authoritative current section describe the same instructional-week content.')
  if (decision.reason === 'same-week-duplicate') return outcomeWithoutDataset(outcome, 'duplicate', 'The same normalized vocabulary already exists for this instructional week; no duplicate import was created.')
  if (decision.reason === 'existing-confirmation-current') return { ...outcome, status: 'confirmation', refreshExistingMetadata: true, message: 'The stored preview was confirmed by the authoritative current section; canonical source metadata will be refreshed without rewriting vocabulary.' }
  if (decision.reason === 'existing-confirmation-preview') return { ...outcome, status: 'confirmation', message: 'The preview matches the stored authoritative current section; the current source remains authoritative.' }
  return { ...outcome, status: 'duplicate', message: 'The stable dataset ID already exists with no detected content conflict; no duplicate import was created.' }
}

export { slideText } from './curriculum/adapters/googleSlides.ts'

export function dateRangeFromText(text: string, profile = grade2DeckProfile) {
  return dateRangeFromTextWithProfile(text, profile)
}

export function extractTier1(text: string, profile = grade2DeckProfile) {
  return extractTier1WithProfile(text, profile)
}

export function classifyWritingWorkshop(text: string, profile = grade2DeckProfile) {
  return classifyWritingWorkshopWithProfile(text, profile)
}

// Tier 1 context is generated by a separate authorized service. The deck parser
// must never infer it from Sentence Frame, example-writing, or slide prose.

export function datasetIdFor(profile: ParserProfile, range: { startDate: string; endDate: string }) { return canonicalDatasetId(profile.grade, profile.schoolYear, range) }

export function wordIdFor(profile: ParserProfile, range: { startDate: string; endDate: string }, wordNumber: number) {
  if (!Number.isInteger(wordNumber) || wordNumber < 1) throw new Error('Word numbers must be positive integers.')
  return targetOccurrenceIdFor(datasetIdFor(profile, range), 'tier-1', wordNumber)
}

export function candidateFromSlide(slide: SlideLike, profile = grade2DeckProfile, sourceDocumentId = profile.sourceDeckId): WeeklyDatasetCandidate {
  return candidateFromSlideWithProfile(slide, profile, sourceDocumentId)
}

export function candidatesFromPresentation(presentation: PresentationLike, profile = grade2DeckProfile) {
  return candidatesFromPresentationWithProfile(presentation, profile)
}

export { slidesSourceAdapterFor }
export const grade2SlidesSourceAdapter = slidesSourceAdapterFor(grade2DeckProfile)

export function importOutcomeFromCandidate(candidate: WeeklyDatasetCandidate, profile: ParserProfile): ImportOutcome {
  const sourceSlideId = candidate.source.sourceUnitId || undefined
  const candidateMetadata = { contentFingerprint: candidate.contentFingerprint, candidateStatus: candidate.status, instructionalRole: candidate.instructionalRole }
  if (!sourceSlideId) return { status: 'error', sourceDeckId: profile.sourceDeckId, message: 'The slide has no stable source slide ID; it cannot be imported safely.' }
  if (!candidate.assignedWeek || !candidate.dateRangeLabel || !candidate.datasetId) return { status: 'error', sourceDeckId: profile.sourceDeckId, message: 'The slide has no recognizable, valid Week/date-range heading.', sourceSlideId }
  const range = { ...candidate.assignedWeek, dateRange: candidate.dateRangeLabel }
  const datasetId = candidate.datasetId
  if (candidate.status === 'no-instruction') {
    const marker = candidate.noInstructionReason?.replace(/^writing-workshop:/, '') || 'explicit no-instruction marker'
    return { status: 'writing-workshop', sourceDeckId: profile.sourceDeckId, message: `Writing-workshop marker detected: ${marker}.`, sourceSlideId, datasetId, dataset: datasetFor(profile, range, sourceSlideId, [], true), ...candidateMetadata }
  }
  if (candidate.status === 'malformed' || !candidate.tier1.length) {
    const validationError = candidate.validationOutcomes.find((item) => item.severity === 'error')
    const message = candidate.validationOutcomes.some((item) => item.code === 'missing_tier_1')
      ? 'The slide has a weekly heading but no confident Tier 1 vocabulary section.'
      : `Canonical validation failed${validationError ? ` (${validationError.code}): ${validationError.message}` : '.'}`
    return { status: 'error', sourceDeckId: profile.sourceDeckId, message, sourceSlideId, datasetId }
  }
  const words: Word[] = candidate.tier1.map((term) => ({ id: term.targetOccurrenceId!, text: term.text, sentence: '', datasetId, grade: profile.grade, sourceSlideId, language: 'mandarin', tier: 'tier-1', activityType: 'dictation' }))
  return { status: 'imported', sourceDeckId: profile.sourceDeckId, message: `Extracted ${words.length} Tier 1 target${words.length === 1 ? '' : 's'}.`, sourceSlideId, datasetId, dataset: datasetFor(profile, range, sourceSlideId, words), ...candidateMetadata }
}

export function profileForDataset(dataset: Pick<Dataset, 'grade' | 'schoolYear' | 'sourceDeckId'>) {
  return parserProfiles.find((profile) => profile.grade === dataset.grade && profile.schoolYear === dataset.schoolYear && profile.sourceDeckId === dataset.sourceDeckId) || null
}

export function profileForDeckId(sourceDeckId: string) {
  return parserProfiles.find((profile) => profile.sourceDeckId === sourceDeckId && DECK_REGISTRY.some((entry) => entry.active && entry.sourceType === 'google-slides' && entry.sourceDocumentId === sourceDeckId && entry.parserProfileId === profile.id)) || null
}

export function isCanonicalDataset(dataset: Dataset) {
  const profile = profileForDataset(dataset)
  if (!profile || dataset.id !== datasetIdFor(profile, dataset)) return false
  if (dataset.sourceDeckId !== profile.sourceDeckId || !dataset.sourceSlideId || (dataset.importStatus !== 'valid' && dataset.importStatus !== 'writing-workshop') || typeof dataset.isWritingWorkshop !== 'boolean') return false
  if ((dataset.importStatus === 'writing-workshop') !== dataset.isWritingWorkshop) return false
  if (dataset.isWritingWorkshop ? dataset.words.length !== 0 : dataset.words.length === 0) return false
  return dataset.words.every((word, index) => word.id === wordIdFor(profile, dataset, index + 1) && word.datasetId === dataset.id && word.grade === profile.grade && word.sourceSlideId === dataset.sourceSlideId && word.language === 'mandarin' && word.tier === 'tier-1' && word.activityType === 'dictation')
}

function datasetFor(profile: ParserProfile, range: { startDate: string; endDate: string; dateRange: string }, sourceSlideId: string | undefined, words: Word[], workshop = false): Dataset {
  const datasetId = datasetIdFor(profile, range)
  return {
    id: datasetId, dateRange: range.dateRange, startDate: range.startDate, endDate: range.endDate, grade: profile.grade, schoolYear: profile.schoolYear,
    description: workshop ? `Writing workshop from ${range.dateRange}` : `Tier 1 words from ${range.dateRange}`,
    sourceDeckId: profile.sourceDeckId, sourceSlideId, importStatus: workshop ? 'writing-workshop' : 'valid', isWritingWorkshop: workshop,
    importedAt: new Date().toISOString(), words,
  }
}

export function parseSlide(slide: SlideLike, profile = grade2DeckProfile): ImportOutcome {
  return importOutcomeFromCandidate(candidateFromSlide(slide, profile), profile)
}

export function validateAndClassifyPresentation(presentation: PresentationLike, existingDatasetReferences: ExistingDatasetReference[] = [], profile = grade2DeckProfile): ImportBatchOutcome {
  if (presentation.presentationId !== profile.sourceDeckId) {
    return { status: 'error', outcomes: [{ status: 'error', sourceDeckId: profile.sourceDeckId, message: `The inspected presentation ID does not match the configured ${profile.grade} deck.`, sourceSlideId: presentation.presentationId }], datasets: [], summary: { datasetCount: 0, slideIds: [], dateRanges: [], wordCounts: [] }, message: 'No Firestore write may occur because the source deck identity is not validated.' }
  }
  const adapter = slidesSourceAdapterFor(profile)
  const candidates = adapter.adapt({ sourceType: 'google-slides', ...presentation })
  const baseOutcomes = candidates.map((candidate) => importOutcomeFromCandidate(candidate, profile))
  const classification = classifyWeeklyDatasetCandidates(candidates, existingDatasetReferences)
  const outcomes = classification.decisions.map((decision, index) => outcomeForDecision(baseOutcomes[index], decision))
  const datasets = classification.decisions.flatMap((decision, index) => decision.status === 'selected' && baseOutcomes[index].dataset ? [baseOutcomes[index].dataset!] : [])
  datasets.sort((a, b) => a.startDate.localeCompare(b.startDate))
  const summary = { datasetCount: datasets.length, slideIds: datasets.map((dataset) => dataset.sourceSlideId || ''), dateRanges: datasets.map((dataset) => dataset.dateRange), wordCounts: datasets.map((dataset) => dataset.words.length) }
  const hasAttentionIssue = outcomes.some((item) => item.status === 'error' || item.status === 'conflict')
  const confirmationCount = outcomes.filter((item) => item.status === 'confirmation').length
  const duplicateOnly = outcomes.length > 0 && outcomes.every((item) => item.status === 'duplicate')
  const batchIsSuccessful = datasets.length > 0 || confirmationCount > 0 || duplicateOnly
  const message = datasets.length
    ? hasAttentionIssue
      ? `Validated ${datasets.length} weekly dataset${datasets.length === 1 ? '' : 's'}; malformed or conflicting source units were skipped.`
      : `Validated ${datasets.length} weekly dataset${datasets.length === 1 ? '' : 's'}; malformed slides were skipped.`
    : confirmationCount
      ? `Confirmed ${confirmationCount} existing weekly dataset source${confirmationCount === 1 ? '' : 's'}; no vocabulary was rewritten.`
      : duplicateOnly
        ? 'The inspected weekly datasets are already current; no new vocabulary was written.'
    : 'No valid weekly datasets were found; nothing may be written.'
  return { status: batchIsSuccessful ? 'ok' : 'error', outcomes, datasets, summary, message }
}

export function importWeeklyDatasets(presentation: PresentationLike, existingDatasetReferences: ExistingDatasetReference[] = [], profile = grade2DeckProfile) {
  return validateAndClassifyPresentation(presentation, existingDatasetReferences, profile)
}

export function dryRunSummary(batch: ImportBatchOutcome) {
  return { status: batch.status, message: batch.message, datasets: batch.datasets.map((dataset) => ({ id: dataset.id, slideId: dataset.sourceSlideId, dateRange: dataset.dateRange, wordCount: dataset.words.length, importStatus: dataset.importStatus })), skipped: batch.outcomes.filter((outcome) => outcome.status === 'error' || outcome.status === 'conflict').map((outcome) => ({ slideId: outcome.sourceSlideId, message: outcome.message })) }
}

export function importLatestWeeklyDataset(presentation: PresentationLike, existingDatasetReferences: ExistingDatasetReference[] = [], profile = grade2DeckProfile): ImportOutcome {
  const batch = validateAndClassifyPresentation(presentation, existingDatasetReferences, profile)
  const candidates = batch.outcomes.filter((outcome) => outcome.dataset && (outcome.status === 'imported' || outcome.status === 'writing-workshop' || outcome.status === 'duplicate' || outcome.status === 'confirmation')).sort((a, b) => (b.dataset?.startDate || '').localeCompare(a.dataset?.startDate || ''))
  return candidates[0] || { status: 'error', message: batch.message }
}
