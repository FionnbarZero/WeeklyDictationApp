import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import test from 'node:test'

const zeroCounts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 }

function auditResponse(stdout: string, status = 0) {
  const directory = mkdtempSync(join(tmpdir(), 'toolchain-audit-test-'))
  try {
    writeFileSync(
      join(directory, 'npm'),
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(stdout)}); process.exit(${status});\n`,
      { mode: 0o700 },
    )
    return spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/audit-toolchain.ts'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${directory}${delimiter}${process.env.PATH || ''}` },
    })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('toolchain audit accepts a completed audit with zero vulnerabilities and no exception', () => {
  const result = auditResponse(JSON.stringify({ vulnerabilities: {}, metadata: { vulnerabilities: zeroCounts } }))
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /zero findings/)
})

test('toolchain audit rejects findings even when the audit process reports success', () => {
  for (const status of [0, 1]) {
    const result = auditResponse(
      JSON.stringify({
        vulnerabilities: { dependency: {} },
        metadata: { vulnerabilities: { ...zeroCounts, high: 1, total: 1 } },
      }),
      status,
    )
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Unresolved dependency vulnerabilities/)
  }
})

test('toolchain audit does not accept incomplete, inconsistent or malformed audit results', () => {
  for (const report of [
    'not JSON',
    '{}',
    'null',
    JSON.stringify({ vulnerabilities: {}, metadata: { vulnerabilities: { total: 0 } } }),
    JSON.stringify({ vulnerabilities: {}, metadata: { vulnerabilities: { ...zeroCounts, total: -1 } } }),
    JSON.stringify({ vulnerabilities: {}, metadata: { vulnerabilities: { ...zeroCounts, high: 1 } } }),
    JSON.stringify({ vulnerabilities: { dependency: {} }, metadata: { vulnerabilities: zeroCounts } }),
  ]) {
    assert.notEqual(auditResponse(report).status, 0)
  }
})

test('toolchain audit fails when npm cannot complete, even if its output claims no findings', () => {
  const report = JSON.stringify({ vulnerabilities: {}, metadata: { vulnerabilities: zeroCounts } })
  assert.match(auditResponse(report, 2).stderr, /npm audit could not complete/)
  assert.notEqual(auditResponse(report, 1).status, 0)
})
