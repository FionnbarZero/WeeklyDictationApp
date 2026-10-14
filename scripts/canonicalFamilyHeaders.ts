import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ProviderVersion, ReleaseRecord } from './canonicalFamilyRelease.ts'
import { familySecurityHeaders } from './familySecurityHeaders.ts'

export const legacyFamilyHeaders = `/*
  Cache-Control: no-store
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), geolocation=(), microphone=(self)
/assets/*
  Cache-Control: public, max-age=31536000, immutable
`
export type ParsedFamilyHeaders = {
  version: 2
  rules: Record<string, { set: Record<string, string>; unset: string[] }>
}
export type FamilyHeaderPolicy = { raw: string; rawSha256: string; parsed: ParsedFamilyHeaders }
type BoundPolicy = { sourceRevision: string; fileTreeSha256: string; policy: FamilyHeaderPolicy }
export type FamilyHeaderTransition = {
  schema: 1
  target: { origin: string; worker: string; account: string; wrangler: string; firebaseProject: string }
  previous: {
    version: string
    sourceRevision: string
    fileTreeSha256: string
    resources: ProviderVersion['resources']
  }
  candidate: BoundPolicy
  recovery: BoundPolicy
  receipts: { independentReview: string; securityApproval: string }
}
export function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex')
}
export function readHashBoundReceipt(reference: string) {
  const separator = reference.lastIndexOf('#sha256=')
  if (separator <= 0 || !/^[a-f0-9]{64}$/.test(reference.slice(separator + 8)))
    throw new Error('Supply a hash-bound receipt.')
  const bytes = readFileSync(reference.slice(0, separator))
  assert.equal(sha256(bytes), reference.slice(separator + 8), 'Receipt changed after review.')
  return bytes
}
function object(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'Expected policy metadata object.')
  return value as Record<string, unknown>
}
/** Provider representations may omit empty unset arrays or retain header-name
 * casing. Normalize only those semantic equivalents; reject all unknown fields. */
export function normalizeParsedHeaders(value: unknown): ParsedFamilyHeaders {
  const parsed = object(value)
  assert.deepEqual(Object.keys(parsed).sort(), ['rules', 'version'], 'Unexpected parsed-policy fields.')
  assert.equal(parsed.version, 2, 'Unsupported parsed-policy version.')
  const rules: ParsedFamilyHeaders['rules'] = {}
  for (const [path, rawRule] of Object.entries(object(parsed.rules))) {
    const rule = object(rawRule)
    assert.ok(
      Object.keys(rule).every((key) => key === 'set' || key === 'unset'),
      'Unexpected header-rule fields.',
    )
    const set: Record<string, string> = {}
    for (const [key, value] of Object.entries(object(rule.set === undefined ? {} : rule.set))) {
      const name = key.toLowerCase()
      assert.match(name, /^[a-z][a-z0-9-]*$/)
      assert.ok(!Object.hasOwn(set, name), 'Duplicate header name.')
      assert.equal(typeof value, 'string')
      assert.ok(value && !/[\r\n]/.test(value as string), 'Invalid header value.')
      set[name] = value as string
    }
    const rawUnset = rule.unset === undefined ? [] : rule.unset
    assert.ok(Array.isArray(rawUnset), 'Expected unset array.')
    const unset = (rawUnset as unknown[])
      .map((name) => {
        assert.equal(typeof name, 'string')
        assert.match(name as string, /^[A-Za-z][A-Za-z0-9-]*$/)
        return (name as string).toLowerCase()
      })
      .sort()
    assert.equal(new Set(unset).size, unset.length, 'Duplicate unset header.')
    assert.ok(path.startsWith('/') && path !== '/__proto__', 'Invalid header path.')
    rules[path] = { set, unset }
  }
  return { version: 2, rules }
}
/** Not a general Cloudflare parser: accept only the two reviewed generators.
 * Unsupported directives or arbitrary policy text require another code review. */
