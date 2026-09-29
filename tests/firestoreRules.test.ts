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
