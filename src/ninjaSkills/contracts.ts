import type { DatasetSourceMetadata } from '../domain/contracts.ts'

export type LearningModuleId =
  | 'dictation-streak'
  | 'speed-match'
  | 'target-blast'
  | 'memory-flip'
  | 'context-gap-dash'
  | 'sentence-scramble'

export type LearningModuleChoice = {
  readonly id: string
  readonly label: string
  readonly accessibleLabel?: string
}

export type LearningModulePair = {
  readonly id: string
  readonly targetId: string
  readonly left: LearningModuleChoice
  readonly right: LearningModuleChoice
}

export type LearningModuleSelectionRound = {
  readonly id: string
  readonly targetId: string
  readonly targetText: string
  readonly cueText?: string
  readonly audioText?: string
  readonly choices: readonly LearningModuleChoice[]
  readonly correctChoiceId: string
}

export type LearningModuleContextRound = LearningModuleSelectionRound & {
  readonly sentenceBefore: string
  readonly sentenceAfter: string
}

export type LearningModuleSequenceRound = {
  readonly id: string
  readonly targetId: string
  readonly targetText: string
  readonly cueText?: string
  readonly audioText?: string
  readonly tokens: readonly LearningModuleChoice[]
  readonly correctTokenIds: readonly string[]
}

export type LearningModuleProductionRound = {
  readonly id: string
  readonly targetId: string
  readonly targetText: string
  readonly cueText?: string
  readonly audioText?: string
  readonly instruction?: string
  readonly pinyinText?: string
  readonly pinyinSteps?: readonly {
    readonly pinyin: string
    readonly candidates: readonly string[]
  }[]
}

export type LearningModuleAttempt = {
  readonly gameId: LearningModuleId
  readonly promptId: string
  readonly targetId: string
  readonly correct: boolean
  readonly response: string | readonly string[]
  readonly assessmentMode: 'automatic' | 'self-assessment'
}

export type LearningModuleSummary = {
  readonly gameId: LearningModuleId
  readonly attempted: number
  readonly correct: number
  readonly attempts: readonly LearningModuleAttempt[]
}

export type LearningModuleTerm = {
  readonly occurrenceId: string
  readonly datasetId?: string
  readonly text: string
  readonly tier: 'tier-1' | 'tier-2' | 'tier-3'
  readonly meaning?: string
  readonly supplementalVersion?: string
  readonly pinyinText?: string
  readonly pinyinSteps?: readonly {
    readonly pinyin: string
    readonly candidates: readonly string[]
  }[]
  readonly context?: {
    readonly sentence: string
    readonly tokens: readonly string[]
  }
}

export type LearningModuleCohort = {
  readonly id: string
  readonly label: string
  readonly grade: string
  readonly schoolYear: string
  readonly terms: readonly LearningModuleTerm[]
  readonly provenance: readonly {
    readonly datasetId: string
    readonly contentFingerprint: string
    readonly source: DatasetSourceMetadata
  }[]
}

type LearningModulePackBase = {
  readonly moduleId: LearningModuleId
  readonly title: string
  readonly cohort: LearningModuleCohort
  readonly scopeNote?: string
  readonly selection?: {
    readonly policyVersion: string
    readonly visit: number
    readonly available: number
    readonly eligible: number
    readonly included: number
  }
}

export type LearningModulePack =
  | (LearningModulePackBase & {
      readonly moduleId: 'dictation-streak'
      readonly rounds: readonly LearningModuleProductionRound[]
    })
  | (LearningModulePackBase & { readonly moduleId: 'speed-match'; readonly pairs: readonly LearningModulePair[] })
  | (LearningModulePackBase & {
      readonly moduleId: 'target-blast'
      readonly rounds: readonly LearningModuleSelectionRound[]
    })
  | (LearningModulePackBase & { readonly moduleId: 'memory-flip'; readonly pairs: readonly LearningModulePair[] })
  | (LearningModulePackBase & {
      readonly moduleId: 'context-gap-dash'
      readonly rounds: readonly LearningModuleContextRound[]
    })
  | (LearningModulePackBase & {
      readonly moduleId: 'sentence-scramble'
      readonly rounds: readonly LearningModuleSequenceRound[]
    })

export type LearningModuleCapability =
  | { readonly status: 'ready'; readonly pack: LearningModulePack }
  | { readonly status: 'unavailable'; readonly moduleId: LearningModuleId; readonly reason: string }

export type LearningModuleLaunch = {
  readonly kind: 'learning-module'
  readonly pack: LearningModulePack
}

export type PlayLearningModuleAudio = (text: string, language?: string, playbackRate?: number) => void | Promise<void>
