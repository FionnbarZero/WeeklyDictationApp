import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isDeviceTestAccount } from '../src/deviceAcceptance/policy.ts'

test('device acceptance uses separate synthetic accounts, never a real parent address', () => {
  assert.equal(isDeviceTestAccount('ninja-device-meghan-oct27@example.invalid'), true)
  assert.equal(isDeviceTestAccount('ninja-writing-12345678-abcd-abcd-abcd-123456789012@example.invalid'), true)
  for (const email of [
    'meghan.oreillygreen@gmail.com',
    'synthetic@example.invalid',
    'ninja-device-x@example.invalid',
    'ninja-device-ok@gmail.com',
    'x+ninja-device-abc@example.invalid',
    'ninja-device-abc@example.invalid.evil',
  ])
    assert.equal(isDeviceTestAccount(email), false)
})

test('a changed browser display email cannot admit a real parent token', async () => {
  const { isDeviceTestIdentity } = await import('../src/deviceAcceptance/policy.ts')
  const user = { uid: 'test-parent', email: 'ninja-device-fixture@example.invalid' }
  const claims = {
    sub: user.uid,
    email: user.email,
    aud: 'weeklydictationapp',
    iss: 'https://securetoken.google.com/weeklydictationapp',
  }
  const token = (value: unknown) => `synthetic.${btoa(JSON.stringify(value))}.test-only`
  assert.equal(isDeviceTestIdentity(token(claims), user), true)
  for (const changed of [
    { ...claims, email: 'parent@example.com' },
    { ...claims, sub: 'another-parent' },
    { ...claims, aud: 'another-project' },
    { ...claims, iss: 'https://example.com' },
  ])
    assert.equal(isDeviceTestIdentity(token(changed), user), false)
  assert.equal(isDeviceTestIdentity('invalid', user), false)
})
