import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { artifactFileRecords, fileTreeSha256, requireFullGitRevision } from './familyBetaRelease.ts'
import { rollbackGuard } from './familyOfflineRollback.ts'

export const CANONICAL_FAMILY = {
  origin: 'https://ninjadojo.meghangames.com',
  worker: 'meghangames-ninjadojo',
  account: '4c11957e0121dba35fe2f16be80526f8',
  firebaseProject: 'weeklydictationapp',
  wrangler: '4.147.0',
} as const
export const FAMILY_GRADES = ['kindergarten', 'grade2', 'grade5'] as const
/** Keep supported credentials, not inherited provider routing/build/debug overrides.
 * Normal stored OAuth login and ordinary process settings remain available. */
export function canonicalProviderEnvironment(input: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const auth = new Set([
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_API_KEY',
    'CLOUDFLARE_EMAIL',
    'CF_API_TOKEN',
    'CF_API_KEY',
    'CF_EMAIL',
  ])
  const environment = Object.fromEntries(
    Object.entries(input).filter(([name]) => !/^(?:WRANGLER_|CLOUDFLARE_|CF_)/.test(name) || auth.has(name)),
  )
  return { ...environment, CLOUDFLARE_ACCOUNT_ID: CANONICAL_FAMILY.account, WRANGLER_SEND_METRICS: 'false' }
}
const hashPattern = /^[a-f0-9]{64}$/
const versionPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const entries = [
  'index.html',
  'family-beta-preview.html',
  'family-game.html',
  'kindergarten-learning-lab.html',
  'grade5-learning-hub.html',
]
export type PackageIdentity = { directory: string; sourceRevision: string; fileTreeSha256: string }
export type ReleaseRecord = {
  schema: 1
  candidate: PackageIdentity
  recovery: PackageIdentity
  previous: { sourceRevision: string; fileTreeSha256: string; version: string }
  approval: { sourceRevision: string; fileTreeSha256: string; grades: string[]; reference: string }
  evidence: {
    sourceRevision: string
    fileTreeSha256: string
    independentReview: string
    checks: string
    backend: string
    recovery: string
  }
}
export type ReleaseJournal = {
  recordSha256: string
  phase:
    | 'uploading-recovery'
    | 'uploading-candidate'
    | 'uploaded'
    | 'activating'
    | 'activated'
    | 'rolling-back'
    | 'rolled-back'
  recoveryVersion?: string
  candidateVersion?: string
}
export type ProviderVersion = {
  id: string
  annotations: Record<string, string>
  resources: { bindings: unknown[]; script_runtime: unknown }
}
export type ReleasePorts = {
  active(): Promise<string>
  version(id: string): Promise<ProviderVersion>
  upload(directory: string, tag: string, message: string): Promise<string>
  activate(id: string, message: string): Promise<void>
  verify(identity: PackageIdentity): Promise<void>
  journal(): ReleaseJournal | null
  save(journal: ReleaseJournal): void
}
export function requireVersion(value: string) {
  if (!versionPattern.test(value)) throw new Error('Expected an exact Cloudflare version UUID.')
  return value
}
function requireHash(value: string) {
  if (!hashPattern.test(value)) throw new Error('Expected a full SHA-256 file-tree identity.')
  return value
}
/** Reject links and non-files before the older shared inventory helper can follow them. */
export function verifyCanonicalPackage(identity: PackageIdentity) {
  requireFullGitRevision(identity.sourceRevision)
  requireHash(identity.fileTreeSha256)
  const directory = resolve(identity.directory)
  function inspect(path: string) {
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) throw new Error('Release packages cannot contain symlinks.')
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path)) inspect(join(path, entry))
    } else if (!stat.isFile()) throw new Error('Release packages can contain regular files only.')
  }
  inspect(directory)
  const manifest = JSON.parse(readFileSync(join(directory, 'family-beta-manifest.json'), 'utf8'))
  if (
    manifest.schema !== 1 ||
    manifest.grade !== 'Family' ||
    manifest.canonicalOrigin !== CANONICAL_FAMILY.origin ||
    manifest.firebaseProject !== CANONICAL_FAMILY.firebaseProject ||
    manifest.entry !== 'family-beta-preview.html' ||
    manifest.sourceRevision !== identity.sourceRevision ||
    manifest.fileTreeSha256 !== identity.fileTreeSha256
  )
    throw new Error('Canonical family artifact identity does not match the reviewed release.')
  const files = artifactFileRecords(directory)
  assert.deepEqual(files, manifest.files, 'Artifact inventory differs from its manifest.')
  if (fileTreeSha256(files) !== identity.fileTreeSha256)
    throw new Error('Artifact hash differs from its reviewed tree.')
  for (const file of files) {
    if (
      file.path.split('/').some((part) => part === '..' || part.startsWith('.env') || part === '.git') ||
      /(?:^|\/)(?:firebase\.json|.*\.pem|.*\.key|.*credentials.*)$/i.test(file.path)
    )
      throw new Error('A release package contains an unexpected private/control file.')
  }
  for (const path of [...entries, '_headers', 'offline-registration.js', 'family-offline-sw.js'])
    if (!files.some((file) => file.path === path)) throw new Error(`Missing canonical release entry ${path}.`)
  return manifest as {
    schema: 1
    grade: 'Family'
    entry: string
    sourceRevision: string
    fileTreeSha256: string
    files: { path: string; bytes: number; sha256: string }[]
    rollbackCompatibilityRevision?: string
    rollbackMode?: string
    previousFileTreeSha256?: string
  }
}
/** Operator evidence/approvals are receipts, not a substitute for independent review or human authority. */
export function verifyReleaseRecord(record: ReleaseRecord) {
  if (record.schema !== 1) throw new Error('Unknown canonical release-record schema.')
  const candidate = verifyCanonicalPackage(record.candidate)
  const recovery = verifyCanonicalPackage(record.recovery)
  requireVersion(record.previous.version)
  requireFullGitRevision(record.previous.sourceRevision)
  requireHash(record.previous.fileTreeSha256)
  if (
    record.previous.sourceRevision === record.candidate.sourceRevision ||
    candidate.rollbackMode ||
    recovery.sourceRevision !== record.previous.sourceRevision ||
    recovery.previousFileTreeSha256 !== record.previous.fileTreeSha256 ||
    recovery.rollbackCompatibilityRevision !== candidate.sourceRevision ||
    recovery.rollbackMode !== 'previous-engine-with-newer-record-preservation-guard'
  )
    throw new Error('Recovery must be the exact predecessor guarded for this candidate.')
  if (readFileSync(join(record.recovery.directory, 'rollback-guard.js'), 'utf8') !== rollbackGuard)
    throw new Error('Recovery preservation guard differs from the reviewed implementation.')
  for (const file of recovery.files.filter((file) => file.path.endsWith('.html'))) {
    const html = readFileSync(join(record.recovery.directory, file.path), 'utf8')
    if (!html.includes('<head><script src="./rollback-guard.js"></script>'))
      throw new Error('Recovery must run its preservation guard first.')
    for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      const src = attributes.match(/\bsrc="([^"]+)"/)?.[1]
      if (src === './rollback-guard.js' || (src === './offline-registration.js' && /\bdefer\b/.test(attributes)))
        continue
      if (src || !body.startsWith('if (!window.__dojoRollbackPreserve) '))
        throw new Error('Recovery contains an unguarded entry script.')
    }
  }
  const approval = record.approval,
    evidence = record.evidence
  if (
    approval.sourceRevision !== candidate.sourceRevision ||
    approval.fileTreeSha256 !== candidate.fileTreeSha256 ||
    approval.grades.length !== FAMILY_GRADES.length ||
    new Set(approval.grades).size !== FAMILY_GRADES.length ||
    !FAMILY_GRADES.every((grade) => approval.grades.includes(grade)) ||
    !approval.reference.trim()
  )
    throw new Error('Three explicit grade approvals must identify this exact candidate.')
  if (evidence.sourceRevision !== candidate.sourceRevision || evidence.fileTreeSha256 !== candidate.fileTreeSha256)
    throw new Error('Release evidence belongs to another candidate.')
  for (const key of ['independentReview', 'checks', 'backend', 'recovery'] as const) {
    // References are SHA-bound local receipts, never credentials or data captures.
    const reference = evidence[key]
    const separator = reference.lastIndexOf('#sha256=')
    if (separator <= 0) throw new Error(`Supply hash-bound ${key} evidence.`)
    const digest = requireHash(reference.slice(separator + 8))
    const actual = createHash('sha256')
      .update(readFileSync(reference.slice(0, separator)))
      .digest('hex')
    if (actual !== digest) throw new Error(`${key} evidence changed after review.`)
  }
  return { candidate, recovery }
}
export function releaseRecordHash(record: ReleaseRecord) {
  return createHash('sha256').update(JSON.stringify(record)).digest('hex')
}
export function uploadMessage(record: ReleaseRecord, kind: 'candidate' | 'recovery') {
  return `canonical-family ${kind} ${record.candidate.sourceRevision} ${record[kind].fileTreeSha256}`
}
function assertSameRuntime(version: ProviderVersion, previous: ProviderVersion) {
  assert.deepEqual(
    version.resources,
    previous.resources,
    'Provider bindings/runtime/headers changed; separate review required.',
  )
}
async function requireActive(ports: ReleasePorts, expected: string) {
  if ((await ports.active()) !== expected)
    throw new Error('Active hosting changed. Stop and reconcile; do not overwrite it.')
}
async function ownedVersion(ports: ReleasePorts, record: ReleaseRecord, kind: 'candidate' | 'recovery', id: string) {
  const version = await ports.version(requireVersion(id))
  if (version.id !== id || version.annotations['workers/message'] !== uploadMessage(record, kind))
    throw new Error('Uploaded version is not bound to this candidate and package hash.')
  assertSameRuntime(version, await ports.version(record.previous.version))
}
/** One explicit provider invocation per phase. Wrangler may retry identical INACTIVE
 * uploads internally (at most three attempts in the pinned version); we never
 * repeat a failed/uncertain CLI invocation or automatically retry activation. */
