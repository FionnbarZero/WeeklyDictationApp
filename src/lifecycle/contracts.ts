export type PracticePhase = 'warmup' | 'acquisition' | 'test-review'

export type CurriculumStage =
  | { kind: 'future' }
  | { kind: 'acquisition' }
  | { kind: 'test-review'; cycle: number }
  | { kind: 'mastery' }
  | { kind: 'no-instruction' }

export type LifecycleScope = {
  grade: string
  schoolYearKey: string
  currentDateKey: string
}

export type LifecycleSet = {
  datasetId: string
  grade: string
  schoolYearKey: string
  activationDate: string
  instructionalEndDate: string
  kind: 'vocabulary' | 'no-instruction'
}

export type LifecycleProgressionEvent = {
  eventId: string
  grade: string
  schoolYearKey: string
  effectiveDate: string
  introducedDatasetId: string
  confirmedDatasetId?: string
}

export type LifecycleContext = {
  scope: LifecycleScope
  sets: readonly LifecycleSet[]
  progressionEvents: readonly LifecycleProgressionEvent[]
}

export type LifecycleAssignment = {
  datasetId: string
  stage: CurriculumStage
  enteredStageOn?: string
}

export type LifecycleReviewAssignment = {
  datasetId: string
  cycle: number
}

export type LifecycleResolution = {
  scope: LifecycleScope
  acquisitionDatasetId: string | null
  testReviews: LifecycleReviewAssignment[]
  masteryDatasetIds: string[]
  masteredAtByDatasetId: Record<string, string>
  futureDatasetIds: string[]
  noInstructionDatasetIds: string[]
  assignmentByDatasetId: Record<string, LifecycleAssignment>
}

export type LifecycleStrategy = {
  profileId: string
  version: number
  grade: string
  schoolYearKey: string
  resolve: (context: LifecycleContext) => LifecycleResolution
}
