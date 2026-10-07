import assert from 'node:assert/strict'
import test from 'node:test'
import { createSharedWorkspace } from '../src/activity/sharedWorkspace.ts'

function harness() {
  const initial = { weeks: { a: 0, b: 0 }, scores: [] as string[] }
  let raw = JSON.stringify(initial)
  let denied = false
  const storage = {
    getItem: () => raw,
    setItem: (_: string, value: string) => {
      if (denied) throw new Error('quota')
      raw = value
    },
  }
  const owner = createSharedWorkspace(initial, storage, 'state')
  return {
    owner,
    initial,
    raw: () => raw,
    deny: (value: boolean) => {
      denied = value
    },
    external: (value: string) => {
      raw = value
    },
  }
}

test('retained weeks share the newest state and keep both independent results', () => {
  const { owner, initial, raw } = harness()
  let notifications = 0
  owner.subscribe(() => notifications++)
  const first = { weeks: { a: 1, b: 0 }, scores: ['a'] }
  assert.equal(owner.save(initial, first), true)
  const current = owner.getSnapshot().state
  const second = { weeks: { ...current.weeks, b: 1 }, scores: [...current.scores, 'b'] }
  assert.equal(owner.save(current, second), true)
  assert.deepEqual(JSON.parse(raw()), second)
  assert.equal(notifications, 2)
  // Late async setters may repeat their own confirmed result, never an older copy.
  assert.equal(owner.save(initial, second), true)
  assert.equal(owner.save(initial, first), false)
  assert.deepEqual(JSON.parse(raw()), second)
})

test('an external writer still fails closed; it is not silently merged or replaced', () => {
  const { owner, initial, external, raw } = harness()
  external('external-newer-copy')
  assert.equal(owner.save(initial, { ...initial, scores: ['local'] }), false)
  assert.equal(raw(), 'external-newer-copy')
  assert.equal(owner.getSnapshot().state, initial)
})

test('storage failure retains the in-session state and a later retry can persist it', () => {
  const { owner, initial, deny, raw } = harness()
  const next = { ...initial, scores: ['reviewed'] }
  deny(true)
  assert.equal(owner.save(initial, next), false)
  assert.equal(owner.getSnapshot().state, next)
  assert.match(owner.getSnapshot().error, /could not be saved/)
  assert.deepEqual(JSON.parse(raw()), initial)
  deny(false)
  assert.equal(owner.save(next, next), true)
  assert.equal(owner.getSnapshot().error, '')
  assert.deepEqual(JSON.parse(raw()), next)
})

test('closing an owner prevents delayed work from writing after discard or sign-out', () => {
  const { owner, initial, raw } = harness()
  owner.close()
  assert.equal(owner.save(initial, { ...initial, scores: ['late'] }), false)
  assert.deepEqual(JSON.parse(raw()), initial)
})
