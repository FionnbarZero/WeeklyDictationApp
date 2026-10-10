import type { LearningModuleAttempt, LearningModulePack } from './contracts.ts'
import {
  checkpointGameAnswer,
  checkpointGameTimer,
  continueGameCheckpoint,
  gameCheckpointComplete,
  serializeGameRecord,
  retryTimedGame,
  retireGameCheckpoint,
  startGameCheckpoint,
  type GameCheckpoint,
  type GameRetirement,
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
  let pendingKey = ''
  let pendingRetirement: GameRetirement | null = null
  let busy = false
  let discarded = false
  async function transition(key: string, candidate: () => GameCheckpoint) {
    if (busy || discarded) throw new Error('The saved game is not available for another answer.')
    busy = true
    try {
      // The screen retries the same pending turn; it cannot replace it with a
      // different answer after a partial write.
      if (pending && pendingKey !== key) throw new Error('Retry the pending turn before answering again.')
      if (!pending) {
        pending = candidate()
        pendingKey = key
      }
      if (gameCheckpointComplete(pending)) await store.finishCheckpoint(pending, current)
      else await store.saveCheckpoint(pending, current)
      current = pending
      pending = null
      pendingKey = ''
      return current
    } finally {
      busy = false
    }
  }
  return {
    initial,
    checkpoint: () => current,
    review: (attempt: LearningModuleAttempt) =>
      transition(`answer:${serializeGameRecord(attempt)}`, () => checkpointGameAnswer(current, attempt, now())),
    timer: (remainingMs: number) => transition(`timer:${remainingMs}`, () => checkpointGameTimer(current, remainingMs)),
    restartTimed: () => transition('restart', () => retryTimedGame(current)),
    async discard() {
      if (busy || discarded) throw new Error('Wait for this turn to finish saving before discarding it.')
      busy = true
      try {
        // A partial local write must retry the exact retirement identity and
        // timestamp so the run cannot be revived or become undiscardable.
        pendingRetirement ||= retireGameCheckpoint(current, now())
        await store.discardCheckpoint(current, pendingRetirement)
        discarded = true
        pendingRetirement = null
      } finally {
        busy = false
      }
    },
  }
}
export type GameSession = Awaited<ReturnType<typeof openGameSession>>
