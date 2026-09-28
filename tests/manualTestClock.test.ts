import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveManualTestClock } from '../src/manualTestClock.ts'

test('development accepts a valid manual test date', () => {
  const clock = resolveManualTestClock('?testDate=2026-09-23', true)

  assert.ok(clock)
  assert.equal(clock.dateKey, '2026-09-23')
  assert.equal(clock.label, 'Testing as September 23, 2026')
  assert.equal(clock.now().toISOString(), '2026-09-23T12:00:00.000Z')
})

test('production ignores the manual test date parameter', () => {
  assert.equal(resolveManualTestClock('?testDate=2026-09-23', false), null)
})

test('development ignores missing, malformed, and impossible test dates', () => {
  assert.equal(resolveManualTestClock('', true), null)
  assert.equal(resolveManualTestClock('?testDate=09-23-2026', true), null)
  assert.equal(resolveManualTestClock('?testDate=2026-02-31', true), null)
})
