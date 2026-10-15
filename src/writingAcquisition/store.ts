import {
  advanceWritingProgress,
  validateWritingProgress,
  type WritingCommand,
  type WritingProgress,
} from './progress.ts'
import { acquisitionDigest } from '../acquisition/persistence/identity.ts'

export type WritingStorage = Pick<Storage, 'getItem' | 'setItem'>
const MAX_BYTES = 600_000

function encode(progress: WritingProgress) {
  validateWritingProgress(progress, progress.owner)
  const encoded = JSON.stringify(progress)
  if (new TextEncoder().encode(encoded).byteLength > MAX_BYTES)
    throw new Error('This writing checkpoint is too large to save safely.')
  return encoded
}

/** Call mutations under a browser Web Lock or an equivalent transactional adapter. */
export function openWritingStore(storage: WritingStorage, key: string, owner: string, fresh: () => WritingProgress) {
  let raw = storage.getItem(key)
  let current: WritingProgress
  let pending: { commandFingerprint: string; next: WritingProgress; encoded: string } | undefined
  if (raw === null) {
    current = fresh()
    validateWritingProgress(current, owner)
    const initial = encode(current)
    storage.setItem(key, initial)
    if (storage.getItem(key) !== initial)
      throw new Error('Saving could not be confirmed. No teaching step was advanced.')
    raw = initial
  } else {
    if (new TextEncoder().encode(raw).byteLength > MAX_BYTES)
      throw new Error('Saved writing is too large to safely open. Nothing was erased.')
    try {
      current = JSON.parse(raw)
    } catch {
      throw new Error('Saved writing could not be read. Nothing was erased.')
    }
    validateWritingProgress(current, owner)
  }
  return {
    key,
    get current() {
      return current
    },
    apply(command: WritingCommand, timestamp: string, random = Math.random) {
      const commandFingerprint = acquisitionDigest(command)
      if (pending && pending.commandFingerprint !== commandFingerprint)
        throw new Error('Retry the original save or reopen the saved lesson before choosing another answer.')
      const next = pending?.next || advanceWritingProgress(current, command, timestamp, random)
      const encoded = pending?.encoded || encode(next)
      const stored = storage.getItem(key)
      // Confirm an exact earlier write whose readback was interrupted.
      if (stored === encoded) {
        current = next
        raw = encoded
        pending = undefined
        return current
      }
      if (stored !== raw)
        throw new Error('Writing changed in another window. Reopen the saved lesson; nothing was overwritten.')
      pending = { commandFingerprint, next, encoded }
      storage.setItem(key, encoded)
      if (storage.getItem(key) !== encoded)
        throw new Error('Saving could not be confirmed. Keep this screen open and retry.')
      current = next
      raw = encoded
      pending = undefined
      return current
    },
  }
}
