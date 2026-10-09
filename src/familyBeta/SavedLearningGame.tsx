import { useEffect, useState } from 'react'
import { MemoryFlip } from '../learningModules/memory-lanterns/Game.tsx'
import { SentenceScramble } from '../learningModules/sushi-scramble/Game.tsx'
import type { LearningModulePack, PlayLearningModuleAudio } from '../ninjaSkills/contracts.ts'
import { openGameSession, type GameSession } from '../ninjaSkills/gameSession.ts'
import { completeGameCheckpoint } from '../ninjaSkills/progress.ts'
import { browserGameWriteLock, createLockedGameProgressStore } from '../ninjaSkills/progressStore.ts'
import { saveGameAggregate } from './gameResultBridge.ts'
import type { FamilyGameOwner, FamilyGameWindow } from './gameOwner.ts'
import { assertResultCopiesMatch, readResultLedger, RESULT_KEY, PENDING_KEY } from './resultLedger.ts'
import type { BetaResult } from './model.ts'
import '../ninjaSkills/surface.css'

export function SavedLearningGame({
  pack,
  playAudio,
  onExit,
  onComplete,
}: {
  pack: Extract<LearningModulePack, { moduleId: 'memory-flip' | 'sentence-scramble' }>
  playAudio: PlayLearningModuleAudio
  onExit: () => void
  onComplete: (result: BetaResult) => void
}) {
  const [loaded, setLoaded] = useState<{ session: GameSession; owner: FamilyGameOwner } | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let cancelled = false
    let installed: GameSession | undefined
    void (async () => {
      const owner = (window.parent as FamilyGameWindow).familyGameOwner?.(window)
      if (!owner) throw new Error('Open this game from the family page.')
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
      if (!cancelled) setError(e instanceof Error ? e.message : 'Saved game could not be opened.')
    })
    return () => {
      cancelled = true
      if ((window as FamilyGameWindow).familyGameSession === installed)
        delete (window as FamilyGameWindow).familyGameSession
    }
  }, [pack, retry])
  if (!loaded)
    return (
      <section>
        <p role={error ? 'alert' : 'status'}>{error || 'Opening saved game…'}</p>
        {error && (
          <button
            onClick={() => {
              setError('')
              setRetry((value) => value + 1)
            }}
          >
            Retry opening saved game
          </button>
        )}
      </section>
    )
  const { session, owner } = loaded
  const initial = session.initial
  if (initial.pack.moduleId !== pack.moduleId) throw new Error('Saved game type does not match.')
  const shared = {
    title: initial.pack.title,
    playAudio,
    onExit,
    savedProgress: {
      cleared: initial.cleared,
      attempted: initial.prompts.reduce((sum, p) => sum + p.attempted, 0),
      correct: initial.prompts.reduce((sum, p) => sum + p.correct, 0),
    },
    onAttempt: async (attempt: Parameters<GameSession['review']>[0]) => {
      await session.review(attempt)
    },
    onComplete: () => {
      void browserGameWriteLock(`ninja-game-storage-v1:${owner.familyId}`, () => {
        if (!owner.stillOwner()) throw new Error('The family account changed. Saved work was preserved.')
        return saveGameAggregate(
          localStorage,
          completeGameCheckpoint(session.checkpoint(), session.checkpoint().reviewedAt!),
        )
      })
        .then((result) => {
          parent.postMessage({ type: 'family-beta-result-ready' }, location.origin)
          onComplete(result)
        })
        .catch((e) =>
          setError(
            `This game result could not be saved. ${e instanceof Error ? e.message : ''} Keep the game open and retry completion.`,
          ),
        )
    },
  }
  return (
    <div className="ninja-game-surface">
      <p>Reviewed turns save on this device. Game-detail syncing is not connected yet.</p>
      {error && <p role="alert">{error}</p>}
      {initial.pack.moduleId === 'memory-flip' ? (
        <MemoryFlip {...shared} pairs={initial.pack.pairs} />
      ) : initial.pack.moduleId === 'sentence-scramble' ? (
        <SentenceScramble {...shared} rounds={initial.pack.rounds} />
      ) : null}
    </div>
  )
}
