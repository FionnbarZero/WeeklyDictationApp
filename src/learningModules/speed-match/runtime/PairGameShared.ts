import type { GamePair, LearningGameBaseProps, PlayLearningAudio } from './contracts'

export type PairGameProps = LearningGameBaseProps & {
  readonly pairs: readonly GamePair[]
  readonly playAudio?: PlayLearningAudio
}
