import { spawnSync } from 'node:child_process'

type AuditReport = {
  vulnerabilities?: Record<string, unknown>
  metadata?: { vulnerabilities?: Record<string, number> }
}

const result = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8' })
if (result.error) throw result.error
if (![0, 1].includes(result.status ?? -1)) {
  throw new Error(`npm audit could not complete. ${result.stderr.trim()}`)
}

let report: AuditReport
try {
  report = JSON.parse(result.stdout) as AuditReport
} catch {
  throw new Error('npm audit did not return valid JSON.')
}

const findings = report?.vulnerabilities
const counts = report?.metadata?.vulnerabilities
const severities = ['info', 'low', 'moderate', 'high', 'critical'] as const
if (
  !findings ||
  typeof findings !== 'object' ||
  Array.isArray(findings) ||
  !counts ||
  [...severities, 'total'].some((severity) => !Number.isInteger(counts[severity]) || counts[severity] < 0) ||
  severities.reduce((total, severity) => total + counts[severity], 0) !== counts.total
) {
  throw new Error('npm audit did not return a complete, consistent vulnerability report.')
}
if (result.status !== 0 || counts.total !== 0 || Object.keys(findings).length !== 0) {
  throw new Error(`Unresolved dependency vulnerabilities: ${JSON.stringify(counts)}. No audit exceptions apply.`)
}

console.log('Development toolchain audit passed with zero findings. No audit exceptions apply.')
