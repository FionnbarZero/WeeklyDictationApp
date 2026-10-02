import type { ChildWordState, MonthlyRotationScore } from '../domain.ts'
import type { TestReviewCycle } from '../testReview/contracts.ts'

export type FamilyRecord = {
  id: string
  ownerParentId: string
  createdAt: string
  updatedAt: string
}

export type ChildProfile = {
  id: string
  nickname: string
  grade: string
  schoolYear: string
  active: boolean
  gradeEffectiveDate: string
  createdAt: string
  updatedAt: string
}

export type CloudSession = {
  id: string
  childId: string
  familyId: string
  sessionDate: string
  localDate: string
  startedAt: string
  completedAt?: string
  primaryPhase: 'acquisition' | 'test-review'
  datasetId: string
  datasetIds?: string[]
  reviewGroupId?: string
  reviewCycle?: TestReviewCycle
  warmupOnly?: boolean
  status: 'in_progress' | 'partial' | 'completed' | 'skipped' | 'abandoned'
  warmupStatus: 'in_progress' | 'partial' | 'completed' | 'skipped' | 'not_started'
  applicationVersion: string
}

export type CloudAttempt = {
  id: string
  sessionId: string
  wordId: string
  sourceDatasetId: string
  phase: 'warmup' | 'acquisition' | 'test-review'
  reviewCycle?: TestReviewCycle
  correct: boolean
  reviewedAt: string
  completionStatus: 'temporary' | 'complete'
  countsTowardWeeklyScore?: boolean
  acquisitionKind?: string
}

export type CloudAdaptiveState = {
  childId: string
  childWordStates: ChildWordState[]
  monthlyRotationScores: MonthlyRotationScore[]
  rotationCycleId: number
  updatedAt: string
}
