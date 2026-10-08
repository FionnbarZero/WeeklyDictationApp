import { type BetaResult, isBetaResult } from './model.ts'

export const RESULT_KEY = 'family-beta-preview-results-v1'
export const PENDING_KEY = 'family-beta-preview-pending-v1'
type Reader = Pick<Storage, 'length' | 'key' | 'getItem'>
type Writer = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const invalid = 'Invalid scores; preserved.'
const conflict = 'Score copies disagree. Neither was replaced.'

export function sameCompletedResult(a: BetaResult, b: BetaResult) {
  return a.schoolYear === b.schoolYear && Object.keys(a).every(
    (key) => JSON.stringify(a[key as keyof BetaResult]) === JSON.stringify(b[key as keyof BetaResult]),
  )
}

function legacyResults(storage: Pick<Storage, 'getItem'>, key: string): BetaResult[] {
  const parsed: unknown = JSON.parse(storage.getItem(key) ?? '[]')
  if (!Array.isArray(parsed) || !parsed.every(isBetaResult)) throw new Error(invalid)
  return parsed
}

function checkCopy(expected: BetaResult, value: unknown) {
  if (!isBetaResult(value)) throw new Error(invalid)
  if (!sameCompletedResult(expected, value)) throw new Error(conflict)
}

/** Retries may duplicate a fact, but a keyed copy must never hide another value. */
export function readResultLedger(storage: Reader, key: string): BetaResult[] {
  const results = new Map<string, BetaResult>()
  const add = (result: BetaResult) => {
    const previous = results.get(result.id)
    if (previous) checkCopy(previous, result)
    results.set(result.id, result)
    if (results.size > 500) throw new Error(invalid)
  }
  for (const result of legacyResults(storage, key)) add(result)
  for (let i = 0; i < storage.length; i++) {
    const itemKey = storage.key(i)
    if (!itemKey?.startsWith(`${key}:`)) continue
    const value: unknown = JSON.parse(storage.getItem(itemKey) ?? 'null')
    if (!isBetaResult(value) || itemKey !== `${key}:${value.id}`) throw new Error(invalid)
    add(value)
  }
  return [...results.values()]
}

/** Check both historical formats before any write or acknowledgement. */
export function assertResultCopiesMatch(storage: Pick<Storage, 'getItem'>, key: string, expected: BetaResult) {
  if (!isBetaResult(expected)) throw new Error(invalid)
  const raw = storage.getItem(`${key}:${expected.id}`)
  if (raw !== null) checkCopy(expected, JSON.parse(raw))
  for (const result of legacyResults(storage, key)) if (result.id === expected.id) checkCopy(expected, result)
}

/** Only call after exact authorized cloud readback. Losing the response leaves
 * the outbox intact; repeating this acknowledgement is safe after a crash. */
export function acknowledgeCompletedResult(storage: Writer, expected: BetaResult) {
  assertResultCopiesMatch(storage, RESULT_KEY, expected)
  assertResultCopiesMatch(storage, PENDING_KEY, expected)
  const resultKey = `${RESULT_KEY}:${expected.id}`
  // Recover a quota/interruption between the original outbox and ledger writes.
  if (storage.getItem(resultKey) === null) storage.setItem(resultKey, JSON.stringify(expected))
  const saved: unknown = JSON.parse(storage.getItem(resultKey) ?? 'null')
  checkCopy(expected, saved)

  const legacy = legacyResults(storage, PENDING_KEY)
  if (legacy.some((result) => result.id === expected.id)) {
    const next = JSON.stringify(legacy.filter((result) => result.id !== expected.id))
    storage.setItem(PENDING_KEY, next)
    if (storage.getItem(PENDING_KEY) !== next)
      throw new Error('Score acknowledgement could not be saved. Please retry.')
  }
  storage.removeItem(`${PENDING_KEY}:${expected.id}`)
  if (storage.getItem(`${PENDING_KEY}:${expected.id}`) !== null)
    throw new Error('Score acknowledgement could not be saved. Please retry.')
}
