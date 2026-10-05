import { spawnSync } from 'node:child_process'

const EXCEPTION_EXPIRES = '2026-11-04'
const EXPECTED_ADVISORIES = new Set([1153174, 1240853, 1240992, 1119441])
const EXPECTED_TOOL = 'firebase-tools'
const EXPECTED_FINDINGS = new Set([
  '@google-cloud/pubsub',
  '@opentelemetry/core',
  'basic-ftp',
  'braces',
  'chokidar',
  'firebase-tools',
  'gaxios',
  'get-uri',
  'pac-proxy-agent',
  'proxy-agent',
  'uuid',
])

type AuditFinding = {
  isDirect?: boolean
  effects?: string[]
  via?: Array<string | { source?: number }>
}

type AuditReport = {
  vulnerabilities?: Record<string, AuditFinding>
  metadata?: { vulnerabilities?: Record<string, number> }
}

if (new Date().toISOString().slice(0, 10) > EXCEPTION_EXPIRES) {
  throw new Error(
    `The firebase-tools audit exception expired on ${EXCEPTION_EXPIRES}. Re-audit and renew or remove it.`,
  )
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

const findings = report.vulnerabilities || {}
const direct = Object.entries(findings).filter(([, finding]) => finding.isDirect)
if (direct.some(([name]) => name !== EXPECTED_TOOL) || direct.length > 1) {
  throw new Error(
    `Unexpected directly vulnerable development dependency: ${direct.map(([name]) => name).join(', ') || 'none'}.`,
  )
}
const unexpectedFindings = Object.keys(findings).filter((name) => !EXPECTED_FINDINGS.has(name))
if (unexpectedFindings.length > 0) {
  throw new Error(`Unexpected vulnerable package outside the accepted tool chain: ${unexpectedFindings.join(', ')}.`)
}

const observedAdvisories = new Set(
  Object.values(findings).flatMap((finding) =>
    (finding.via || []).flatMap((via) => (typeof via === 'object' && via.source ? [via.source] : [])),
  ),
)
const unexpectedAdvisories = [...observedAdvisories].filter((source) => !EXPECTED_ADVISORIES.has(source))
if (unexpectedAdvisories.length > 0) {
  throw new Error(`Unexpected toolchain advisories: ${unexpectedAdvisories.join(', ')}.`)
}
const counts = report.metadata?.vulnerabilities || {}
if ((counts.critical || 0) > 0 || (counts.high || 0) > 7 || (counts.moderate || 0) > 4 || (counts.total || 0) > 11) {
  throw new Error(`Toolchain vulnerability count exceeded the accepted boundary: ${JSON.stringify(counts)}.`)
}

if (result.status === 0) {
  console.log('Development toolchain audit passed with no findings; the temporary exception can be removed.')
} else {
  console.log(
    `Development toolchain exception verified: ${counts.total || 0} findings are confined to ${EXPECTED_TOOL}; expires ${EXCEPTION_EXPIRES}.`,
  )
}
