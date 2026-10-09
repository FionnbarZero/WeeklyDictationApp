import { LearningModuleHost, type LearningModuleHostProps } from '../ninjaSkills/LearningModuleHost.tsx'
import { lazy } from 'react'
import type { BetaResult } from './model.ts'

const SavedLearningGame = lazy(() => import('./SavedLearningGame.tsx').then((m) => ({ default: m.SavedLearningGame })))

/** Family persistence stays outside the reusable standalone game modules. */
export function FamilyLearningModuleHost(
  props: LearningModuleHostProps & { onSavedComplete: (result: BetaResult) => void },
) {
  return props.pack.moduleId === 'memory-flip' ||
    props.pack.moduleId === 'sentence-scramble' ||
    props.pack.moduleId === 'context-gap-dash' ? (
    <SavedLearningGame
      pack={props.pack}
      playAudio={props.playAudio}
      onExit={props.onExit}
      onComplete={props.onSavedComplete}
    />
  ) : (
    <LearningModuleHost {...props} />
  )
}
