import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertServedFamilyHeaders,
  effectiveFamilyHeaders,
  familyHeaderPolicy,
  legacyFamilyHeaders,
  normalizeParsedHeaders,
} from '../scripts/canonicalFamilyHeaders.ts'
import { familySecurityHeaders } from '../scripts/familySecurityHeaders.ts'

const paths = ['assets/app-Abcd1234.js', 'assets/style-Abcd1234.css', 'assets/curriculum-Abcd1234.json']
test('policy expectations are restricted to exact reviewed generators', () => {
  const policy = familyHeaderPolicy(familySecurityHeaders(paths), paths)
  assert.equal(Object.keys(policy.parsed.rules).length, 3)
  assert.deepEqual(policy.parsed.rules['/assets/app-Abcd1234.js'].unset, ['cache-control'])
  assert.equal(
    effectiveFamilyHeaders(policy, '/assets/app-Abcd1234.js')['cache-control'],
    'public, max-age=31536000, immutable',
  )
  for (const path of ['/family-game', '/assets/curriculum-Abcd1234.json', '/assets/missing.js'])
    assert.equal(effectiveFamilyHeaders(policy, path)['cache-control'], 'no-store')
  const legacy = familyHeaderPolicy(legacyFamilyHeaders, [])
  assert.equal(
    effectiveFamilyHeaders(legacy, '/assets/app-Abcd1234.js')['cache-control'],
    'no-store, public, max-age=31536000, immutable',
  )
  assert.throws(() => familyHeaderPolicy(familySecurityHeaders(paths) + '# added\n', paths), /Unreviewed/)
  assert.throws(
    () => familyHeaderPolicy(familySecurityHeaders(paths).replace('SAMEORIGIN', 'DENY'), paths),
    /Unreviewed/,
  )
  assert.throws(() => familyHeaderPolicy(familySecurityHeaders(paths), paths.slice(1)), /Unreviewed/)
})
test('parsed comparison accepts only harmless case and omitted-empty-list differences', () => {
  assert.deepEqual(
    normalizeParsedHeaders({
      version: 2,
      rules: { '/*': { set: { 'Cache-Control': 'no-store' } }, '/assets/test.js': { unset: ['Cache-Control'] } },
    }),
    {
      version: 2,
      rules: {
        '/*': { set: { 'cache-control': 'no-store' }, unset: [] },
        '/assets/test.js': { set: {}, unset: ['cache-control'] },
      },
    },
  )
  for (const input of [
    { version: 3, rules: {} },
    { version: 2, rules: {}, ignored: true },
    { version: 2, rules: { '/*': { newField: true } } },
    { version: 2, rules: { '/*': { set: null } } },
    { version: 2, rules: { '/*': { unset: null } } },
    { version: 2, rules: { '/*': { set: { 'X-Test': 'a', 'x-test': 'b' } } } },
    { version: 2, rules: { '/*': { unset: ['Cache-Control', 'cache-control'] } } },
    { version: 2, rules: { '/*': { set: { 'x-test': 'a\nb' } } } },
  ])
    assert.throws(() => normalizeParsedHeaders(input))
})
test('served verification detects omitted, stale and contradictory header policies', () => {
  const candidate = familyHeaderPolicy(familySecurityHeaders(paths), paths)
  const legacy = familyHeaderPolicy(legacyFamilyHeaders, [])
  const headers = new Headers(effectiveFamilyHeaders(candidate, '/'))
  assertServedFamilyHeaders(candidate, '/', headers)
  assert.throws(() => assertServedFamilyHeaders(legacy, '/', headers), /Served content-security-policy differs/)
  headers.delete('x-frame-options')
  assert.throws(() => assertServedFamilyHeaders(candidate, '/', headers), /Served x-frame-options differs/)
  const asset = new Headers(effectiveFamilyHeaders(candidate, '/assets/app-Abcd1234.js'))
  asset.set('cache-control', 'no-store, public, max-age=31536000, immutable')
  assert.throws(
    () => assertServedFamilyHeaders(candidate, '/assets/app-Abcd1234.js', asset),
    /Served cache-control differs/,
  )
})
