export function scopedActivityStorage(storage: Storage, prefix: string): Storage {
  // Kept-alive documents must not overwrite another document's newer legacy
  // checkpoint. The existing coordinator retains the in-memory attempt on error.
  const observed = new Map<string, string | null>()
  const keys = () =>
    Array.from({ length: storage.length }, (_, i) => storage.key(i)!).filter((k) => k.startsWith(prefix))
  return {
    get length() {
      return keys().length
    },
    key: (index) => keys()[index]?.slice(prefix.length) ?? null,
    getItem: (key) => {
      const value = storage.getItem(prefix + key)
      observed.set(key, value)
      return value
    },
    setItem: (key, value) => {
      const current = storage.getItem(prefix + key)
      if (
        key === 'weekly-dictation-state-v2' &&
        observed.has(key) &&
        current !== observed.get(key) &&
        current !== value
      )
        throw new Error(
          'Another activity updated this child’s saved practice. Both open attempts are preserved; nothing was overwritten.',
        )
      storage.setItem(prefix + key, value)
      observed.set(key, value)
    },
    removeItem: (key) => storage.removeItem(prefix + key),
    clear: () => {
      for (const key of keys()) storage.removeItem(key)
    },
  }
}
