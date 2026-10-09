import type { LearningModuleAttempt, LearningModulePack } from './contracts.ts'
import {
  checkpointGameAnswer,
  continueGameCheckpoint,
  gameCheckpointComplete,
  serializeGameRecord,
  startGameCheckpoint,
  type GameCheckpoint,
  type GameScope,
} from './progress.ts'
import type { GameProgressStore } from './progressStore.ts'

/** One mounted game owns one expected snapshot. A failed write retains the
 * exact candidate (including timestamp) for retry; no response is persisted. */
export async function openGameSession(options: {
  store: GameProgressStore
  scope: GameScope
  pack: LearningModulePack
  writerId: string
  uuid: () => string
  now: () => string
  delivered: (value: GameCheckpoint) => boolean
}) {
  const { store, scope, writerId, uuid, now } = options
  const saved = store.checkpoint(scope)
  // Completion is saved first. Recover it if the following checkpoint write
  // was interrupted, without replaying the last answer with a new timestamp.
  const completed = saved && store.completions(scope.childId).find((item) => item.result.id === saved.attemptId)
  let recovered = saved
  if (completed && saved && !gameCheckpointComplete(saved)) {
    const final = completed.checkpoint
    if (
      serializeGameRecord(final.scope) !== serializeGameRecord(saved.scope) ||
      serializeGameRecord(final.pack) !== serializeGameRecord(saved.pack) ||
      final.runId !== saved.runId ||
      final.revision !== saved.revision + 1 ||
      saved.prompts.some(
        (prompt, i) => prompt.attempted > final.prompts[i].attempted || prompt.correct > final.prompts[i].correct,
      )
    )
      throw new Error('Saved completion disagrees with this game. Both records were preserved.')
    recovered = final
  }
  let current =
    recovered && !(gameCheckpointComplete(recovered) && options.delivered(recovered))
      ? gameCheckpointComplete(recovered)
        ? recovered
        : continueGameCheckpoint(recovered, writerId, uuid())
      : startGameCheckpoint(scope, options.pack, uuid(), writerId, now())
  await store.saveCheckpoint(current, saved)
  const initial = current
  let pending: GameCheckpoint | null = null
  let pendingAnswer = ''
  let busy = false
  let discarded = false
  return {
    initial,
    checkpoint: () => current,
    async review(attempt: LearningModuleAttempt) {
      if (busy || discarded) throw new Error('The saved game is not available for another answer.')
      busy = true
      try {
        // The screen retries the same pending turn; it cannot replace it with a
        // different answer after a partial write.
        if (pending && pendingAnswer !== serializeGameRecord(attempt))
          throw new Error('Retry the pending turn before answering again.')
        if (!pending) {
          pending = checkpointGameAnswer(current, attempt, now())
          pendingAnswer = serializeGameRecord(attempt)
        }
        if (gameCheckpointComplete(pending)) await store.finishCheckpoint(pending, current)
        else await store.saveCheckpoint(pending, current)
        current = pending
        pending = null
        pendingAnswer = ''
        return current
      } finally {
        busy = false
      }
    },
    async discard() {
      if (busy) throw new Error('Wait for this turn to finish saving before discarding it.')
      await store.discardCheckpoint(current)
      discarded = true
    },
  }
}
export type GameSession = Awaited<ReturnType<typeof openGameSession>>
