export const GRADE5_ASSESSMENT_SOURCE_ID = '1Nw8bUxSQzyQt7QFj7d-zj_0ngh2Yzi3i'
export const GRADE5_ASSESSMENT_ADAPTER_ID = 'grade5-approved-pdf-page2-v1'

export function isGrade5AssessmentSource(source?: {
  sourceType: string
  sourceDocumentId: string
  sourceUnitId: string
  adapterId: string
}) {
  return (
    source?.sourceType === 'owner-assessment' &&
    source.sourceDocumentId === GRADE5_ASSESSMENT_SOURCE_ID &&
    source.sourceUnitId === 'page-2' &&
    source.adapterId === GRADE5_ASSESSMENT_ADAPTER_ID
  )
}

export function isGrade5AssessmentCandidate(candidate: import('../curriculum/model.ts').WeeklyDatasetCandidate) {
  return (
    candidate.grade === 'Grade 5' &&
    isGrade5AssessmentSource(candidate.source) &&
    candidate.assignedWeek?.startDate === '2026-10-19' &&
    candidate.assignedWeek.endDate === '2026-10-23'
  )
}
