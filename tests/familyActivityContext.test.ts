import assert from 'node:assert/strict'
import test from 'node:test'
import { isFamilyActivityContext } from '../src/familyBeta/context.ts'

test('explicit family and embedded activity contexts are independent of URL spelling', () => {
  const base = { enabled: true, embedded: false, requested: false }
  assert.equal(isFamilyActivityContext({ ...base, pageRole: 'family' }), true)
  assert.equal(
    isFamilyActivityContext({ ...base, pageRole: 'activity', embedded: true, requested: true, parentRole: 'family' }),
    true,
  )
  assert.equal(isFamilyActivityContext({ ...base, pageRole: 'activity', requested: true }), false)
  assert.equal(isFamilyActivityContext({ ...base, pageRole: 'activity', embedded: true, requested: true }), false)
  assert.equal(isFamilyActivityContext({ ...base, embedded: true, requested: true, parentRole: 'family' }), false)
  assert.equal(isFamilyActivityContext({ ...base, pageRole: 'family', enabled: false }), false)
})
