import { isBetaResult, type BetaResult } from './model.ts'

/** Completed facts must leave the outbox before unfinished checkpoints can be
 * reconciled. A failed practice sync cannot hold an already-confirmed score.
 * Cancellation never acknowledges an in-flight operation under a new owner. */
export async function syncCompletedBeforePractice(options: {
  isCurrent: () => boolean
  pending: () => readonly BetaResult[]
  belongsToFamily: (result: BetaResult) => boolean
  validate: (result: BetaResult) => void
  save: (result: BetaResult) => Promise<void>
  acknowledge: (result: BetaResult) => void
  syncPractice: () => Promise<void>
}) {
  if (!options.isCurrent()) return false
  const pending = options.pending()
  if (!pending.every(isBetaResult)) throw new Error('Queued completed scores failed validation. Nothing was discarded.')
  for (const result of pending) {
    if (!options.isCurrent()) return false
    if (!options.belongsToFamily(result)) continue
    options.validate(result)
    await options.save(result)
    if (!options.isCurrent()) return false
    options.acknowledge(result)
  }
  if (!options.isCurrent()) return false
  await options.syncPractice()
  return options.isCurrent()
}
