import { PENDING_KEY, RESULT_KEY, readResultLedger } from './resultLedger.ts'

export class ScrollsAttemptClosedError extends Error {
  constructor() {
    super('This attempt is already being saved or is complete. This response was not added to its score.')
  }
}

export function assertScrollsAnswerOpen(storage: Parameters<typeof readResultLedger>[0], sessionId: string) {
  // A queued score is an immutable intent, even when confirming its ledger
  // failed. Read durable state at every write; a storage event is not a fence.
  const results = [...readResultLedger(storage, PENDING_KEY), ...readResultLedger(storage, RESULT_KEY)]
  if (results.some((result) => result.id === sessionId)) throw new ScrollsAttemptClosedError()
}

/** Serialize the completion check + checkpoint write with prepare + score.
 * Callbacks are synchronous: no awaited network or media work inside the lock.
 * Existing checkpoint CAS still rejects stale views when an answer wins first.
 * No new storage format, mutable result, or completion-marker migration. */
export function withScrollsWrite<T>(key: string, operation: () => T): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks)
    return Promise.reject(
      new Error('This browser cannot safely coordinate saved reading across tabs. No records were changed.'),
    )
  return navigator.locks.request(`ninja-scrolls-write:${key}`, { mode: 'exclusive' }, operation)
}
