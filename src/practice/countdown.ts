export type CountdownScheduler = {
  schedule: (callback: () => void, delayMs: number) => unknown
  cancel: (handle: unknown) => void
}

const browserScheduler: CountdownScheduler = {
  schedule: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  cancel: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export function createPracticeCountdown(
  durationSeconds: number,
  onTick: (seconds: number) => void,
  onComplete: () => void,
  scheduler: CountdownScheduler = browserScheduler,
) {
  let seconds = Math.max(0, durationSeconds)
  let handle: unknown
  let cancelled = false
  let completed = false

  const finish = () => {
    if (cancelled || completed) return
    completed = true
    onComplete()
  }

  const tick = () => {
    if (cancelled || completed) return
    seconds = Math.max(0, seconds - 1)
    onTick(seconds)
    if (seconds === 0) finish()
    else handle = scheduler.schedule(tick, 1000)
  }

  onTick(seconds)
  if (seconds === 0) finish()
  else handle = scheduler.schedule(tick, 1000)

  return {
    cancel() {
      if (cancelled) return
      cancelled = true
      if (handle !== undefined) scheduler.cancel(handle)
    },
  }
}
