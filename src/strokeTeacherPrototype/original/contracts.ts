export type LearningGameId =
  | 'copy-hide-write-combo'
  | 'stroke-order-slay-kinder'
  | 'stroke-order-slay-grade-2'
  | 'stroke-order-slay-grade-5'

export type LearningGameChannel = 'tier-1-writing' | 'tier-2-reading'
export type LearningGameSkill = 'writing' | 'reading' | 'receptive'
export type LearningGameInputKind = 'pairs' | 'selection' | 'context' | 'sequence' | 'production'

export type LearningGameDefinition = {
  readonly id: LearningGameId
  readonly title: string
  readonly description: string
  readonly activityLabel: string
  readonly channels: readonly LearningGameChannel[]
  readonly skills: readonly LearningGameSkill[]
  readonly inputKind: LearningGameInputKind
  readonly estimatedSeconds: readonly [minimum: number, maximum: number]
}

export type GamePrompt = {
  readonly id: string
  readonly targetId: string
  readonly targetText: string
  readonly cueText?: string
  readonly audioText?: string
}

export type StrokePoint = readonly [x: number, y: number]

export type StrokeOrderGameRound = GamePrompt & {
  readonly meaning: string
  readonly lessonId?: string
  readonly word?: string
  readonly pinyin?: string
  readonly wordCharacterIndex?: number
  readonly wordCharacterCount?: number
  readonly strokes: readonly (readonly StrokePoint[])[]
  readonly strokeDataSource?: {
    readonly provider: 'Hanzi Writer Data'
    readonly version: string
    readonly url: string
  }
}

export type LearningGameAttempt = {
  readonly gameId: LearningGameId
  readonly promptId: string
  readonly targetId: string
  readonly correct: boolean
  readonly response: string | readonly string[]
  readonly assessmentMode: 'automatic' | 'self-assessment'
}

export type LearningGameSummary = {
  readonly gameId: LearningGameId
  readonly attempted: number
  readonly correct: number
  readonly attempts: readonly LearningGameAttempt[]
}

export type LearningGameBaseProps = {
  readonly title?: string
  readonly eyebrow?: string
  readonly onExit: () => void
  readonly onAttempt?: (attempt: LearningGameAttempt) => void
  readonly onComplete: (summary: LearningGameSummary) => void
}

export type PlayLearningAudio = (text: string, language?: string, playbackRate?: number) => void | Promise<void>
