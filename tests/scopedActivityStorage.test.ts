import assert from 'node:assert/strict'
import test from 'node:test'
import { scopedActivityStorage } from '../src/activity/scopedStorage.ts'

function memory(): Storage {
  const records = new Map<string, string>()
  return {
    get length() {
      return records.size
    },
    key: (i) => [...records.keys()][i] ?? null,
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => {
      records.set(key, value)
    },
    removeItem: (key) => {
      records.delete(key)
    },
    clear: () => records.clear(),
  }
}

test('a paused legacy checkpoint cannot overwrite another document’s newer saved work', () => {
  const storage = memory()
  const a = scopedActivityStorage(storage, 'child-a:')
  const b = scopedActivityStorage(storage, 'child-a:')
  const key = 'weekly-dictation-state-v2'
  a.setItem(key, 'original')
  assert.equal(b.getItem(key), 'original')
  a.setItem(key, 'new reviewed work')
  assert.throws(() => b.setItem(key, 'stale attempt'), /nothing was overwritten/)
  assert.equal(a.getItem(key), 'new reviewed work')
  // Exact retries are harmless; an explicit fresh read allows normal saving.
  b.setItem(key, 'new reviewed work')
  assert.equal(b.getItem(key), 'new reviewed work')
  b.setItem(key, 'next reviewed work')
  assert.equal(a.getItem(key), 'next reviewed work')
})

test('fixed activity scope isolates each child even when both use the same legacy key', () => {
  const storage = memory()
  const a = scopedActivityStorage(storage, 'child-a:')
  const b = scopedActivityStorage(storage, 'child-b:')
  a.setItem('weekly-dictation-state-v2', 'a')
  b.setItem('weekly-dictation-state-v2', 'b')
  a.clear()
  assert.equal(a.length, 0)
  assert.equal(b.getItem('weekly-dictation-state-v2'), 'b')
})
