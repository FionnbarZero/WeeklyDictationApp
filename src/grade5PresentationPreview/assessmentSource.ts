import { GRADE5_DECK_ID } from '../config.ts'
import { extractGrade5Presentation, type Grade5SourceExtraction } from '../curriculum/adapters/grade5GoogleSlides.ts'
import { canonicalizeWeeklyDatasetCandidate } from '../curriculum/canonical.ts'
import { classifyWeeklyDatasetCandidates } from '../curriculum/classification.ts'
import type { OwnerAssessmentPayload, SlidesPresentationPayload } from '../curriculum/model.ts'
import { TARGETS } from './assessmentData.ts'
import { GRADE5_ASSESSMENT_ADAPTER_ID, GRADE5_ASSESSMENT_SOURCE_ID } from './sourceIdentity.ts'

export { GRADE5_ASSESSMENT_SOURCE_ID, isGrade5AssessmentCandidate } from './sourceIdentity.ts'

export const GRADE5_ASSESSMENT_ID = 'grade5-oct23-2026-page2-v1'

/** Explicit owner-approved PDF curriculum, retaining the original Slides bytes.
 * It is never represented as a teacher edit to the connected presentation. */
export function buildGrade5AssessmentPayload(baseline: SlidesPresentationPayload): OwnerAssessmentPayload {
  const payload: OwnerAssessmentPayload = {
    sourceType: 'owner-assessment',
    assessmentId: GRADE5_ASSESSMENT_ID,
    documentId: GRADE5_ASSESSMENT_SOURCE_ID,
    page: 2,
    startDate: '2026-10-19',
    endDate: '2026-10-23',
    targets: TARGETS.map((target) => ({ ...target, tokens: [...target.tokens] })),
    baseline: structuredClone(baseline),
  }
  assertGrade5Assessment(payload)
  return payload
}

function assertGrade5Assessment(payload: OwnerAssessmentPayload) {
  if (
    !payload ||
    payload.sourceType !== 'owner-assessment' ||
    payload.assessmentId !== GRADE5_ASSESSMENT_ID ||
    payload.documentId !== GRADE5_ASSESSMENT_SOURCE_ID ||
    payload.page !== 2 ||
    payload.startDate !== '2026-10-19' ||
    payload.endDate !== '2026-10-23' ||
    payload.baseline?.sourceType !== 'google-slides' ||
    payload.baseline.presentationId !== GRADE5_DECK_ID ||
    !Array.isArray(payload.baseline.slides) ||
    !Array.isArray(payload.targets) ||
    payload.targets.length !== TARGETS.length
  )
    throw new Error('The approved Grade 5 PDF assessment source identity is invalid.')
  for (const [index, expected] of TARGETS.entries()) {
    const actual = payload.targets[index]
    if (
      !actual ||
      actual.key !== expected.key ||
      actual.text !== expected.text ||
      actual.pinyin !== expected.pinyin ||
      actual.meaning !== expected.meaning ||
      actual.sentence !== expected.sentence ||
      !Array.isArray(actual.tokens) ||
      actual.tokens.length !== expected.tokens.length ||
      actual.tokens.some((token, position) => token !== expected.tokens[position])
    )
      throw new Error('The Grade 5 assessment differs from the approved page 2 targets.')
  }
}

export function extractGrade5Assessment(payload: OwnerAssessmentPayload): Grade5SourceExtraction {
  assertGrade5Assessment(payload)
  const baseline = extractGrade5Presentation(payload.baseline)
  if (!baseline.classification.selectedCandidates.some((candidate) => candidate.status === 'valid'))
    throw new Error('The Grade 5 assessment must retain a valid original curriculum baseline.')
  const candidate = canonicalizeWeeklyDatasetCandidate({
    grade: 'Grade 5',
    schoolYear: '2026–2027',
    rawDate: '10/19–10/23',
    dateRangeLabel: 'October 19–23 · shared reading and writing targets',
    normalizedStartDate: payload.startDate,
    normalizedEndDate: payload.endDate,
    assignedWeek: { startDate: payload.startDate, endDate: payload.endDate },
    source: {
      sourceType: 'owner-assessment',
      sourceDocumentId: payload.documentId,
      sourceUnitId: 'page-2',
      adapterId: GRADE5_ASSESSMENT_ADAPTER_ID,
    },
    sourceSectionLabel: '10/23 Chinese Dictation to Review',
    instructionalRole: 'weekly-acquisition',
    tier1: payload.targets.map((target) => target.text),
    tier2: payload.targets.map((target) => target.text),
    tier3: [],
  })
  for (const tier of [candidate.tier1, candidate.tier2]) {
    tier.forEach((occurrence, index) => {
      const target = payload.targets[index]
      occurrence.learningModule = {
        meaning: target.meaning,
        pinyinText: target.pinyin,
        context: { sentence: target.sentence, tokens: [...target.tokens] },
      }
    })
  }
  // The approved PDF owns this one week in the isolated preview. The untouched
  // baseline remains in the payload, and every other historical week is retained.
  const candidates = [...baseline.candidates.filter((prior) => prior.datasetId !== candidate.datasetId), candidate]
  const progressionEvidence = baseline.progressionEvidence.filter(
    (event) => event.introducedDatasetId !== candidate.datasetId,
  )
  const previous = [...progressionEvidence]
    .filter((event) => event.effectiveDate < payload.startDate)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0]
  progressionEvidence.push({
    evidenceId: `${GRADE5_ASSESSMENT_ID}:activation`,
    kind: 'cohort-progression',
    grade: 'Grade 5',
    schoolYearKey: '2026-27',
    effectiveDate: payload.startDate,
    introducedDatasetId: candidate.datasetId!,
    ...(previous ? { confirmedDatasetId: previous.introducedDatasetId } : {}),
    source: candidate.source,
  })
  return {
    candidates,
    classification: classifyWeeklyDatasetCandidates(candidates),
    issues: baseline.issues.filter((issue) => issue.datasetId !== candidate.datasetId),
    progressionEvidence,
    resources: baseline.resources.filter((resource) => resource.datasetId !== candidate.datasetId),
  }
}
