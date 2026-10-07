import { strict as assert } from 'node:assert'
import test from 'node:test'
import {
  isConnectionFailure,
  isFamilyAccessDenied,
  offlineFamilyKey,
  readOfflineFamily,
  rememberOfflineFamily,
} from '../src/familyBeta/offlineFamily.ts'

function fixture() {
  const records = new Map<string, string>()
  const storage = {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, raw: string) => {
      records.set(key, raw)
    },
    removeItem: (key: string) => {
      records.delete(key)
    },
  }
  const children = [{ id: 'child', grade: 'Grade 5' as const, active: true, nickname: 'Learner' }]
  return { storage, children }
}
test('offline access requires a confirmed child sync, stays owner-scoped, and has no credentials', () => {
  const { storage, children } = fixture()
  rememberOfflineFamily(storage, 'parent', 'family', children)
  assert.deepEqual(readOfflineFamily(storage, 'parent')?.ready, [])
  rememberOfflineFamily(storage, 'parent', 'family', children, 'child')
  assert.deepEqual(readOfflineFamily(storage, 'parent')?.ready, ['child'])
  assert.equal(readOfflineFamily(storage, 'other'), null)
  assert.equal(storage.getItem(offlineFamilyKey('parent'))?.includes('token'), false)
  storage.removeItem(offlineFamilyKey('parent'))
  assert.equal(readOfflineFamily(storage, 'parent'), null)
})
test('confirmed profile grade changes, deactivation and family reassignment revoke offline readiness', () => {
  for (const change of ['grade', 'active', 'family']) {
    const { storage, children } = fixture()
    rememberOfflineFamily(storage, 'parent', 'family', children, 'child')
    rememberOfflineFamily(
      storage,
      'parent',
      change === 'family' ? 'new-family' : 'family',
      children.map((p) => ({
        ...p,
        ...(change === 'grade' ? { grade: 'Grade 2' as const } : {}),
        ...(change === 'active' ? { active: false } : {}),
      })),
    )
    assert.deepEqual(readOfflineFamily(storage, 'parent')?.ready, [])
  }
})
test('malformed/cross-owner bootstrap and unconfirmed storage are not accepted', () => {
  const { storage, children } = fixture()
  for (const raw of [
    '{',
    'null',
    JSON.stringify({ schema: 1, uid: 'other', familyId: 'family', profiles: children, ready: ['child'] }),
  ]) {
    storage.setItem(offlineFamilyKey('parent'), raw)
    assert.equal(readOfflineFamily(storage, 'parent'), null)
  }
  assert.throws(
    () => rememberOfflineFamily({ ...storage, setItem: () => {} }, 'parent', 'family', children),
    /could not be retained/,
  )
})
test('permission/credential/content errors are not classified as network outages', () => {
  assert.equal(isConnectionFailure(new TypeError('Failed to fetch')), true)
  assert.equal(isConnectionFailure(new DOMException('timed out', 'TimeoutError')), true)
  for (const status of [408, 429, 500, 502, 503, 504]) {
    const error = Object.assign(new Error('Temporary service failure'), { status })
    assert.equal(isConnectionFailure(error), true)
    assert.equal(isFamilyAccessDenied(error), false)
  }
  for (const status of [401, 403]) {
    const error = Object.assign(new Error('Denied'), { status })
    assert.equal(isConnectionFailure(error), false)
    assert.equal(isFamilyAccessDenied(error), true)
  }
  for (const error of [
    new Error('PERMISSION_DENIED'),
    new Error('USER_DISABLED'),
    new SyntaxError('invalid JSON'),
    new TypeError('undefined field'),
  ])
    assert.equal(isConnectionFailure(error), false)
})
