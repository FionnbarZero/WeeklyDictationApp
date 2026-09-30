import type { AcquisitionPromptKind, PracticeSession } from './domain.ts'
export { createPracticeCountdown, type CountdownScheduler } from './practice/countdown.ts'

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
