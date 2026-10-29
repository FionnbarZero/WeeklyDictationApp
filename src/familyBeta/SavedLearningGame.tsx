import { lazy, Suspense, useEffect, useState } from 'react'
import type { LearningModulePack, PlayLearningModuleAudio } from '../ninjaSkills/contracts.ts'
import { type GameSession, openGameSession } from '../ninjaSkills/gameSession.ts'
import { completeGameCheckpoint } from '../ninjaSkills/progress.ts'
import { browserGameWriteLock, createLockedGameProgressStore } from '../ninjaSkills/progressStore.ts'
import type { FamilyGameOwner, FamilyGameWindow } from './gameOwner.ts'
import { saveGameAggregate } from './gameResultBridge.ts'
import type { BetaResult } from './model.ts'
import { assertResultCopiesMatch, PENDING_KEY, RESULT_KEY, readResultLedger } from './resultLedger.ts'
import '../ninjaSkills/surface.css'
import { activityClock } from '../activity/activityLifecycle.ts'
import { gameRecoveryPreview, savedGameRecoveryExample } from './gameRecoveryPreview.ts'

const MemoryFlip = lazy(() =>
  import('../learningModules/memory-lanterns/Game.tsx').then((module) => ({ default: module.MemoryFlip })),
)
const SentenceScramble = lazy(() =>
  import('../learningModules/sushi-scramble/Game.tsx').then((module) => ({ default: module.SentenceScramble })),
)
const ContextGapDash = lazy(() =>
  import('../learningModules/context-gap-dash/Game.tsx').then((module) => ({ default: module.ContextGapDash })),
)
const SpeedMatch = lazy(() =>
  import('../learningModules/speed-match/Game.tsx').then((module) => ({ default: module.SpeedMatch })),
)
const TargetBlast = lazy(() =>
  import('../learningModules/target-blast/Game.tsx').then((module) => ({ default: module.TargetBlast })),
)
const DictationStreak = lazy(() =>
  import('../learningModules/dictation-streak/Game.tsx').then((module) => ({ default: module.DictationStreak })),
)

