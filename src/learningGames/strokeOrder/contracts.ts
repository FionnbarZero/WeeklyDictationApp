import type { LearningGameAttempt, LearningGameSummary } from '../contracts.ts'

export const STROKE_ORDER_ACTIVITY_IDS = {
  kindergarten: 'stroke-order-kindergarten',
  grade2: 'stroke-order-grade2',
} as const

export type StrokeOrderActivityId = (typeof STROKE_ORDER_ACTIVITY_IDS)[keyof typeof STROKE_ORDER_ACTIVITY_IDS]

export type StrokeOrderGrade = 'Kindergarten' | 'Grade 2'
export type StrokePoint = readonly [x: number, y: number]
export type StrokeDrawing = readonly (readonly StrokePoint[])[]

export type StrokeOrderRound = {
  readonly id: string
  readonly targetId: string
  readonly targetText: string
  readonly meaning: string
  readonly audioText: string
  readonly strokes: readonly (readonly StrokePoint[])[]
  /** Display number for each flattened stroke; resets for every character. */
  readonly strokeLabels: readonly number[]
}

export type StrokeOrderPresentationConfig = {
  readonly activityId: StrokeOrderActivityId
  readonly grade: StrokeOrderGrade
  readonly title: string
  readonly eyebrow: string
  readonly sourceId: string
  readonly sourceLabel: string
  readonly rounds: readonly StrokeOrderRound[]
  readonly unsupportedTargets: readonly string[]
  readonly timing: {
    readonly copySeconds: number
    readonly memorySeconds: number
    readonly correctionSeconds: number
  }
}

export type StrokeOrderActivityProps = StrokeOrderPresentationConfig & {
  readonly playAudio?: (text: string) => void | Promise<void>
  readonly onExit: () => void
  readonly onAttempt?: (attempt: LearningGameAttempt) => void
  readonly onComplete: (summary: LearningGameSummary) => void
}
