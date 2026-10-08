import assert from 'node:assert/strict'
import test from 'node:test'
import { ownedPracticeRecord } from '../src/familyBeta/deviceSync.ts'
import { deviceWriter } from '../src/familyBeta/deviceWriter.ts'

test('installation identity is stable and excluded from uploaded child practice', () => {
  const records = new Map<string, string>()
  const storage = {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value)
    },
  }
  assert.equal(
    deviceWriter(storage, () => 'device-one'),
    'device-one',
  )
  assert.equal(
    deviceWriter(storage, () => 'device-two'),
    'device-one',
  )
  for (const [key, raw] of records) assert.equal(ownedPracticeRecord(key, raw, 'child'), false)
})

test('malformed or unretained installation identities fail without silently replacing them', () => {
  assert.throws(
    () => deviceWriter({ getItem: () => 'invalid/id', setItem: () => assert.fail('write') }),
    /Nothing was erased/,
  )
  assert.throws(() => deviceWriter({ getItem: () => null, setItem: () => {} }, () => 'writer'), /could not be saved/)
})