export function SavedLearningGame({
  pack,
  playAudio,
  onExit,
  onComplete,
}: {
  pack: Extract<
    LearningModulePack,
    {
      moduleId:
        | 'memory-flip'
        | 'sentence-scramble'
        | 'context-gap-dash'
        | 'speed-match'
        | 'target-blast'
        | 'dictation-streak'
    }
  >
  playAudio: PlayLearningModuleAudio
  onExit: () => void
  onComplete: (result: BetaResult) => void
}) {
  const [loaded, setLoaded] = useState<{ session: GameSession; owner: FamilyGameOwner } | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [turnFailed, setTurnFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    let installed: GameSession | undefined
    let releaseView: (() => void) | undefined
    void (async () => {
      const owner = (window.parent as FamilyGameWindow).familyGameOwner?.(window)
      if (!owner) throw new Error('Open this game from the family page.')
      if (gameRecoveryPreview) {
        const { acquireGameView } = await import('./gameRecovery.ts')
        releaseView = await acquireGameView(owner.familyId, {
          childId: owner.profile.id,
          grade: owner.profile.grade,
          week: owner.week,
          gameId: pack.moduleId,
        })
        if (cancelled) {
          releaseView()
          return
        }
      }
      const store = createLockedGameProgressStore(localStorage, owner.familyId, () => !cancelled && owner.stillOwner())
      const session = await openGameSession({
        store,
        scope: { childId: owner.profile.id, grade: owner.profile.grade, week: owner.week, gameId: pack.moduleId },
        pack,
        writerId: owner.writerId,
        uuid: () => crypto.randomUUID(),
        now: () => new Date().toISOString(),
        delivered: (checkpoint) => {
          const result = completeGameCheckpoint(checkpoint, checkpoint.reviewedAt!).result
          assertResultCopiesMatch(localStorage, RESULT_KEY, result)
          assertResultCopiesMatch(localStorage, PENDING_KEY, result)
          return readResultLedger(localStorage, RESULT_KEY).some((item) => item.id === result.id)
        },
      })
      if (cancelled) return
      installed = session
      ;(window as FamilyGameWindow).familyGameSession = session
      setLoaded({ session, owner })
    })().catch((e) => {
      releaseView?.()
      if (!cancelled) setError(e instanceof Error ? e.message : 'Saved game could not be opened.')
    })
    return () => {
      cancelled = true
      releaseView?.()
      if ((window as FamilyGameWindow).familyGameSession === installed)
        delete (window as FamilyGameWindow).familyGameSession
    }
  }, [pack, retry])
  if (!loaded)
    return (
      <section data-report-activity={pack.title} data-report-phase="opening-saved-game">
        <p role={error ? 'alert' : 'status'}>{error || 'Opening saved game…'}</p>
        {error && (
          <button
            onClick={() => {
              if (gameRecoveryPreview && activityClock.paused) return
              setError('')
              setRetry((value) => value + 1)
            }}
          >
            Retry opening saved game
          </button>
        )}
        {gameRecoveryPreview && (
          <button
            onClick={() => {
              if (!activityClock.paused) onExit()
            }}
          >
            Return to games
          </button>
        )}
      </section>
    )
  const { session, owner } = loaded
  const initial = session.initial
  if (initial.pack.moduleId !== pack.moduleId) throw new Error('Saved game type does not match.')
  // Answers, timer ticks and timed restarts share the same checkpoint owner.
  // Every failed write must offer recovery, without letting an older visit
  // clear or replace the current visit's error state.
  async function saveChange(write: () => Promise<unknown>) {
    try {
      await write()
      if (!gameRecoveryPreview || (window as FamilyGameWindow).familyGameSession === session) setTurnFailed(false)
    } catch (error) {
      if (!gameRecoveryPreview || (window as FamilyGameWindow).familyGameSession === session) setTurnFailed(true)
      throw error
    }
  }
  const shared = {
    title: initial.pack.title,
    playAudio,
    onExit,
    savedProgress: {
      cleared: initial.cleared,
      attempted: initial.prompts.reduce((sum, p) => sum + p.attempted, 0),
      correct: initial.prompts.reduce((sum, p) => sum + p.correct, 0),
    },
    onAttempt: (attempt: Parameters<GameSession['review']>[0]) => saveChange(() => session.review(attempt)),
    onComplete: () => {
      void browserGameWriteLock(`ninja-game-storage-v1:${owner.familyId}`, () => {
        if (!owner.stillOwner()) throw new Error('The family account changed. Saved work was preserved.')
        if (gameRecoveryPreview && (window as FamilyGameWindow).familyGameSession !== session)
          throw new Error('The game was reopened. Its saved work is preserved.')
        return saveGameAggregate(
          localStorage,
          completeGameCheckpoint(session.checkpoint(), session.checkpoint().reviewedAt!),
        )
      })
        .then((result) => {
          parent.postMessage({ type: 'family-beta-result-ready' }, location.origin)
          if (gameRecoveryPreview && (window as FamilyGameWindow).familyGameSession !== session) return
          onComplete(result)
        })
        .catch((e) => {
          if (gameRecoveryPreview && (window as FamilyGameWindow).familyGameSession !== session) return
          setError(
            `This game result could not be saved. ${e instanceof Error ? e.message : ''} Keep the game open and retry completion.`,
          )
        })
    },
  }
  return (
    <div className="ninja-game-surface">
      <p>
        {savedGameRecoveryExample
          ? 'Reviewed turns save in this browser for this test learner.'
          : 'Reviewed turns save on this device and sync with the parent’s family account when connected.'}
      </p>
      {error && <p role="alert">{error}</p>}
      {gameRecoveryPreview && turnFailed && (
        <div role="status">
          <p>
            Retry saving below. If another window has changed this game, reopen its saved turns. Only an unconfirmed
            turn may need repeating.
          </p>
          <button
            onClick={() => {
              if (activityClock.paused) return
              setLoaded(null)
              setError('')
              setTurnFailed(false)
              setRetry((value) => value + 1)
            }}
          >
            Reopen saved turns
          </button>
        </div>
      )}
      <Suspense fallback={<p role="status">Opening saved game…</p>}>
        {initial.pack.moduleId === 'memory-flip' ? (
          <MemoryFlip {...shared} pairs={initial.pack.pairs} />
        ) : initial.pack.moduleId === 'target-blast' ? (
          <TargetBlast {...shared} rounds={initial.pack.rounds} />
        ) : initial.pack.moduleId === 'dictation-streak' ? (
          <DictationStreak {...shared} rounds={initial.pack.rounds} />
        ) : initial.pack.moduleId === 'sentence-scramble' ? (
          <SentenceScramble {...shared} rounds={initial.pack.rounds} />
        ) : initial.pack.moduleId === 'context-gap-dash' ? (
          <ContextGapDash
            {...shared}
            rounds={initial.pack.rounds}
            savedResults={initial.prompts.slice(0, initial.cleared.length).map((prompt) => prompt.correct === 1)}
          />
        ) : initial.pack.moduleId === 'speed-match' ? (
          <SpeedMatch
            {...shared}
            pairs={initial.pack.pairs}
            remainingMs={initial.remainingMs!}
            onTimer={async (remainingMs) => {
              if (gameRecoveryPreview) await saveChange(() => session.timer(remainingMs))
              else await session.timer(remainingMs)
            }}
            onRestart={async () => {
              if (gameRecoveryPreview) await saveChange(() => session.restartTimed())
              else await session.restartTimed()
            }}
          />
        ) : null}
      </Suspense>
    </div>
  )
}
