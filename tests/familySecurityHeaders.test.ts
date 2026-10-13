import assert from 'node:assert/strict'
import test from 'node:test'
import { familySecurityHeaders } from '../scripts/familySecurityHeaders.ts'

test('canonical policy permits internal frames but denies foreign ancestors and plugins', () => {
  const headers = familySecurityHeaders(['assets/app-Abcd_123.js', 'assets/style-Abcd-123.css'])
  assert.match(
    headers,
    /Content-Security-Policy: base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'/,
  )
  assert.match(headers, /X-Frame-Options: SAMEORIGIN/)
  assert.match(headers, /Cross-Origin-Opener-Policy: same-origin-allow-popups/)
  assert.doesNotMatch(headers, /frame-ancestors 'none'|X-Frame-Options: DENY/)
})

test('strict resource policy is explicitly diagnostic with no remote report collector', () => {
  const headers = familySecurityHeaders([])
  assert.match(headers, /Content-Security-Policy-Report-Only: default-src 'self'/)
  assert.match(headers, /frame-src 'self'/)
  assert.match(headers, /media-src 'self' blob:/)
  assert.match(headers, /worker-src 'self' blob:/)
  assert.doesNotMatch(headers, /report-uri|report-to|Reporting-Endpoints|unsafe-eval|includeSubDomains|preload/)
  assert.ok(headers.split('\n').every((line) => line.length <= 2000))
})

test('immutable assets detach the inherited cache header before setting one policy', () => {
  const headers = familySecurityHeaders(['assets/module-Qwer1234.js'])
  assert.match(headers, /\/\*\n  Cache-Control: no-store/)
  assert.match(
    headers,
    /\/assets\/module-Qwer1234.js\n  ! Cache-Control\n  Cache-Control: public, max-age=31536000, immutable/,
  )
  assert.doesNotMatch(headers, /\/assets\/\*/)
})

test('exact immutable paths are deduplicated and fail closed at the provider rule limit', () => {
  const paths = Array.from({ length: 99 }, (_, index) => `assets/module${index}-Abcd1234.js`)
  assert.equal(familySecurityHeaders([...paths, paths[0]]), familySecurityHeaders(paths.reverse()))
  assert.throws(() => familySecurityHeaders([...paths, 'assets/extra-Abcd1234.js']), /100-rule/)
  assert.equal(
    familySecurityHeaders([...paths, 'assets/curriculum-Abcd1234.json', 'assets/image-Abcd1234.webp']),
    familySecurityHeaders(paths),
  )
})

test('unknown, unhashed, nested and injection asset names refuse header generation', () => {
  for (const path of [
    'assets/app.js',
    'assets/private.json',
    'assets/sub/app-Qwer1234.js',
    '../app-Qwer1234.js',
    'assets/app-Qwer1234.js\n/*',
    'assets/app-Qwer1234.html',
  ])
    assert.throws(() => familySecurityHeaders([path]), /content-hashed/)
})
