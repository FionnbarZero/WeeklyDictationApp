import { isCanonicalWeeklyDatasetCandidate } from './canonical.ts'
import { candidateContentFingerprint, canonicalDatasetId, targetOccurrenceIdFor } from './identity.ts'
import type { VocabularyOccurrenceCandidate, VocabularyTier, WeeklyDatasetCandidate } from './model.ts'
import type { Dataset, DatasetVocabulary, Word } from '../domain/contracts.ts'

function activityTypeFor(tier: VocabularyTier): NonNullable<Word['activityType']> {
  return tier === 'tier-1' ? 'dictation' : 'reading'
}

function projectTier(candidate: WeeklyDatasetCandidate, tier: VocabularyTier, values: VocabularyOccurrenceCandidate[]) {
  return values.map((value): Word => ({
    id: value.targetOccurrenceId!,
    text: value.text,
    sentence: '',
    datasetId: candidate.datasetId!,
    grade: candidate.grade,
    language: 'mandarin',
    tier,
    activityType: activityTypeFor(tier),
  }))
}

export function datasetFromCanonicalCandidate(candidate: WeeklyDatasetCandidate): Dataset {
  if (!isCanonicalWeeklyDatasetCandidate(candidate) || candidate.status !== 'valid') {
    throw new Error('Only a valid canonical curriculum candidate can become a production dataset.')
  }
  if (!candidate.datasetId || !candidate.assignedWeek || !candidate.dateRangeLabel) {
    throw new Error('The canonical curriculum candidate is missing stable dataset identity or dates.')
  }
  const vocabulary: DatasetVocabulary = {
    tier1: projectTier(candidate, 'tier-1', candidate.tier1),
    tier2: projectTier(candidate, 'tier-2', candidate.tier2),
    tier3: projectTier(candidate, 'tier-3', candidate.tier3),
  }
  return {
    id: candidate.datasetId,
    dateRange: candidate.dateRangeLabel,
    startDate: candidate.assignedWeek.startDate,
    endDate: candidate.assignedWeek.endDate,
    grade: candidate.grade,
    schoolYear: candidate.schoolYear,
    description: `Tier 1 writing targets from ${candidate.dateRangeLabel}`,
    words: vocabulary.tier1,
    importStatus: 'valid',
    isWritingWorkshop: false,
    source: { ...candidate.source },
    contentFingerprint: candidate.contentFingerprint,
    instructionalRole: candidate.instructionalRole,
    vocabulary,
  }
}

function tierIsCanonical(dataset: Dataset, tier: VocabularyTier, words: Word[]) {
  return words.every((word, index) =>
    word.id === targetOccurrenceIdFor(dataset.id, tier, index + 1)
      && word.datasetId === dataset.id
      && word.grade === dataset.grade
      && word.language === 'mandarin'
      && word.tier === tier
      && word.activityType === activityTypeFor(tier)
      && typeof word.text === 'string'
      && word.text.trim().length > 0,
  )
}

function candidateOccurrences(words: Word[]): VocabularyOccurrenceCandidate[] {
  return words.map((word, index) => ({
    text: word.text,
    sourcePosition: index + 1,
    targetOccurrenceId: word.id,
  }))
}

export function isSourceNeutralCanonicalDataset(dataset: Dataset) {
  if (!dataset.source || !dataset.contentFingerprint || !dataset.vocabulary) return false
  if (!dataset.source.sourceDocumentId || !dataset.source.sourceUnitId || !dataset.source.adapterId) return false
  if (dataset.id !== canonicalDatasetId(dataset.grade, dataset.schoolYear, dataset)) return false
  if (dataset.importStatus !== 'valid' || dataset.isWritingWorkshop !== false || dataset.words.length === 0) return false
  if (!tierIsCanonical(dataset, 'tier-1', dataset.vocabulary.tier1)) return false
  if (!tierIsCanonical(dataset, 'tier-2', dataset.vocabulary.tier2)) return false
  if (!tierIsCanonical(dataset, 'tier-3', dataset.vocabulary.tier3)) return false
  if (dataset.words.length !== dataset.vocabulary.tier1.length) return false
  if (dataset.words.some((word, index) => word.id !== dataset.vocabulary!.tier1[index].id || word.text !== dataset.vocabulary!.tier1[index].text)) return false
  return dataset.contentFingerprint === candidateContentFingerprint({
    grade: dataset.grade,
    schoolYear: dataset.schoolYear,
    assignedWeek: { startDate: dataset.startDate, endDate: dataset.endDate },
    tier1: candidateOccurrences(dataset.vocabulary.tier1),
    tier2: candidateOccurrences(dataset.vocabulary.tier2),
    tier3: candidateOccurrences(dataset.vocabulary.tier3),
  })
}
