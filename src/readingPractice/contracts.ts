import type { AcquisitionAssessment, AcquisitionTargetSet, EngineAcquisitionFlow } from '../acquisition/contracts.ts'
import type { Tier2ReadingPathway, Tier2ReadingTarget } from '../tier2/contracts.ts'

export type ReadingRecordingStatus = 'idle' | 'requesting' | 'recording' | 'recorded' | 'error'

export type ReadingSpeechSegment = {
  readonly text: string
  readonly language: 'en-GB' | 'zh-CN'
  readonly rate: number
}

export function readingShowCopyInstruction(targetText: string): readonly ReadingSpeechSegment[] {
  return [
    { text: "Let's learn a new one. This word is…", language: 'en-GB', rate: 0.9 },
    { text: targetText, language: 'zh-CN', rate: 0.55 },
    { text: 'Now you say it and record it.', language: 'en-GB', rate: 0.9 },
  ]
}

export type EphemeralAudioClip = {
  readonly url: string
  readonly mimeType: string
  readonly size: number
  dispose: () => void
}

export type ReadingRecorderErrorCode = 'unsupported' | 'permission-denied' | 'device-unavailable' | 'recording-failed'

export class ReadingRecorderError extends Error {
  readonly code: ReadingRecorderErrorCode

  constructor(code: ReadingRecorderErrorCode, message: string) {
    super(message)
    this.name = 'ReadingRecorderError'
    this.code = code
  }
}

export type Tier2ReadingAttempt = {
  readonly promptKind: string
  readonly target: Tier2ReadingTarget
  readonly correct: boolean
  readonly countsTowardScore: boolean
}

export type Tier2ReadingAcquisitionRun = {
  readonly kind: 'acquisition'
  readonly targetSet: AcquisitionTargetSet<Tier2ReadingTarget>
  readonly flow: EngineAcquisitionFlow<Tier2ReadingTarget>
  readonly assessments: AcquisitionAssessment<Tier2ReadingTarget, 'recording-comparison'>[]
}

export type Tier2ReadingQueueRun = {
  readonly kind: 'test-review' | 'mastery'
  readonly queue: Tier2ReadingTarget[]
  readonly index: number
  readonly attempts: Tier2ReadingAttempt[]
}

export type Tier2ReadingRun = Tier2ReadingAcquisitionRun | Tier2ReadingQueueRun

export type Tier2ReadingPracticeSummary = {
  readonly kind: Tier2ReadingPathway['kind']
  readonly attempted: number
  readonly correct: number
  readonly diagnostics: number
}

export const TIER2_READING_PROGRESS_SCHEMA_VERSION = 1 as const
export const TIER2_READING_PROGRESS_CONTRACT_ID = 'tier2-reading-progress-v1' as const

/**
 * Durable reading metadata. Microphone clips are deliberately absent: audio
 * remains prompt-local and is released by the response component.
 */
export type Tier2ReadingProgressRecord = {
  readonly schemaVersion: typeof TIER2_READING_PROGRESS_SCHEMA_VERSION
  readonly contractId: typeof TIER2_READING_PROGRESS_CONTRACT_ID
  readonly id: string
  readonly childId: string
  readonly grade: string
  readonly schoolYear: string
  readonly activityModule: 'mandarin-tier2-reading'
  readonly profileId: string
  readonly profileVersion: number
  readonly pathwayKind: Tier2ReadingPathway['kind']
  readonly reviewCycle?: number
  readonly reviewGroupId?: string
  readonly cohortIds: readonly string[]
  readonly targetOccurrenceIds: readonly string[]
  readonly revision: number
  readonly status: 'in-progress' | 'completed'
  readonly run: Tier2ReadingRun
  readonly summary?: Tier2ReadingPracticeSummary
  readonly startedAt: string
  readonly updatedAt: string
  readonly completedAt?: string
}

export type Tier2ReadingPersistence = {
  readonly sessionId: string
  readonly childId: string
  readonly schoolYear: string
  readonly startedAt: string
  readonly savedProgress?: Tier2ReadingProgressRecord
  readonly onCheckpoint: (progress: Tier2ReadingProgressRecord) => void
}
