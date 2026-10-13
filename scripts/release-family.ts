// Canonical static-hosting release only. No builds, DNS, auth, database, or retirement operations.
import { execFileSync } from 'node:child_process'
import {
  closeSync,
  cpSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import {
  CANONICAL_FAMILY,
  canonicalProviderEnvironment,
  executeCanonicalRelease,
  type ReleaseJournal,
  type ReleaseRecord,
  releaseRecordHash,
  requireVersion,
  verifyCanonicalLive,
  verifyCanonicalPackage,
  verifyReleaseRecord,
} from './canonicalFamilyRelease.ts'

const root = resolve(import.meta.dirname, '..')
const operation = process.argv[2]
const allowed = ['--record', '--journal', '--execute', '--confirm-revision', '--confirm-tree', '--confirm-active']
const flags = new Map<string, string>()
for (let i = 3; i < process.argv.length; i++) {
  const name = process.argv[i]
  if (!allowed.includes(name) || flags.has(name)) throw new Error(`Unknown or repeated release flag: ${name}`)
  const value = name === '--execute' ? 'true' : process.argv[++i]
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}.`)
  flags.set(name, value)
}
if (!['plan', 'upload', 'activate', 'verify', 'rollback', 'reconcile'].includes(operation) || !flags.get('--record'))
  throw new Error(
    'Use release:family plan|upload|activate|verify|rollback|reconcile --record exact-release.json. Mutations are dry-run unless --execute is supplied.',
  )
const recordPath = resolve(flags.get('--record')!)
const record = JSON.parse(readFileSync(recordPath, 'utf8')) as ReleaseRecord
for (const identity of [record.candidate, record.recovery])
  identity.directory = resolve(dirname(recordPath), identity.directory)
for (const key of ['independentReview', 'checks', 'backend', 'recovery'] as const) {
  const [path, digest] = record.evidence[key].split('#sha256=')
  record.evidence[key] = `${resolve(dirname(recordPath), path)}#sha256=${digest}`
}
verifyReleaseRecord(record)
if (operation === 'verify') {
  console.log(JSON.stringify(await verifyCanonicalLive(record.candidate), null, 2))
} else if (!flags.has('--execute') || operation === 'plan') {
  console.log(
    JSON.stringify(
      {
        dryRun: true,
        destination: CANONICAL_FAMILY,
        sourceRevision: record.candidate.sourceRevision,
        candidateTree: record.candidate.fileTreeSha256,
        recoveryTree: record.recovery.fileTreeSha256,
        expectedActive: record.previous.version,
        recordSha256: releaseRecordHash(record),
        operation,
        order: [
          'upload guarded recovery inactive',
          'upload exact candidate inactive',
          'activate only candidate at 100%',
          'verify exact canonical manifest and all public assets',
        ],
        recovery:
          'Explicit rollback selects only the retained guarded version, never an unguarded predecessor. Runtime/browser acceptance remains a separate required check.',
        authority: 'Receipt validation does not grant approval. Obtain human authority for each external operation.',
      },
      null,
      2,
    ),
  )
} else {
  if (
    flags.get('--confirm-revision') !== record.candidate.sourceRevision ||
    flags.get('--confirm-tree') !== record.candidate.fileTreeSha256
  )
    throw new Error('Repeat the exact candidate revision and tree with --confirm-revision and --confirm-tree.')
  if (execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim())
    throw new Error('Commit reviewed release tooling before executing a hosting operation.')
  execFileSync('git', ['cat-file', '-e', `${record.candidate.sourceRevision}^{commit}`], { cwd: root })
  const journalPath = resolve(flags.get('--journal') || '')
  if (
    !flags.get('--journal') ||
    !journalPath.endsWith('.json') ||
    [record.candidate.directory, record.recovery.directory].some(
      (path) => journalPath === path || journalPath.startsWith(`${path}/`),
    )
  )
    throw new Error('Supply a separate --journal JSON file outside both asset packages.')
  const existing = existsSync(journalPath) ? (JSON.parse(readFileSync(journalPath, 'utf8')) as ReleaseJournal) : null
  const expectedActive =
    operation === 'rollback'
      ? existing?.candidateVersion
      : operation === 'reconcile'
        ? existing?.phase === 'rolling-back'
          ? existing.recoveryVersion
          : existing?.candidateVersion
        : record.previous.version
  if (!expectedActive || flags.get('--confirm-active') !== expectedActive)
    throw new Error('Repeat the exact expected active version with --confirm-active.')
  const stage = mkdtempSync(join(tmpdir(), 'ninja-canonical-release-'))
  const config = join(stage, 'wrangler.toml')
  writeFileSync(
    config,
    `name = "${CANONICAL_FAMILY.worker}"\naccount_id = "${CANONICAL_FAMILY.account}"\ncompatibility_date = "2026-10-04"\nworkers_dev = false\npreview_urls = false\n`,
  )
  let lock: number | undefined
  const lockPath = join(tmpdir(), `${CANONICAL_FAMILY.worker}-${CANONICAL_FAMILY.account}.release.lock`)
  const environment = canonicalProviderEnvironment(process.env)
  const wrangler = (args: string[]) =>
    execFileSync(
      'npx',
      ['--yes', `--package=wrangler@${CANONICAL_FAMILY.wrangler}`, 'wrangler', ...args, '--config', config],
      { cwd: stage, env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim()
  try {
    mkdirSync(dirname(journalPath), { recursive: true })
    lock = openSync(lockPath, 'wx')
    const journal = () =>
      existsSync(journalPath) ? (JSON.parse(readFileSync(journalPath, 'utf8')) as ReleaseJournal) : null
    let created = existsSync(journalPath)
    const durableWrite = (path: string, value: ReleaseJournal) => {
      const fd = openSync(path, 'wx', 0o600)
      try {
        writeFileSync(fd, JSON.stringify(value, null, 2))
        fsyncSync(fd)
      } finally {
        closeSync(fd)
      }
    }
    const syncDirectory = () => {
      const fd = openSync(dirname(journalPath), 'r')
      try {
        fsyncSync(fd)
      } finally {
        closeSync(fd)
      }
    }
    const save = (value: ReleaseJournal) => {
      if (!created) {
        durableWrite(journalPath, value)
        syncDirectory()
        created = true
        return
      }
      const temporary = `${journalPath}.${process.pid}.tmp`
      durableWrite(temporary, value)
      renameSync(temporary, journalPath)
      syncDirectory()
    }
    const receipt = await executeCanonicalRelease(
      operation as 'upload' | 'activate' | 'rollback' | 'reconcile',
      record,
      {
        journal,
        save,
        async active() {
          const deployments = JSON.parse(wrangler(['deployments', 'list', '--json']))
          if (!Array.isArray(deployments) || !deployments.length)
            throw new Error('No existing canonical deployment; initial provisioning is out of scope.')
          const latest = deployments.sort((a, b) => a.created_on.localeCompare(b.created_on)).at(-1)
          if (latest.versions?.length !== 1 || latest.versions[0].percentage !== 100)
            throw new Error('Split or unknown hosting traffic; reconcile before publishing.')
          return requireVersion(latest.versions[0].version_id)
        },
        async version(id) {
          const value = JSON.parse(wrangler(['versions', 'view', requireVersion(id), '--json']))
          return {
            id: value.id,
            annotations: value.annotations,
            resources: { bindings: value.resources.bindings, script_runtime: value.resources.script_runtime },
          }
        },
        async upload(directory, tag, message) {
          const identity = directory === record.candidate.directory ? record.candidate : record.recovery
          const snapshot = join(stage, tag)
          cpSync(directory, snapshot, { recursive: true, errorOnExist: true, force: false })
          verifyCanonicalPackage({ ...identity, directory: snapshot })
          const output = wrangler([
            'versions',
            'upload',
            '--assets',
            snapshot,
            '--tag',
            tag,
            '--message',
            message,
            '--keep-vars',
          ])
          const id = output.match(/Worker Version ID: ([a-f0-9-]{36})/)?.[1]
          if (!id) throw new Error('Upload outcome uncertain. Inspect provider versions and journal; do not retry.')
          return requireVersion(id)
        },
        async activate(id, message) {
          wrangler(['versions', 'deploy', `${requireVersion(id)}@100`, '--message', message, '--yes'])
        },
        async verify(identity) {
          await verifyCanonicalLive(identity)
        },
      },
    )
    console.log(JSON.stringify(receipt, null, 2))
    console.log(
      'Hosting operation verified. Runtime/persistence and physical-device acceptance are separate; do not infer them from this receipt.',
    )
  } finally {
    if (lock !== undefined) {
      closeSync(lock)
      rmSync(lockPath)
    }
    rmSync(stage, { recursive: true, force: true })
  }
}
