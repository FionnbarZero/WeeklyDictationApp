import assert from 'node:assert/strict'
import test from 'node:test'
import type { PracticeSession, Word } from '../src/domain.ts'
import {
  createPracticeCountdown,
  practicePosition,
  wordIsVisibleDuringWriting,
  type CountdownScheduler,
} from '../src/practicePresentation.ts'

function fakeScheduler() {
  let nextId = 1
  const pending = new Map<number, () => void>()
  const scheduler: CountdownScheduler = {
    schedule(callback) {
      const id = nextId
      nextId += 1
      pending.set(id, callback)
      return id
    },
    cancel(handle) {
      pending.delete(handle as number)
    },
  }
  return {
    scheduler,
    runNext() {
      const next = pending.entries().next().value as [number, () => void] | undefined
      if (!next) return false
      pending.delete(next[0])
      next[1]()
      return true
    },
    get pendingCount() { return pending.size },
  }
}

function word(index: number): Word {
  return { id: `word-${index}`, text: `字${index}`, sentence: '', datasetId: 'dataset' }
}

function session(overrides: Partial<PracticeSession> = {}): PracticeSession {
  return {
    id: 'session',
    childId: 'child',
    grade: 'Grade 2',
    primaryDatasetId: 'dataset',
    primaryPhase: 'test-review',
    segment: 'warmup',
    stage: 'dictation',
    queue: Array.from({ length: 6 }, (_, index) => word(index)),
    warmupQueue: Array.from({ length: 6 }, (_, index) => word(index)),
    primaryQueue: Array.from({ length: 5 }, (_, index) => word(index + 10)),
    index: 0,
    startedAt: '2026-09-23T12:00:00.000Z',
    warmupAnswers: [],
    primaryAnswers: [],
    warmupCategoryByWordId: {},
    warmupRandomRotationWordIds: [],
    warmupRotationCycleId: 1,
    warmupOnly: false,
    ...overrides,
  }
}

test('a prompt countdown starts at its full duration and completes exactly once at zero', () => {
  const clock = fakeScheduler()
  const ticks: number[] = []
  let completions = 0
  createPracticeCountdown(3, (seconds) => ticks.push(seconds), () => { completions += 1 }, clock.scheduler)

  assert.deepEqual(ticks, [3])
  assert.equal(completions, 0)
  clock.runNext()
  clock.runNext()
  assert.deepEqual(ticks, [3, 2, 1])
  assert.equal(completions, 0)
  clock.runNext()
  assert.deepEqual(ticks, [3, 2, 1, 0])
  assert.equal(completions, 1)
  assert.equal(clock.pendingCount, 0)
  assert.equal(clock.runNext(), false)
  assert.equal(completions, 1)
})

test('a newly started prompt cannot inherit zero from the prior prompt', () => {
  const firstClock = fakeScheduler()
  let firstCompletions = 0
  createPracticeCountdown(1, () => undefined, () => { firstCompletions += 1 }, firstClock.scheduler)
  firstClock.runNext()
  assert.equal(firstCompletions, 1)

  const nextClock = fakeScheduler()
  const ticks: number[] = []
  let nextCompletions = 0
  createPracticeCountdown(5, (seconds) => ticks.push(seconds), () => { nextCompletions += 1 }, nextClock.scheduler)
  assert.deepEqual(ticks, [5])
  assert.equal(nextCompletions, 0)
  for (let index = 0; index < 4; index += 1) nextClock.runNext()
  assert.equal(nextCompletions, 0)
  nextClock.runNext()
  assert.equal(nextCompletions, 1)
})

test('cancelling a prompt prevents an old timer from affecting the next prompt', () => {
  const clock = fakeScheduler()
  let completions = 0
  const countdown = createPracticeCountdown(5, () => undefined, () => { completions += 1 }, clock.scheduler)
  countdown.cancel()
  assert.equal(clock.pendingCount, 0)
  assert.equal(clock.runNext(), false)
  assert.equal(completions, 0)
})

test('an external replay action does not reset or complete the countdown', () => {
  const clock = fakeScheduler()
  const ticks: number[] = []
  let completions = 0
  let replays = 0
  createPracticeCountdown(3, (seconds) => ticks.push(seconds), () => { completions += 1 }, clock.scheduler)
  clock.runNext()
  replays += 1
  assert.deepEqual(ticks, [3, 2])
  assert.equal(completions, 0)
  assert.equal(clock.pendingCount, 1)
  clock.runNext()
  clock.runNext()
  assert.equal(replays, 1)
  assert.deepEqual(ticks, [3, 2, 1, 0])
  assert.equal(completions, 1)
})

test('only show-and-copy prompts expose a word during the writing frame', () => {
  assert.equal(wordIsVisibleDuringWriting('show-copy'), true)
  assert.equal(wordIsVisibleDuringWriting('true-bm'), false)
  assert.equal(wordIsVisibleDuringWriting('earned-bm'), false)
  assert.equal(wordIsVisibleDuringWriting('target'), false)
  assert.equal(wordIsVisibleDuringWriting(undefined), false)
})

test('practice counters use the active segment queue and Acquisition target index', () => {
  assert.deepEqual(practicePosition(session()), { label: 'Warmup 1', total: 6 })
  assert.deepEqual(practicePosition(session({ index: 5, stage: 'review' })), { label: 'Warmup 6', total: 6 })
  assert.deepEqual(practicePosition(session({ segment: 'primary', queue: Array.from({ length: 5 }, (_, index) => word(index + 10)), index: 2 })), { label: 'Word 3', total: 5 })
  assert.deepEqual(practicePosition(session({ segment: 'primary', primaryPhase: 'acquisition', acquisition: { targetIndex: 1 } as PracticeSession['acquisition'] })), { label: 'Word 2', total: 5 })
  assert.deepEqual(practicePosition(session({ stage: 'complete' })), { label: 'Test complete', total: null })
})
