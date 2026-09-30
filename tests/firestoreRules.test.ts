import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')

test('DT observation rules accept canonical Familiar writes and migration-era legacy writes', () => {
  const poolTypeRule = rules.match(/request\.resource\.data\.poolType in \[([^\]]+)\]/)?.[1] || ''
  assert.match(poolTypeRule, /'familiar'/)
  assert.match(poolTypeRule, /'earned'/)
  assert.match(poolTypeRule, /'established'/)
})

test('versioned Acquisition writes require monotonic revisions and immutable transition receipts', () => {
  assert.match(rules, /request\.resource\.data\.contractId == 'acquisition-persistence-v1'/)
  assert.match(rules, /request\.resource\.data\.revision == resource\.data\.revision \+ 1/)
  assert.match(rules, /match \/acquisitionTransitions\/\{transitionId\}/)
  assert.match(rules, /validAcquisitionReceiptShape\(request\.resource\.data\.progressionId, transitionId\)/)
  assert.match(rules, /getAfter\([^\n]+acquisitionProgressions/)
  assert.match(rules, /allow update, delete: if false;/)
})

test('transition-linked attempts and DT observations are immutable and require the receipt in the atomic write', () => {
  assert.match(rules, /function validOptionalAcquisitionTransition/)
  assert.match(rules, /getAfter\([^\n]+acquisitionTransitions/)
  assert.match(rules, /request\.resource\.data == resource\.data/)
})
