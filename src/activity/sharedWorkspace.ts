function equivalentJson(left: string | null, right: string) {
  if (left === right) return true
  try {
    const compare = (a: unknown, b: unknown): boolean => {
      if (Object.is(a, b)) return true
      if (Array.isArray(a) || Array.isArray(b))
        return (
          Array.isArray(a) &&
          Array.isArray(b) &&
          a.length === b.length &&
          a.every((item, index) => compare(item, b[index]))
        )
      if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
      const aKeys = Object.keys(a)
      const bKeys = Object.keys(b)
      return (
        aKeys.length === bKeys.length &&
        aKeys.every(
          (key) =>
            Object.prototype.hasOwnProperty.call(b, key) &&
            compare((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
        )
      )
    }
    return compare(left === null ? null : JSON.parse(left), JSON.parse(right))
  } catch {
    return false
  }
}

/** One in-memory owner for reviewed state across retained, same-tab documents.
 * It never merges arbitrary snapshots or selects a cross-device winner. */
export function createSharedWorkspace<T>(initial: T, storage: Pick<Storage, 'getItem' | 'setItem'>, key: string) {
  let snapshot = { state: initial, error: '' }
  let persisted = storage.getItem(key)
  let closed = false
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of [...listeners]) listener()
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    save(expected: T, next: T) {
      const encoded = JSON.stringify(next)
      if (closed) return false
      if (expected !== snapshot.state && encoded !== JSON.stringify(snapshot.state)) {
        snapshot = {
          ...snapshot,
          error: 'Saved practice changed before this update. Nothing was overwritten; keep this activity open.',
        }
        notify()
        return false
      }
      try {
        const current = storage.getItem(key)
        const canMergeExternal = Boolean((storage as Pick<Storage, 'getItem' | 'setItem'> & { allowConcurrentMerge?: boolean }).allowConcurrentMerge)
        if (current !== persisted && current !== encoded && !canMergeExternal) {
          snapshot = {
            ...snapshot,
            error: 'Another browser changed saved practice. Nothing was overwritten; keep this activity open.',
          }
          notify()
          return false
        }
        storage.setItem(key, encoded)
        const confirmed = storage.getItem(key)
        if (confirmed !== encoded && !equivalentJson(confirmed, encoded))
          throw new Error('Browser saving could not be confirmed.')
        persisted = confirmed || encoded
        if (snapshot.state !== next || snapshot.error) {
          snapshot = { state: next, error: '' }
          notify()
        }
        return true
      } catch {
        // The existing recovery journals retain reviewed transitions; preserve
        // the corresponding in-session state too when storage is unavailable.
        snapshot = {
          state: next,
          error: 'Progress could not be saved in this browser. Keep this page open and retry before reloading.',
        }
        notify()
        return false
      }
    },
    close() {
      closed = true
      listeners.clear()
    },
  }
}

export type SharedWorkspace<T> = ReturnType<typeof createSharedWorkspace<T>>
