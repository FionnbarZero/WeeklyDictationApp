import { candidateContentFingerprint } from '../curriculum/identity.ts'
import type { WeeklyDatasetCandidate } from '../curriculum/model.ts'
import type { Dataset } from '../domain/contracts.ts'
import { grade5ReadingReviewPreview } from './policy.ts'
import reviewed from './source.json' with { type: 'json' }

export { grade5ReadingReviewPreview } from './policy.ts'
export const READING_REVIEW_ID = 'grade-5__2026-27__recognition-2026-11-06-v1'
export const READING_REVIEW_ADAPTER = 'grade5-owner-reading-review-nov6-v1'

/** A separately reviewed reading assessment, not a weekly writing import.
 * The ordinary canonical importer still requires Tier 1. Never manufacture
 * writing targets or change the teacher's baseline to satisfy that contract. */
export function grade5ReadingReviewSource() {
  const rows = reviewed.targets
  if (
    rows.length !== 50 ||
    new Set(rows.map((row) => row.text)).size !== 50 ||
    rows.some(
      (row) =>
        !/^\p{Script=Han}{1,4}$/u.test(row.text) ||
        !row.pinyin.trim() ||
        !row.meaning.trim() ||
        row.page < 1 ||
        row.page > 3,
    )
  )
    throw new Error('The reviewed Grade 5 recognition list is incomplete.')
  const candidate: WeeklyDatasetCandidate = {
    datasetId: READING_REVIEW_ID,
    grade: 'Grade 5',
    schoolYear: '2026–2027',
    rawDate: '11/2–6',
    dateRangeLabel: 'November 2–6 · Cumulative reading review',
    normalizedStartDate: reviewed.studyStart,
    normalizedEndDate: reviewed.assessmentEnd,
    assignedWeek: { startDate: reviewed.studyStart, endDate: reviewed.assessmentEnd },
    source: {
      sourceType: 'owner-assessment',
      sourceDocumentId: reviewed.documentId,
      sourceUnitId: 'pages-1-3',
      adapterId: READING_REVIEW_ADAPTER,
    },
    sourceSectionLabel: reviewed.title,
    instructionalRole: 'current-confirmation',
    tier1: [],
    tier2: rows.map((row, index) => ({
      text: row.text,
      sourcePosition: index + 1,
      targetOccurrenceId: `${READING_REVIEW_ID}-tier-2-${index + 1}`,
      learningModule: { meaning: row.meaning, pinyinText: row.pinyin },
    })),
    tier3: [],
    contentFingerprint: '',
    status: 'valid',
    validationOutcomes: [
      {
        code: 'owner_reviewed_reading_only',
        severity: 'info',
        message:
          'All 50 words, Pinyin and meanings transcribed from pages 1–3; reading only. Preparation opens October 26 for the November 2–6 assessment.',
      },
    ],
  }
  candidate.contentFingerprint = candidateContentFingerprint(candidate)
  const reading = candidate.tier2.map((word) => ({
    id: word.targetOccurrenceId!,
    text: word.text,
    sentence: '',
    datasetId: READING_REVIEW_ID,
    grade: 'Grade 5',
    language: 'mandarin' as const,
    tier: 'tier-2' as const,
    activityType: 'reading' as const,
    learningModule: { ...word.learningModule! },
  }))
  const dataset: Dataset = {
    id: READING_REVIEW_ID,
    dateRange: candidate.dateRangeLabel!,
    startDate: reviewed.studyStart,
    endDate: reviewed.assessmentEnd,
    grade: candidate.grade,
    schoolYear: candidate.schoolYear,
    description: '50 cumulative recognition words; writing coming soon.',
    words: [],
    source: { ...candidate.source },
    contentFingerprint: candidate.contentFingerprint,
    instructionalRole: candidate.instructionalRole,
    vocabulary: { tier1: [], tier2: reading, tier3: [] },
  }
  return { candidate, dataset }
}

export function isGrade5ReadingReview(dataset?: Dataset): dataset is Dataset {
  return Boolean(
    dataset &&
      dataset.id === READING_REVIEW_ID &&
      dataset.grade === 'Grade 5' &&
      dataset.source?.sourceType === 'owner-assessment' &&
      dataset.source.sourceDocumentId === '1TFZKSM5B8zJsO470_acttS1OrnHftpoS' &&
      dataset.source.adapterId === READING_REVIEW_ADAPTER,
  )
}

/** The owner opened review now, while retaining the printed assessment dates. */
export function preferredReadingReviewWeek(datasets: readonly Dataset[], today: string, requested = '') {
  return grade5ReadingReviewPreview &&
    !requested &&
    today >= '2026-10-26' &&
    today <= '2026-11-06' &&
    datasets.some(isGrade5ReadingReview)
    ? '2026-10-26'
    : undefined
}
