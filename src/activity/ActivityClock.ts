export type ClockBackend = {
  now: () => number
  schedule: (callback: () => void, delay: number) => unknown
  cancel: (handle: unknown) => void
}

type Task = { callback: () => void; due: number; repeat: number; handle?: unknown }

/** Activity time excludes every overlapping interruption; network/UI timers do not use this clock. */
export class ActivityClock {
  private reasons = new Set<string>()
  private listeners = new Set<(paused: boolean) => void>()
  private tasks = new Map<number, Task>()
  private nextId = 0
  private pausedAt = 0
  private elapsedPause = 0

  private readonly backend: ClockBackend
  constructor(backend: ClockBackend = {
    now: () => performance.now(),
    schedule: (callback, delay) => globalThis.setTimeout(callback, delay),
    cancel: handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  }) { this.backend = backend }

  get paused() { return this.reasons.size > 0 }
  now = () => (this.paused ? this.pausedAt : this.backend.now()) - this.elapsedPause

  setPaused(reason: string, paused: boolean) {
    const wasPaused = this.paused
    if (paused) this.reasons.add(reason)
    else this.reasons.delete(reason)
    if (wasPaused === this.paused) return
    if (this.paused) {
      this.pausedAt = this.backend.now()
      for (const task of this.tasks.values()) {
        if (task.handle !== undefined) this.backend.cancel(task.handle)
        task.handle = undefined
      }
    } else {
      this.elapsedPause += this.backend.now() - this.pausedAt
      for (const [id, task] of this.tasks) this.arm(id, task)
    }
    for (const listener of [...this.listeners]) listener(this.paused)
  }

  subscribe(listener: (paused: boolean) => void) {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private arm(id: number, task: Task) {
    if (this.paused) return
    task.handle = this.backend.schedule(() => {
      task.handle = undefined
      if (this.paused || !this.tasks.has(id)) return
      if (!task.repeat) this.tasks.delete(id)
      try { task.callback() }
      finally {
        if (task.repeat && this.tasks.has(id)) {
          task.due = this.now() + task.repeat
          this.arm(id, task)
        }
      }
    }, Math.max(0, task.due - this.now()))
  }

  setTimeout = (callback: () => void, delay = 0): number => {
    const id = ++this.nextId
    const task = { callback, due: this.now() + Math.max(0, delay), repeat: 0 }
    this.tasks.set(id, task)
    this.arm(id, task)
    return id
  }

  setInterval = (callback: () => void, delay: number): number => {
    const id = ++this.nextId
    const task = { callback, due: this.now() + Math.max(1, delay), repeat: Math.max(1, delay) }
    this.tasks.set(id, task)
    this.arm(id, task)
    return id
  }

  clearTimeout = (id: number | undefined | null) => {
    if (id == null) return
    const task = this.tasks.get(id)
    if (task?.handle !== undefined) this.backend.cancel(task.handle)
    this.tasks.delete(id)
  }
  clearInterval = this.clearTimeout
  requestAnimationFrame = (callback: FrameRequestCallback) => this.setTimeout(() => callback(this.now()), 16)
  cancelAnimationFrame = this.clearTimeout

  waitUntilRunning(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(new Error('Activity playback cancelled.'))
    if (!this.paused) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const cleanup = () => { unsubscribe(); signal?.removeEventListener('abort', abort) }
      const abort = () => { cleanup(); reject(new Error('Activity playback cancelled.')) }
      const unsubscribe = this.subscribe(paused => {
        if (!paused) { cleanup(); resolve() }
      })
      signal?.addEventListener('abort', abort, { once: true })
    })
  }
}
