import { LearningModuleHost, type LearningModuleHostProps } from '../ninjaSkills/LearningModuleHost.tsx'
import { lazy } from 'react'
import type { BetaResult } from './model.ts'
import { regressionPreview } from '../regressionPreview/policy.ts'

const SavedLearningGame = lazy(() => import('./SavedLearningGame.tsx').then((m) => ({ default: m.SavedLearningGame })))

/** Family persistence stays outside the reusable standalone game modules. */
export function FamilyLearningModuleHost(
  props: LearningModuleHostProps & { onSavedComplete: (result: BetaResult) => void },
) {
  // Games are session-only in this prototype. Completed results still go
  // through the existing validated onComplete handler; old records are intact.
  if (regressionPreview) return <LearningModuleHost {...props} />
  return props.pack.moduleId === 'memory-flip' ||
    props.pack.moduleId === 'sentence-scramble' ||
    props.pack.moduleId === 'context-gap-dash' ||
    props.pack.moduleId === 'target-blast' ||
    props.pack.moduleId === 'dictation-streak' ||
    props.pack.moduleId === 'speed-match' ? (
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
