import type { Word } from '../domain/contracts.ts'

export type WarmupCategory = 'acquisition' | 'recent-review' | 'errored-word' | 'random-rotation'

export type ChildWordState = {
  id: string
  childId: string
  wordId: string
  datasetId: string
  category: WarmupCategory
  correctStreak: number
  lastReviewedAt?: string
  lastIncorrectAt?: string
  randomCycleId?: number
  randomCycleReviewed?: boolean
}

export type WarmupSelection = {
  words: Word[]
  randomRotationWordIds: string[]
  recentReviewWordIds: string[]
  erroredWordIds: string[]
  rotationCycleId: number
}

export type WarmupResultEvidence = {
  id: string
  childId: string
  wordId: string
  completedAt: string
  correct: boolean
}

export type WarmupLifecycle = 'acquisition' | 'test-review' | 'future' | 'mastered' | 'no-instruction'

export type WarmupLifecycleSnapshot = {
  masteredDatasetIds: string[]
  masteredAtByDatasetId: Record<string, string>
  lifecycleByDatasetId: Record<string, WarmupLifecycle>
}

export type WarmupPolicy = {
  warmupTargetSize: number
  recentReviewPromotionStreak: number
  erroredWordPromotionStreak: number
}
