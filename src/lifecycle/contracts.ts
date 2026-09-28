export type PracticePhase = 'warmup' | 'acquisition' | 'test-review'

export type CurriculumStage =
  | { kind: 'future' }
  | { kind: 'acquisition' }
  | { kind: 'test-review'; cycle: number }
  | { kind: 'mastery' }
  | { kind: 'no-instruction' }

export type LifecycleScope = {
  grade: string
  schoolYear: string
  currentDateKey: string
}

export type LifecycleSet = {
  datasetId: string
  grade: string
  schoolYear: string
  activationDate: string
  instructionalEndDate: string
  kind: 'vocabulary' | 'no-instruction'
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
  id: string
  grade: string
  resolve: (scope: LifecycleScope, sets: readonly LifecycleSet[]) => LifecycleResolution
}
