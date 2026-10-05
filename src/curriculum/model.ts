export type CurriculumSourceType = 'google-slides' | 'google-sheets'
export type VocabularyTier = 'tier-1' | 'tier-2' | 'tier-3'
export type InstructionalRole = 'weekly-acquisition' | 'current-confirmation' | 'next-week-preview' | 'unassigned'
export type CandidateStatus = 'valid' | 'no-instruction' | 'malformed'

export type ValidationOutcome = {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
}

export type SourceMetadata = {
  sourceType: CurriculumSourceType
  sourceDocumentId: string
  sourceUnitId: string
  adapterId: string
}

export type VocabularyOccurrenceCandidate = {
  text: string
  sourcePosition: number
  targetOccurrenceId: string | null
  learningModule?: import('../domain/contracts.ts').AuthoritativeLearningModuleMetadata
}

export type WeeklyDatasetCandidate = {
  datasetId: string | null
  grade: string
  schoolYear: string
  rawDate: string | null
  dateRangeLabel: string | null
  normalizedStartDate: string | null
  normalizedEndDate: string | null
  assignedWeek: { startDate: string; endDate: string } | null
  source: SourceMetadata
  sourceSectionLabel: string | null
  instructionalRole: InstructionalRole
  tier1: VocabularyOccurrenceCandidate[]
  tier2: VocabularyOccurrenceCandidate[]
  tier3: VocabularyOccurrenceCandidate[]
  contentFingerprint: string
  status: CandidateStatus
  validationOutcomes: ValidationOutcome[]
  noInstructionReason?: string
}

export type SlideSourceUnit = {
  objectId?: string
  pageObjectId?: string
  pageElements?: unknown[]
  text?: string
  speakerNotes?: string
}

export type SlidesPresentationPayload = {
  sourceType: 'google-slides'
  presentationId?: string
  slides?: SlideSourceUnit[]
}

export type SheetSourceUnit = {
  sheetId?: string | number
  title?: string
  values?: unknown[][]
}

export type SheetsWorkbookPayload = {
  sourceType: 'google-sheets'
  spreadsheetId?: string
  sheets?: SheetSourceUnit[]
}

export type CurriculumSourcePayload = SlidesPresentationPayload | SheetsWorkbookPayload

export type CurriculumSourceIssue = {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  source?: SourceMetadata
  datasetId?: string
}

export type CurriculumProgressionEvidence = {
  evidenceId: string
  kind: 'cohort-progression'
  grade: string
  schoolYearKey: string
  effectiveDate: string
  introducedDatasetId: string
  confirmedDatasetId?: string
  source: SourceMetadata
}

export type CurriculumResource = {
  resourceId: string
  kind: 'book-link'
  datasetId: string
  relationship: 'acquisition' | 'review' | 'support'
  title: string
  url: string
  source: SourceMetadata
}

export type CurriculumImportResult<
  Issue extends CurriculumSourceIssue = CurriculumSourceIssue,
  ProgressionEvidence extends CurriculumProgressionEvidence = CurriculumProgressionEvidence,
  Resource extends CurriculumResource = CurriculumResource,
> = {
  candidates: WeeklyDatasetCandidate[]
  issues: Issue[]
  progressionEvidence: ProgressionEvidence[]
  resources: Resource[]
}

export interface SourceAdapter<Payload extends CurriculumSourcePayload = CurriculumSourcePayload> {
  readonly id: string
  readonly version: number
  readonly sourceType: Payload['sourceType']
  readonly grade: string
  readonly schoolYear: string
  extract(payload: Payload): CurriculumImportResult
  /** Compatibility view for callers that consume only canonical candidates. */
  adapt(payload: Payload): WeeklyDatasetCandidate[]
}
