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
  let paused = false

  const scheduleNext = () => {
    if (!cancelled && !completed && !paused) handle = scheduler.schedule(tick, 1000)
  }

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
    else scheduleNext()
  }

  onTick(seconds)
  if (seconds === 0) finish()
  else scheduleNext()

  return {
    pause() {
      if (cancelled || completed || paused) return
      paused = true
      if (handle !== undefined) scheduler.cancel(handle)
      handle = undefined
    },
    resume() {
      if (cancelled || completed || !paused) return
      paused = false
      scheduleNext()
    },
    addSeconds(additionalSeconds: number) {
      if (cancelled || completed || !Number.isFinite(additionalSeconds) || additionalSeconds <= 0) return
      seconds += Math.floor(additionalSeconds)
      onTick(seconds)
    },
    cancel() {
      if (cancelled) return
      cancelled = true
      if (handle !== undefined) scheduler.cancel(handle)
    },
  }
}
