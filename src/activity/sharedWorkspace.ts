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
        if (current !== persisted && current !== encoded) {
          snapshot = {
            ...snapshot,
            error: 'Another browser changed saved practice. Nothing was overwritten; keep this activity open.',
          }
          notify()
          return false
        }
        storage.setItem(key, encoded)
        if (storage.getItem(key) !== encoded) throw new Error('Browser saving could not be confirmed.')
        persisted = encoded
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
