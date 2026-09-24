import type { AcquisitionPromptKind, PracticeSession } from './domain.ts'

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

export function wordIsVisibleDuringWriting(kind: AcquisitionPromptKind | undefined) {
  return kind === 'show-copy'
}

export function practicePosition(session: PracticeSession) {
  if (session.stage === 'complete') return { label: 'Test complete', total: null }
  if (session.segment === 'warmup') return { label: `Warmup ${session.index + 1}`, total: session.queue.length }
  if (session.acquisition) {
    const targetNumber = Math.min(session.acquisition.targetIndex + 1, session.primaryQueue.length)
    return { label: `Word ${targetNumber}`, total: session.primaryQueue.length }
  }
  return { label: `Word ${session.index + 1}`, total: session.queue.length }
}
