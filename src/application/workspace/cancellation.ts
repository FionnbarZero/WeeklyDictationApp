export class WorkspaceSynchronizationAborted extends Error {
  constructor() {
    super('Child workspace synchronization was superseded.')
    this.name = 'AbortError'
  }
}

export function throwIfWorkspaceSynchronizationAborted(signal: AbortSignal) {
  if (signal.aborted) throw new WorkspaceSynchronizationAborted()
}

export function isWorkspaceSynchronizationAborted(error: unknown) {
  return (
    error instanceof WorkspaceSynchronizationAborted || (error instanceof DOMException && error.name === 'AbortError')
  )
}
