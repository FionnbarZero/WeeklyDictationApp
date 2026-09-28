export type AcquisitionTarget = {
  id: string
  text: string
  sentence: string
  datasetId: string
  language?: 'mandarin' | 'english'
  tier?: 'tier-1' | 'tier-2' | 'tier-3'
  activityType?: 'dictation' | 'reading' | 'spelling'
}

export type AcquisitionTargetSet<TTarget extends AcquisitionTarget = AcquisitionTarget> = {
  id: string
  targets: readonly TTarget[]
}

export type AcquisitionSequenceToken = 'established-dt' | 'dt' | 'show-copy' | 'target'
export type AcquisitionPhase = 'introduction' | 'expanded-trials' | 'correction'
export type AcquisitionPromptKind = 'established-dt' | 'earned-dt' | 'show-copy' | 'target'

export type AcquisitionTimerConfig = {
  establishedDtSeconds: number
  earnedDtSeconds: number
  introductionShowCopySeconds: number
  introductionHiddenTargetSeconds: number
  expandedStartSeconds: number
  expandedMinimumSeconds: number
  expandedDecrementSeconds: number
  correctionShowCopySeconds: number
  correctionHiddenSeconds: number
}

export type EngineAcquisitionPrompt<TTarget extends AcquisitionTarget = AcquisitionTarget> = {
  id: string
  kind: AcquisitionPromptKind
  phase: AcquisitionPhase
  word: TTarget
  targetWordId?: string
  scored: boolean
  countsTowardWeeklyScore: boolean
  dtPoolType?: 'established' | 'earned'
  timerSeconds: number
  revealed: boolean
}

export type EngineAcquisitionFlow<TTarget extends AcquisitionTarget = AcquisitionTarget> = {
  datasetId: string
  mode: 'teaching' | 'dt-practice'
  targetIndex: number
  currentTarget: TTarget | null
  phase: AcquisitionPhase
  step: number
  trialNumber: number
  expandedTargetAttempts: number
  earnedDtPool: TTarget[]
  establishedDtBag: TTarget[]
  earnedDtBag: TTarget[]
  lastDtWordId?: string
  consecutiveErrors: Record<string, number>
  correctionRole?: 'current-target' | 'earned-dt'
  resumePosition?: { phase: 'expanded-trials'; step: number; expandedTargetAttempts: number; currentTarget: TTarget; targetIndex: number }
  prompt: EngineAcquisitionPrompt<TTarget> | null
  teachingComplete: boolean
  complete: boolean
}

export type AcquisitionStrategy<TTarget extends AcquisitionTarget = AcquisitionTarget> = {
  readonly id: string
  readonly version: number
  readonly timers: AcquisitionTimerConfig
  readonly dtObservationMode: 'collect' | 'discard'
  readonly establishedDtTargets: readonly TTarget[]
  readonly introductionSequence: readonly AcquisitionSequenceToken[]
  readonly expandedSequence: readonly AcquisitionSequenceToken[]
  readonly correctionSequence: readonly AcquisitionSequenceToken[]
}
