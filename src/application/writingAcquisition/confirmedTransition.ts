/** A failed readback retries the exact bytes, including random choices and time.
 * The caller serializes this synchronous operation with the existing write lock. */
export function createConfirmedWritingTransition<State>() {
  let pending: { key: string; before: State; state: State } | null = null
  return {
    get pending() {
      return pending !== null
    },
    commit(key: string, before: State, build: () => State, save: (before: State, next: State) => boolean) {
      if (pending && (pending.key !== key || pending.before !== before))
        throw new Error('Retry the unsaved writing step before continuing. Nothing was overwritten.')
      pending ||= { key, before, state: build() }
      if (!save(pending.before, pending.state))
        throw new Error('This writing step could not be saved. Keep this page open and try again.')
      const next = pending.state
      pending = null
      return next
    },
  }
}
