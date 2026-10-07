import assert from 'node:assert/strict'
import test from 'node:test'
import { AuthRequestError, createTokenProvider, type StoredAuth } from '../src/auth/tokenRefresh.ts'

const initial: StoredAuth = {
  idToken: 'old',
  refreshToken: 'refresh',
  expiresAt: 0,
  user: { uid: 'parent-a', email: 'a@example.invalid' },
}
const refreshed = { id_token: 'new', refresh_token: 'new-refresh', expires_in: '3600', user_id: 'parent-a' }

test('an expired identity without a refresh credential still requires sign-in', async () => {
  let stored: StoredAuth | null = { ...initial, refreshToken: undefined }
  const token = createTokenProvider({
    read: () => stored,
    write: (value) => {
      stored = value
    },
    renew: async () => {
      assert.fail('No renewal without a credential')
    },
  })
  await assert.rejects(token(), /Your session expired/)
  assert.equal(stored, null)
})

for (const error of [
  new TypeError('Failed to fetch'),
  new DOMException('Timed out', 'TimeoutError'),
  new AuthRequestError(429, 'TOO_MANY_ATTEMPTS_TRY_LATER'),
  new AuthRequestError(503, 'UNAVAILABLE'),
]) {
  test(`transient renewal ${error.message} retains local identity but never returns an expired token`, async () => {
    let stored: StoredAuth | null = initial
    let offline = true
    const token = createTokenProvider({
      read: () => stored,
      write: (value) => {
        stored = value
      },
      now: () => 1000,
      renew: async () => {
        if (offline) throw error
        return refreshed
      },
    })
    await assert.rejects(token(), error)
    assert.equal(stored, initial)
    offline = false
    assert.equal(await token(), 'new')
    assert.equal(stored?.expiresAt, 3601000)
  })
}

for (const code of ['TOKEN_EXPIRED', 'USER_DISABLED', 'USER_NOT_FOUND', 'INVALID_REFRESH_TOKEN']) {
  test(`confirmed ${code} locks the invalid family identity`, async () => {
    let stored: StoredAuth | null = initial
    const token = createTokenProvider({
      read: () => stored,
      write: (value) => {
        stored = value
      },
      renew: async () => {
        throw new AuthRequestError(400, code)
      },
    })
    await assert.rejects(token())
    assert.equal(stored, null)
  })
}

test('concurrent renewal is single-flight and a late success cannot undo sign-out', async () => {
  let stored: StoredAuth | null = initial
  let resolve!: (body: typeof refreshed) => void
  let calls = 0
  const token = createTokenProvider({
    read: () => stored,
    write: (value) => {
      stored = value
    },
    renew: () => {
      calls++
      return new Promise((done) => {
        resolve = done
      })
    },
  })
  const a = token(),
    b = token()
  await Promise.resolve()
  assert.equal(calls, 1)
  stored = null
  resolve(refreshed)
  await assert.rejects(a, /account changed/)
  await assert.rejects(b, /account changed/)
  assert.equal(stored, null)
})

test('a late invalidation cannot sign out a replacement account', async () => {
  let stored: StoredAuth | null = initial
  let reject!: (error: Error) => void
  const token = createTokenProvider({
    read: () => stored,
    write: (value) => {
      stored = value
    },
    renew: () =>
      new Promise((_, fail) => {
        reject = fail
      }),
  })
  const pending = token()
  await Promise.resolve()
  const replacement = { ...initial, user: { uid: 'parent-b', email: 'b@example.invalid' } }
  stored = replacement
  reject(new AuthRequestError(400, 'USER_DISABLED'))
  await assert.rejects(pending)
  assert.equal(stored, replacement)
})

test('malformed or mismatched renewal never grants cloud access', async () => {
  let stored: StoredAuth | null = initial
  for (const body of [
    { ...refreshed, user_id: 'another-parent' },
    { ...refreshed, expires_in: 'invalid' },
    { ...refreshed, id_token: '' },
  ]) {
    const token = createTokenProvider({
      read: () => stored,
      write: (value) => {
        stored = value
      },
      renew: async () => body,
    })
    await assert.rejects(token(), /could not be verified/)
    assert.equal(stored, initial)
  }
})