export async function executeCanonicalRelease(
  operation: 'upload' | 'activate' | 'rollback' | 'reconcile',
  record: ReleaseRecord,
  ports: ReleasePorts,
) {
  verifyReleaseRecord(record)
  const fingerprint = releaseRecordHash(record)
  const prior = ports.journal()
  if (prior && prior.recordSha256 !== fingerprint) throw new Error('The release journal belongs to another record.')
  if (operation === 'upload') {
    if (prior)
      throw new Error('An upload was already attempted. Inspect the retained journal/provider; never blindly retry.')
    await requireActive(ports, record.previous.version)
    if ((await ports.version(record.previous.version)).resources.bindings.length)
      throw new Error('Canonical static hosting has unexpected shared bindings. Stop before uploading.')
    await ports.verify({ ...record.previous, directory: '' })
    const journal: ReleaseJournal = { recordSha256: fingerprint, phase: 'uploading-recovery' }
    ports.save(journal)
    journal.recoveryVersion = requireVersion(
      await ports.upload(
        record.recovery.directory,
        `guard-${record.candidate.sourceRevision.slice(0, 12)}`,
        uploadMessage(record, 'recovery'),
      ),
    )
    ports.save(journal)
    await ownedVersion(ports, record, 'recovery', journal.recoveryVersion)
    journal.phase = 'uploading-candidate'
    ports.save(journal)
    await requireActive(ports, record.previous.version)
    journal.candidateVersion = requireVersion(
      await ports.upload(
        record.candidate.directory,
        `family-${record.candidate.sourceRevision.slice(0, 12)}`,
        uploadMessage(record, 'candidate'),
      ),
    )
    ports.save(journal)
    await ownedVersion(ports, record, 'candidate', journal.candidateVersion)
    await requireActive(ports, record.previous.version)
    journal.phase = 'uploaded'
    ports.save(journal)
    return journal
  }
  const from =
    operation === 'activate'
      ? ['uploaded']
      : operation === 'rollback'
        ? ['activated', 'activating']
        : ['activating', 'rolling-back']
  if (!prior || !from.includes(prior.phase) || !prior.candidateVersion || !prior.recoveryVersion)
    throw new Error(`Require a ${from.join('/')} journal. Uncertain operations require inspection, not retry.`)
  await ownedVersion(ports, record, 'candidate', prior.candidateVersion)
  await ownedVersion(ports, record, 'recovery', prior.recoveryVersion)
  if (operation === 'reconcile') {
    const recovering = prior.phase === 'rolling-back'
    await requireActive(ports, recovering ? prior.recoveryVersion : prior.candidateVersion)
    await ports.verify(recovering ? record.recovery : record.candidate)
    const confirmed = { ...prior, phase: recovering ? 'rolled-back' : 'activated' } as ReleaseJournal
    ports.save(confirmed)
    return confirmed
  }
  await requireActive(ports, operation === 'activate' ? record.previous.version : prior.candidateVersion)
  const target = operation === 'activate' ? prior.candidateVersion : prior.recoveryVersion
  const journal = { ...prior, phase: operation === 'activate' ? 'activating' : 'rolling-back' } as ReleaseJournal
  ports.save(journal)
  await ports.activate(
    target,
    `${operation} canonical family ${record.candidate.sourceRevision}; guarded recovery ${prior.recoveryVersion}`,
  )
  await requireActive(ports, target)
  await ports.verify(operation === 'activate' ? record.candidate : record.recovery)
  journal.phase = operation === 'activate' ? 'activated' : 'rolled-back'
  ports.save(journal)
  return journal
}
/** Read-only canonical verifier. Never uses old aliases as release targets. */
export async function verifyCanonicalLive(identity: PackageIdentity, request: typeof fetch = fetch) {
  requireFullGitRevision(identity.sourceRevision)
  requireHash(identity.fileTreeSha256)
  const local = identity.directory ? verifyCanonicalPackage(identity) : null
  const response = await request(`${CANONICAL_FAMILY.origin}/family-beta-manifest.json`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok || new URL(response.url).origin !== CANONICAL_FAMILY.origin)
    throw new Error('Canonical manifest is unavailable or redirected off origin.')
  const manifest = await response.json()
  if (
    manifest.schema !== 1 ||
    manifest.grade !== 'Family' ||
    manifest.sourceRevision !== identity.sourceRevision ||
    manifest.fileTreeSha256 !== identity.fileTreeSha256 ||
    manifest.canonicalOrigin !== CANONICAL_FAMILY.origin ||
    manifest.firebaseProject !== CANONICAL_FAMILY.firebaseProject ||
    !Array.isArray(manifest.files) ||
    fileTreeSha256(manifest.files) !== identity.fileTreeSha256
  )
    throw new Error('Canonical live identity differs from the expected release.')
  if (local) assert.deepEqual(manifest, local, 'Served manifest differs from the retained artifact.')
  const files = manifest.files.filter(
    (file: { path: string }) => file.path !== '_headers' && !file.path.startsWith('.'),
  )
  let cursor = 0
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (cursor < files.length) {
        const file = files[cursor++]
        if (
          typeof file.path !== 'string' ||
          !/^[\w./-]+$/.test(file.path) ||
          file.path.startsWith('/') ||
          file.path.split('/').includes('..')
        )
          throw new Error('Invalid live asset path.')
        const url = new URL(file.path, `${CANONICAL_FAMILY.origin}/`)
        const result = await request(url, { cache: 'no-store', signal: AbortSignal.timeout(30000) })
        if (!result.ok || new URL(result.url).origin !== CANONICAL_FAMILY.origin)
          throw new Error(`Asset unavailable: ${file.path}`)
        const bytes = Buffer.from(await result.arrayBuffer())
        if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256)
          throw new Error(`Live asset differs: ${file.path}`)
      }
    }),
  )
  return {
    origin: CANONICAL_FAMILY.origin,
    sourceRevision: identity.sourceRevision,
    fileTreeSha256: identity.fileTreeSha256,
    publicFiles: files.length,
  }
}
