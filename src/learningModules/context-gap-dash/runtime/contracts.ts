import type { ReactNode } from 'react'

export type LearningGameId = 'context-gap-dash'

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

export type GameChoice = {
  readonly id: string
  readonly label: string
  readonly accessibleLabel?: string
}

export type GamePair = {
  readonly id: string
  readonly targetId: string
  readonly left: GameChoice
  readonly right: GameChoice
}

export type GamePrompt = {
  readonly id: string
  readonly targetId: string
  readonly targetText: string
  readonly cueText?: string
  readonly audioText?: string
}

export type SelectionGameRound = GamePrompt & {
  readonly choices: readonly GameChoice[]
  readonly correctChoiceId: string
}

export type ContextGameRound = SelectionGameRound & {
  readonly sentenceBefore: string
  readonly sentenceAfter: string
}

export type SequenceToken = GameChoice

export type SequenceGameRound = GamePrompt & {
  readonly tokens: readonly SequenceToken[]
  readonly correctTokenIds: readonly string[]
}

export type ProductionGameRound = GamePrompt & {
  readonly instruction?: string
}

export type StrokePoint = readonly [x: number, y: number]

export type StrokeOrderGameRound = GamePrompt & {
  readonly meaning: string
  readonly strokes: readonly (readonly StrokePoint[])[]
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

export type ReadingCaptureControls = {
  readonly onReady: () => void
}

export type RenderReadingCapture = (
  round: ProductionGameRound,
  controls: ReadingCaptureControls,
) => ReactNode

export type ReadingResponseControls = {
  readonly onAssess: (correct: boolean, response?: string) => void
  readonly index: number
  readonly total: number
}

export type RenderReadingResponse = (
  round: ProductionGameRound,
  controls: ReadingResponseControls,
) => ReactNode
