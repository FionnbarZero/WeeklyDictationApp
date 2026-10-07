import assert from 'node:assert/strict'
import test from 'node:test'
import { ActivityClock } from '../src/activity/ActivityClock.ts'

function harness() {
  let time = 0,
    id = 0
  const pending = new Map<number, { due: number; run: () => void }>()
  const clock = new ActivityClock({
    now: () => time,
    schedule: (run, delay) => {
      pending.set(++id, { due: time + delay, run })
      return id
    },
    cancel: (handle) => {
      pending.delete(handle as number)
    },
  })
  const advance = (ms: number) => {
    const end = time + ms
    for (;;) {
      const next = [...pending].filter(([, task]) => task.due <= end).sort((a, b) => a[1].due - b[1].due)[0]
      if (!next) break
      time = next[1].due
      pending.delete(next[0])
      next[1].run()
    }
    time = end
  }
  return { clock, advance, pending }
}

test('overlapping report/navigation pauses retain the fractional remainder without catch-up', () => {
  const { clock, advance } = harness()
  let ticks = 0
  clock.setInterval(() => ticks++, 1000)
  advance(750)
  clock.setPaused('report', true)
  clock.setPaused('navigation', true)
  advance(5000)
  clock.setPaused('report', false)
  advance(5000)
  assert.equal(ticks, 0)
  assert.equal(clock.now(), 750)
  clock.setPaused('navigation', false)
  advance(249)
  assert.equal(ticks, 0)
  advance(1)
  assert.equal(ticks, 1)
  advance(1000)
  assert.equal(ticks, 2)
})

test('new tasks and animation frames wait for resume, cancelled work never runs', () => {
  const { clock, advance, pending } = harness()
  clock.setPaused('report', true)
  const cancelled = clock.setTimeout(() => assert.fail('cancelled callback'), 10)
  clock.clearTimeout(cancelled)
  let stamp = -1
  clock.requestAnimationFrame((time) => {
    stamp = time
  })
  advance(10_000)
  assert.equal(pending.size, 0)
  assert.equal(stamp, -1)
  clock.setPaused('report', false)
  advance(16)
  assert.equal(stamp, 16)
})

test('self-cancelling and self-pausing intervals do not duplicate scheduling', () => {
  const { clock, advance } = harness()
  let ticks = 0
  const id = clock.setInterval(() => {
    ticks++
    if (ticks === 1) clock.setPaused('callback', true)
    else clock.clearInterval(id)
  }, 10)
  advance(100)
  assert.equal(ticks, 1)
  clock.setPaused('callback', false)
  advance(100)
  assert.equal(ticks, 2)
})

test('waiting playback resumes only after all interruptions and can be aborted', async () => {
  const { clock } = harness()
  clock.setPaused('report', true)
  const controller = new AbortController()
  const cancelled = clock.waitUntilRunning(controller.signal)
  controller.abort()
  await assert.rejects(cancelled, /cancelled/)
  let resumed = false
  const ready = clock.waitUntilRunning().then(() => {
    resumed = true
  })
  clock.setPaused('navigation', true)
  clock.setPaused('report', false)
  await Promise.resolve()
  assert.equal(resumed, false)
  clock.setPaused('navigation', false)
  await ready
  assert.equal(resumed, true)
})
