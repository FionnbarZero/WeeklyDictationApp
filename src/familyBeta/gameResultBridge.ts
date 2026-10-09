import {
  assertResultCopiesMatch,
  PENDING_KEY,
  readResultLedger,
  RESULT_KEY,
  sameCompletedResult,
} from './resultLedger.ts'
import { validateGameCompletion, type GameCompletion } from '../ninjaSkills/progress.ts'
import type { GameStorage } from '../ninjaSkills/progressStore.ts'

/** Keep the established graph/outbox format byte-for-byte compatible. The
 * detailed completion remains independently queued until its backend exists. */
export function saveGameAggregate(storage: GameStorage, completion: GameCompletion) {
  const result = validateGameCompletion(completion).result
  for (const key of [RESULT_KEY, PENDING_KEY]) {
    const history = readResultLedger(storage, key)
    assertResultCopiesMatch(storage, key, result)
    if (history.length >= 500 && !history.some((item) => item.id === result.id))
      throw new Error('Saved score history is full. No records were removed.')
  }
  for (const key of [PENDING_KEY, RESULT_KEY]) {
    storage.setItem(`${key}:${result.id}`, JSON.stringify(result))
    const saved = readResultLedger(storage, key).find((item) => item.id === result.id)
    if (!saved || !sameCompletedResult(saved, result)) throw new Error('The completed score could not be confirmed.')
  }
  return result
}
