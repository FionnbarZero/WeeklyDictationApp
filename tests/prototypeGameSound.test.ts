import assert from 'node:assert/strict'
import test from 'node:test'
import { activityClock } from '../src/activity/activityLifecycle.ts'
import { playGameSound as matchSound } from '../src/learningModules/speed-match/runtime/gameFeel.ts'
import { playGameSound as sushiSound } from '../src/learningModules/sushi-scramble/runtime/gameFeel.ts'

for (const [name, play] of [
  ['Shuriken', matchSound],
  ['Sushi', sushiSound],
] as const) {
  test(`${name}: report closure during a rejected WebKit resume cannot reject outside the sound enhancement`, async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
    let resumed = 0
    let closed = 0
    const param = { setValueAtTime() {}, exponentialRampToValueAtTime() {} }
    class Context {
      state = 'suspended'
      currentTime = 0
      destination = {}
      resume() {
        resumed++
        return Promise.reject(new Error('InvalidStateError: Context is closed'))
      }
      close() {
        closed++
        return Promise.resolve()
      }
      createOscillator() {
        return { frequency: param, connect() {}, disconnect() {}, start() {}, stop() {} }
      }
      createGain() {
        return { gain: param, connect() {}, disconnect() {} }
      }
    }
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { AudioContext: Context } })
    try {
      play('incorrect')
      activityClock.setPaused('sound-regression', true)
      await new Promise((resolve) => setImmediate(resolve))
      assert.equal(resumed, 1)
      assert.equal(closed, 1)
    } finally {
      activityClock.setPaused('sound-regression', false)
      if (descriptor) Object.defineProperty(globalThis, 'window', descriptor)
      else Reflect.deleteProperty(globalThis, 'window')
    }
  })
}
