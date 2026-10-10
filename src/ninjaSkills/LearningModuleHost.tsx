import { lazy, Suspense } from 'react'
import './surface.css'
import type {
  LearningModuleAttempt,
  LearningModulePack,
  LearningModuleSummary,
  PlayLearningModuleAudio,
} from './contracts.ts'

const DictationStreak = lazy(() =>
  import('../learningModules/dictation-streak/Game.tsx').then((module) => ({ default: module.DictationStreak })),
)
const SpeedMatch = lazy(() =>
  import('../learningModules/speed-match/Game.tsx').then((module) => ({ default: module.SpeedMatch })),
)
const TargetBlast = lazy(() =>
  import('../learningModules/target-blast/Game.tsx').then((module) => ({ default: module.TargetBlast })),
)
const MemoryLanterns = lazy(() =>
  import('../learningModules/memory-lanterns/Game.tsx').then((module) => ({ default: module.MemoryFlip })),
)
const ContextGapDash = lazy(() =>
  import('../learningModules/context-gap-dash/Game.tsx').then((module) => ({ default: module.ContextGapDash })),
)
const SushiScramble = lazy(() =>
  import('../learningModules/sushi-scramble/Game.tsx').then((module) => ({ default: module.SentenceScramble })),
)

export type LearningModuleHostProps = {
  readonly pack: LearningModulePack
  readonly playAudio: PlayLearningModuleAudio
  readonly onExit: () => void
  readonly onAttempt?: (attempt: LearningModuleAttempt) => void
  readonly onComplete: (summary: LearningModuleSummary) => void
}

export function LearningModuleHost({ pack, playAudio, onExit, onAttempt, onComplete }: LearningModuleHostProps) {
  const shared = {
    title: pack.title,
    eyebrow: `${pack.cohort.grade} · Practice your Ninja Skills`,
    playAudio,
    onExit,
    onAttempt,
    onComplete,
  }

  return (
    <div className="ninja-game-surface">
      <Suspense
        fallback={
          <main className="page loading-surface" role="status">
            Loading {pack.title}…
          </main>
        }
      >
        {pack.moduleId === 'dictation-streak' ? (
          <DictationStreak {...shared} rounds={pack.rounds} />
        ) : pack.moduleId === 'speed-match' ? (
          <SpeedMatch {...shared} pairs={pack.pairs} />
        ) : pack.moduleId === 'target-blast' ? (
          <TargetBlast {...shared} rounds={pack.rounds} />
        ) : pack.moduleId === 'memory-flip' ? (
          <MemoryLanterns {...shared} pairs={pack.pairs} />
        ) : pack.moduleId === 'context-gap-dash' ? (
          <ContextGapDash {...shared} rounds={pack.rounds} />
        ) : (
          <SushiScramble {...shared} rounds={pack.rounds} />
        )}
      </Suspense>
    </div>
  )
}
