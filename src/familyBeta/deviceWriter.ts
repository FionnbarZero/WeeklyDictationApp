const key = 'family-beta-device-writer-v1'
export const validWriter = (value: unknown): value is string =>
  typeof value === 'string' && /^[\w-]{1,160}$/.test(value)

/** Random installation identity, not a credential or a fingerprint. Never sync
 * this installation key. Checkpoints carry its value as provenance, but another
 * browser continuing a checkpoint must retain its own installation identity. */
export function deviceWriter(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  uuid = () => crypto.randomUUID() as string,
) {
  const previous = storage.getItem(key)
  if (previous !== null) {
    if (!validWriter(previous))
      throw new Error('This browser’s practice identity could not be read. Nothing was erased.')
    return previous
  }
  const value = uuid()
  if (!validWriter(value)) throw new Error('Invalid practice writer identity.')
  storage.setItem(key, value)
  if (storage.getItem(key) !== value)
    throw new Error('This browser’s practice identity could not be saved. Please retry.')
  return value
}