export function familyHeaderPolicy(raw: string, assetPaths: readonly string[]): FamilyHeaderPolicy {
  assert.ok(raw === legacyFamilyHeaders || raw === familySecurityHeaders(assetPaths), 'Unreviewed header policy.')
  const rules: ParsedFamilyHeaders['rules'] = {}
  let current: ParsedFamilyHeaders['rules'][string] | undefined
  for (const source of raw.split('\n')) {
    const line = source.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('/')) {
      assert.ok(!Object.hasOwn(rules, line), 'Duplicate header path.')
      current = { set: {}, unset: [] }
      rules[line] = current
    } else {
      assert.ok(current)
      if (line.startsWith('! ')) current.unset.push(line.slice(2).toLowerCase())
      else {
        const separator = line.indexOf(': ')
        assert.ok(separator > 0)
        current.set[line.slice(0, separator).toLowerCase()] = line.slice(separator + 2)
      }
    }
  }
  return { raw, rawSha256: sha256(raw), parsed: normalizeParsedHeaders({ version: 2, rules }) }
}
export function packageHeaderPolicy(directory: string): FamilyHeaderPolicy {
  const manifest = JSON.parse(readFileSync(join(directory, 'family-beta-manifest.json'), 'utf8'))
  return familyHeaderPolicy(
    readFileSync(join(directory, '_headers'), 'utf8'),
    manifest.files.map((file: { path: string }) => file.path).filter((path: string) => path.startsWith('assets/')),
  )
}
function runtimeAssets(resources: ProviderVersion['resources']) {
  return object(object(resources.script_runtime).assets)
}
export function transitionScopeHash(transition: FamilyHeaderTransition) {
  const { receipts: _receipts, ...scope } = transition
  return sha256(JSON.stringify(scope))
}
export function verifyHeaderTransition(record: ReleaseRecord, destination: FamilyHeaderTransition['target']) {
  const transition = record.headerTransition
  if (transition === undefined) return
  assert.equal(transition.schema, 1, 'Unknown header-transition schema.')
  assert.deepEqual(transition.target, destination, 'Wrong header-transition hosting target.')
  const { resources, ...previous } = transition.previous
  assert.deepEqual(previous, record.previous, 'Header transition belongs to another predecessor.')
  assert.deepEqual(resources.bindings, [], 'Header transition cannot add shared bindings.')
  const assets = runtimeAssets(resources)
  assert.equal(object(resources.script_runtime).compatibility_date, '2026-10-04')
  const policies = {
    candidate: packageHeaderPolicy(record.candidate.directory),
    recovery: packageHeaderPolicy(record.recovery.directory),
  }
  assert.equal(assets.raw_headers, policies.recovery.raw, 'Recovery does not retain the baseline raw policy.')
  assert.deepEqual(normalizeParsedHeaders(assets.headers), policies.recovery.parsed, 'Baseline parsed policy differs.')
  for (const kind of ['candidate', 'recovery'] as const) {
    assert.deepEqual(
      transition[kind],
      {
        sourceRevision: record[kind].sourceRevision,
        fileTreeSha256: record[kind].fileTreeSha256,
        policy: policies[kind],
      },
      `Header transition does not identify the exact ${kind} policy/package.`,
    )
  }
  for (const kind of ['independentReview', 'securityApproval'] as const) {
    const receipt = JSON.parse(readHashBoundReceipt(transition.receipts[kind]).toString('utf8'))
    assert.equal(receipt.schema, 1)
    assert.equal(receipt.kind, kind)
    assert.equal(receipt.scope, 'canonical-header-transition')
    assert.equal(
      receipt.transitionSha256,
      transitionScopeHash(transition),
      'Policy approval/review belongs to another transition.',
    )
    assert.equal(receipt.approved, true, 'Policy approval/review is not affirmative.')
    assert.equal(typeof receipt.reference, 'string')
    assert.ok(receipt.reference.trim(), 'Human approval/review reference required.')
    if (kind === 'securityApproval')
      assert.deepEqual(
        receipt.grades,
        ['kindergarten', 'grade2', 'grade5'],
        'Three explicit security approvals required.',
      )
  }
}
export function assertTransitionBaseline(transition: FamilyHeaderTransition, version: ProviderVersion) {
  assert.equal(version.id, transition.previous.version, 'Wrong baseline version.')
  assert.deepEqual(version.resources, transition.previous.resources, 'Provider baseline changed after review.')
}
export function assertTransitionVersion(
  transition: FamilyHeaderTransition,
  kind: 'candidate' | 'recovery',
  version: ProviderVersion,
) {
  const expected = structuredClone(transition.previous.resources)
  const expectedAssets = runtimeAssets(expected)
  const policy = transition[kind].policy
  expectedAssets.raw_headers = policy.raw
  expectedAssets.headers = policy.parsed
  const actual = structuredClone(version.resources)
  // Only canonicalize supported header representation, never discard fields from
  // the surrounding assets/runtime/bindings objects (including unknown fields).
  runtimeAssets(actual).headers = normalizeParsedHeaders(runtimeAssets(actual).headers)
  assert.deepEqual(
    actual,
    expected,
    'Provider policy or unrelated runtime/bindings differ from the approved transition.',
  )
}
export function effectiveFamilyHeaders(policy: FamilyHeaderPolicy, path: string) {
  const result: Record<string, string> = {}
  for (const [pattern, rule] of Object.entries(policy.parsed.rules)) {
    if (pattern !== '/*' && pattern !== path && !(pattern === '/assets/*' && path.startsWith('/assets/'))) continue
    for (const name of rule.unset) delete result[name]
    for (const [name, value] of Object.entries(rule.set))
      result[name] = result[name] ? `${result[name]}, ${value}` : value
  }
  return result
}
export function assertServedFamilyHeaders(policy: FamilyHeaderPolicy, path: string, headers: Headers) {
  const expected = effectiveFamilyHeaders(policy, path)
  // Also detect a stale/new policy on recovery where those protections should
  // be absent, not merely the presence of a subset of expected headers.
  for (const name of new Set([
    ...Object.keys(expected),
    'content-security-policy',
    'content-security-policy-report-only',
    'x-frame-options',
    'cross-origin-opener-policy',
  ]))
    assert.equal(headers.get(name), expected[name] ?? null, `Served ${name} differs at ${path}.`)
}
