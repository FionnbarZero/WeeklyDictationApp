import { LearningModuleHost, type LearningModuleHostProps } from '../ninjaSkills/LearningModuleHost.tsx'
import { lazy } from 'react'
import type { BetaResult } from './model.ts'

const SavedMemoryGame = lazy(() => import('./SavedMemoryGame.tsx').then((m) => ({ default: m.SavedMemoryGame })))

/** Family persistence stays outside the reusable standalone game modules. */
export function FamilyLearningModuleHost(
  props: LearningModuleHostProps & { onSavedComplete: (result: BetaResult) => void },
) {
  return props.pack.moduleId === 'memory-flip' ? (
    <SavedMemoryGame
      pack={props.pack}
      playAudio={props.playAudio}
      onExit={props.onExit}
      onComplete={props.onSavedComplete}
    />
  ) : (
    <LearningModuleHost {...props} />
  )
}
