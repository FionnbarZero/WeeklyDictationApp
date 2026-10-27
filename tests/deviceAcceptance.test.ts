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
