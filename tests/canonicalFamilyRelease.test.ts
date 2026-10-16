import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test, { type TestContext } from 'node:test'
import {
  effectiveFamilyHeaders,
  legacyFamilyHeaders,
  packageHeaderPolicy,
  sha256,
  transitionScopeHash,
} from '../scripts/canonicalFamilyHeaders.ts'
import {
  CANONICAL_FAMILY,
  canonicalProviderEnvironment,
  executeCanonicalRelease,
  type PackageIdentity,
  type ProviderVersion,
  type ReleaseJournal,
  type ReleasePorts,
  type ReleaseRecord,
  verifyActiveCanonicalRelease,
  verifyCanonicalLive,
  verifyCanonicalPackage,
  verifyReleaseRecord,
} from '../scripts/canonicalFamilyRelease.ts'
import { artifactFileRecords, fileTreeSha256 } from '../scripts/familyBetaRelease.ts'
import { prepareOfflineRollback } from '../scripts/familyOfflineRollback.ts'
import { familySecurityHeaders } from '../scripts/familySecurityHeaders.ts'

const previousVersion = '11111111-1111-4111-8111-111111111111'
const candidateVersion = '22222222-2222-4222-8222-222222222222'
const recoveryVersion = '33333333-3333-4333-8333-333333333333'
test('provider subprocess environment keeps supported authentication but strips inherited target/API/config overrides', () => {
  const original = {
    PATH: '/synthetic/node/bin',
    HOME: '/synthetic/home',
    LANG: 'en_US.UTF-8',
    CLOUDFLARE_API_TOKEN: 'synthetic-token',
    CF_API_KEY: 'synthetic-key',
    CLOUDFLARE_ACCOUNT_ID: 'wrong-account',
    WRANGLER_CI_OVERRIDE_NAME: 'other-worker',
    CLOUDFLARE_API_BASE_URL: 'https://wrong.invalid',
    CF_API_BASE_URL: 'https://wrong.invalid',
    CLOUDFLARE_BASE_URL: 'https://wrong.invalid',
    WRANGLER_API_ENVIRONMENT: 'staging',
    CLOUDFLARE_COMPLIANCE_REGION: 'fedramp',
    CLOUDFLARE_ENV: 'other',
    WRANGLER_CI_MATCH_TAG: 'other',
    WRANGLER_LOG_SANITIZE: 'false',
    WRANGLER_UNKNOWN_OVERRIDE: 'future',
  }
  assert.deepEqual(canonicalProviderEnvironment(original), {
    PATH: original.PATH,
    HOME: original.HOME,
    LANG: original.LANG,
    CLOUDFLARE_API_TOKEN: 'synthetic-token',
    CF_API_KEY: 'synthetic-key',
    CLOUDFLARE_ACCOUNT_ID: CANONICAL_FAMILY.account,
    WRANGLER_SEND_METRICS: 'false',
  })
  assert.equal(original.WRANGLER_CI_OVERRIDE_NAME, 'other-worker')
})
function fixture(t: TestContext, security = false) {
  const root = mkdtempSync(join(tmpdir(), 'ninja-release-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  function artifact(name: string, revision: string): PackageIdentity {
    const directory = join(root, name)
    mkdirSync(join(directory, 'assets'), { recursive: true })
    const asset = security ? 'assets/app-Abcd1234.js' : 'assets/app.js'
    writeFileSync(join(directory, asset), `export const revision = '${revision}'`)
    for (const entry of [
      'index.html',
      'family-beta-preview.html',
      'family-game.html',
      'kindergarten-learning-lab.html',
      'grade5-learning-hub.html',
    ])
      writeFileSync(
        join(directory, entry),
        '<html><head><script type="module" src="./assets/app.js"></script></head><body>synthetic</body></html>',
      )
    writeFileSync(
      join(directory, '_headers'),
      security
        ? revision === 'b'.repeat(40)
          ? familySecurityHeaders([asset])
          : legacyFamilyHeaders
        : '/*\n  Cache-Control: no-store\n',
    )
    writeFileSync(join(directory, 'offline-registration.js'), '// synthetic registration')
    writeFileSync(join(directory, 'family-offline-sw.js'), '// synthetic worker')
    const files = artifactFileRecords(directory),
      tree = fileTreeSha256(files)
    writeFileSync(
      join(directory, 'family-beta-manifest.json'),
      JSON.stringify({
        schema: 1,
        grade: 'Family',
        entry: 'family-beta-preview.html',
        canonicalOrigin: CANONICAL_FAMILY.origin,
        firebaseProject: CANONICAL_FAMILY.firebaseProject,
        sourceRevision: revision,
        fileTreeSha256: tree,
        files,
      }),
    )
    return { directory, sourceRevision: revision, fileTreeSha256: tree }
  }
  const candidate = artifact('candidate', 'b'.repeat(40)),
    previous = artifact('previous', 'a'.repeat(40))
  const guarded = prepareOfflineRollback(previous.directory, candidate.sourceRevision)
  t.after(() => rmSync(dirname(guarded.directory), { recursive: true, force: true }))
  const evidence = join(root, 'synthetic-evidence.json')
  writeFileSync(
    evidence,
    JSON.stringify({
      synthetic: true,
      sourceRevision: candidate.sourceRevision,
      fileTreeSha256: candidate.fileTreeSha256,
    }),
  )
  const reference = `${evidence}#sha256=${createHash('sha256').update(readFileSync(evidence)).digest('hex')}`
  const record: ReleaseRecord = {
    schema: 1,
    candidate,
    recovery: {
      directory: guarded.directory,
      sourceRevision: previous.sourceRevision,
      fileTreeSha256: guarded.manifest.fileTreeSha256,
    },
    previous: {
      sourceRevision: previous.sourceRevision,
      fileTreeSha256: previous.fileTreeSha256,
      version: previousVersion,
    },
    approval: {
      sourceRevision: candidate.sourceRevision,
      fileTreeSha256: candidate.fileTreeSha256,
      grades: ['kindergarten', 'grade2', 'grade5'],
      reference: 'Synthetic test receipt, not live authority',
    },
    evidence: {
      sourceRevision: candidate.sourceRevision,
      fileTreeSha256: candidate.fileTreeSha256,
      independentReview: reference,
      checks: reference,
      backend: reference,
      recovery: reference,
    },
  }
  return { root, record, previous, evidence }
}
function provider(record: ReleaseRecord) {
  let active = previousVersion,
    saved: ReleaseJournal | null = null
  const calls: string[] = [],
    versions = new Map<string, ProviderVersion>()
  versions.set(previousVersion, {
    id: previousVersion,
    annotations: {},
    resources: {
      bindings: [],
      script_runtime: {
        compatibility_date: '2026-10-04',
        usage_model: 'standard',
        // The authenticated provider readback includes BOTH representations inside
        // script_runtime. The release adapter retains them, so equality covers them.
        assets: {
          raw_headers: readFileSync(join(record.recovery.directory, '_headers'), 'utf8'),
          headers: { version: 2, rules: { '/*': { set: { 'cache-control': 'no-store' }, unset: [] } } },
          serve_directly: true,
          raw_run_worker_first: false,
          base_path: '/',
        },
      },
    },
  })
  if (record.headerTransition)
    versions.get(previousVersion)!.resources = structuredClone(record.headerTransition.previous.resources)
  const ports: ReleasePorts = {
    async active() {
      calls.push('read-active')
      return active
    },
    async version(id) {
      calls.push('read-version')
      return structuredClone(versions.get(id)!)
    },
    async upload(directory, _tag, message) {
      const candidate = directory === record.candidate.directory,
        id = candidate ? candidateVersion : recoveryVersion
      calls.push(candidate ? 'upload-candidate' : 'upload-recovery')
      versions.set(id, {
        id,
        annotations: { 'workers/message': message },
        resources: structuredClone(versions.get(previousVersion)!.resources),
      })
      if (record.headerTransition) {
        const runtime = versions.get(id)!.resources.script_runtime as {
          assets: { raw_headers: string; headers: unknown }
        }
        const policy = packageHeaderPolicy(directory)
        runtime.assets.raw_headers = policy.raw
        runtime.assets.headers = policy.parsed
      }
      return id
    },
    async activate(id) {
      calls.push(`activate-${id}`)
      active = id
    },
    async verify(identity) {
      calls.push(`verify-${identity.fileTreeSha256}`)
    },
    journal() {
      return structuredClone(saved)
    },
    save(value) {
      calls.push(`journal-${value.phase}`)
      saved = structuredClone(value)
    },
  }
  return {
    ports,
    calls,
    versions,
    setActive: (id: string) => {
      active = id
    },
  }
}
function transitionFixture(t: TestContext) {
  const result = fixture(t, true)
  const { record, root } = result
  const policy = packageHeaderPolicy(record.recovery.directory)
  record.headerTransition = {
    schema: 1,
    target: { ...CANONICAL_FAMILY },
    previous: {
      ...record.previous,
      resources: {
        bindings: [],
        script_runtime: {
          compatibility_date: '2026-10-04',
          usage_model: 'standard',
          assets: {
            raw_headers: policy.raw,
            headers: policy.parsed,
            base_path: '/',
            serve_directly: true,
            raw_run_worker_first: false,
          },
        },
      },
    },
    candidate: {
      sourceRevision: record.candidate.sourceRevision,
      fileTreeSha256: record.candidate.fileTreeSha256,
      policy: packageHeaderPolicy(record.candidate.directory),
    },
    recovery: {
      sourceRevision: record.recovery.sourceRevision,
      fileTreeSha256: record.recovery.fileTreeSha256,
      policy,
    },
    receipts: { independentReview: '', securityApproval: '' },
  }
  const transition = record.headerTransition
  for (const kind of ['independentReview', 'securityApproval'] as const) {
    const path = join(root, `${kind}.json`)
    const bytes = JSON.stringify({
      schema: 1,
      scope: 'canonical-header-transition',
      kind,
      approved: true,
      transitionSha256: transitionScopeHash(transition),
      reference: 'Synthetic unit-test approval, never live authority',
      ...(kind === 'securityApproval' ? { grades: ['kindergarten', 'grade2', 'grade5'] } : {}),
    })
    writeFileSync(path, bytes)
    transition.receipts[kind] = `${path}#sha256=${sha256(bytes)}`
  }
  return { ...result, transition }
}
test('canonical release validates exact candidate and guarded predecessor, then uploads inactive and promotes once', async (t) => {
  const { record } = fixture(t),
    p = provider(record)
  verifyReleaseRecord(record)
  const uploaded = await executeCanonicalRelease('upload', record, p.ports)
  assert.equal(uploaded.phase, 'uploaded')
  assert.deepEqual(
    p.calls.filter((c) => c.startsWith('upload-')),
    ['upload-recovery', 'upload-candidate'],
  )
  assert.equal(
    p.calls.some((c) => c.startsWith('activate-')),
    false,
  )
  assert(p.calls.indexOf('journal-uploading-recovery') < p.calls.indexOf('upload-recovery'))
  assert(p.calls.indexOf('journal-uploading-candidate') < p.calls.indexOf('upload-candidate'))
  assert.equal((await executeCanonicalRelease('activate', record, p.ports)).phase, 'activated')
  assert.deepEqual(
    p.calls.filter((c) => c.startsWith('activate-')),
    [`activate-${candidateVersion}`],
  )
  await assert.rejects(executeCanonicalRelease('activate', record, p.ports), /Require a uploaded journal/)
  assert.equal((await executeCanonicalRelease('rollback', record, p.ports)).phase, 'rolled-back')
  assert.equal(p.calls.filter((c) => c.startsWith('activate-')).at(-1), `activate-${recoveryVersion}`)
  assert(p.calls.includes(`verify-${record.recovery.fileTreeSha256}`))
})
test('approved exact header transition verifies both policies through upload, activation, read-only verification and guarded recovery', async (t) => {
  const { record } = transitionFixture(t),
    p = provider(record)
  const verified: Array<{ source: string; policy: string | undefined }> = []
  const verify = p.ports.verify
  p.ports.verify = async (identity, policy) => {
    verified.push({ source: identity.sourceRevision, policy: policy?.rawSha256 })
    await verify(identity)
  }
  assert.equal((await executeCanonicalRelease('upload', record, p.ports)).phase, 'uploaded')
  assert.equal((await executeCanonicalRelease('activate', record, p.ports)).phase, 'activated')
  const journal = p.ports.journal()
  assert.equal((await verifyActiveCanonicalRelease(record, p.ports)).activeVersion, candidateVersion)
  assert.deepEqual(p.ports.journal(), journal)
  assert.equal((await executeCanonicalRelease('rollback', record, p.ports)).phase, 'rolled-back')
  assert.deepEqual(
    verified.map((entry) => entry.policy),
    [
      record.headerTransition!.recovery.policy.rawSha256,
      record.headerTransition!.candidate.policy.rawSha256,
      record.headerTransition!.candidate.policy.rawSha256,
      record.headerTransition!.recovery.policy.rawSha256,
    ],
  )
})
for (const fault of [
  'target',
  'baseline-version',
  'candidate-tree',
  'candidate-source',
  'raw-hash',
  'parsed-policy',
  'review-hash',
  'approval-scope',
  'approval-denied',
  'approval-grades',
] as const) {
  test(`header transition refuses ${fault} before any provider call`, async (t) => {
    const { record, transition } = transitionFixture(t),
      p = provider(record)
    if (fault === 'target') transition.target.worker = 'wrong-worker'
    if (fault === 'baseline-version') transition.previous.version = candidateVersion
    if (fault === 'candidate-tree') transition.candidate.fileTreeSha256 = 'f'.repeat(64)
    if (fault === 'candidate-source') transition.candidate.sourceRevision = 'f'.repeat(40)
    if (fault === 'raw-hash') transition.candidate.policy.rawSha256 = 'f'.repeat(64)
    if (fault === 'parsed-policy') transition.candidate.policy.parsed.rules['/*'].set['x-frame-options'] = 'DENY'
    if (fault === 'review-hash')
      transition.receipts.independentReview = transition.receipts.independentReview.replace(
        /sha256=.*/,
        `sha256=${'f'.repeat(64)}`,
      )
    if (fault.startsWith('approval-')) {
      const path = transition.receipts.securityApproval.split('#sha256=')[0]
      const receipt = JSON.parse(readFileSync(path, 'utf8'))
      if (fault === 'approval-scope') receipt.transitionSha256 = 'f'.repeat(64)
      if (fault === 'approval-denied') receipt.approved = false
      if (fault === 'approval-grades') receipt.grades = ['grade2']
      const bytes = JSON.stringify(receipt)
      writeFileSync(path, bytes)
      transition.receipts.securityApproval = `${path}#sha256=${sha256(bytes)}`
    }
    await assert.rejects(executeCanonicalRelease('upload', record, p.ports))
    assert.deepEqual(p.calls, [])
  })
}
test('header transition detects baseline drift before writing a journal or uploading', async (t) => {
  const { record } = transitionFixture(t),
    p = provider(record)
  ;(p.versions.get(previousVersion)!.resources.script_runtime as Record<string, unknown>).extra_setting = true
  await assert.rejects(executeCanonicalRelease('upload', record, p.ports), /baseline changed/)
  assert.equal(p.ports.journal(), null)
  assert.equal(
    p.calls.some((call) => call.startsWith('upload-')),
    false,
  )
})
for (const fault of [
  'raw',
  'parsed',
  'unknown-policy-field',
  'binding',
  'runtime',
  'asset-setting',
  'unknown-asset-field',
  'recovery-policy',
] as const) {
  test(`approved transition still refuses uploaded ${fault} drift`, async (t) => {
    const { record } = transitionFixture(t),
      p = provider(record),
      upload = p.ports.upload
    p.ports.upload = async (...args) => {
      const id = await upload(...args)
      if (id === (fault === 'recovery-policy' ? recoveryVersion : candidateVersion)) {
        const resources = p.versions.get(id)!.resources
        const runtime = resources.script_runtime as { usage_model: string; assets: Record<string, unknown> }
        if (fault === 'raw' || fault === 'recovery-policy')
          runtime.assets.raw_headers = legacyFamilyHeaders + '# changed\n'
        if (fault === 'parsed') runtime.assets.headers = { version: 2, rules: {} }
        if (fault === 'unknown-policy-field') (runtime.assets.headers as Record<string, unknown>).ignored = true
        if (fault === 'binding') resources.bindings.push({ type: 'plain_text', name: 'UNAPPROVED', text: 'test' })
        if (fault === 'runtime') runtime.usage_model = 'other'
        if (fault === 'asset-setting') runtime.assets.base_path = '/different'
        if (fault === 'unknown-asset-field') runtime.assets.new_setting = true
      }
      return id
    }
    await assert.rejects(executeCanonicalRelease('upload', record, p.ports))
    assert.equal(
      p.calls.some((call) => call.startsWith('activate-')),
      false,
    )
    assert.equal(await p.ports.active(), previousVersion)
  })
}
test('failed candidate header verification leaves activation incomplete and permits only the approved guarded recovery', async (t) => {
  const { record } = transitionFixture(t),
    p = provider(record),
    verify = p.ports.verify
  await executeCanonicalRelease('upload', record, p.ports)
  p.ports.verify = async (identity, policy) => {
    if (identity.sourceRevision === record.candidate.sourceRevision) throw new Error('Served CSP differs')
    assert.equal(policy?.raw, legacyFamilyHeaders)
    await verify(identity)
  }
  await assert.rejects(executeCanonicalRelease('activate', record, p.ports), /Served CSP differs/)
  assert.equal(p.ports.journal()!.phase, 'activating')
  await assert.rejects(executeCanonicalRelease('reconcile', record, p.ports), /Served CSP differs/)
  assert.equal(p.ports.journal()!.phase, 'activating')
  assert.equal((await executeCanonicalRelease('rollback', record, p.ports)).phase, 'rolled-back')
  assert.equal(await p.ports.active(), recoveryVersion)
})
test('policy verification does not acknowledge activation if traffic changes during the HTTP checks', async (t) => {
  const { record } = transitionFixture(t),
    p = provider(record)
  await executeCanonicalRelease('upload', record, p.ports)
  p.ports.verify = async () => {
    p.setActive(previousVersion)
  }
  await assert.rejects(executeCanonicalRelease('activate', record, p.ports), /Active hosting changed/)
  assert.equal(p.ports.journal()!.phase, 'activating')
})
test('removing a reviewed transition after upload cannot bypass the frozen journal', async (t) => {
  const { record } = transitionFixture(t),
    p = provider(record)
  await executeCanonicalRelease('upload', record, p.ports)
  delete record.headerTransition
  await assert.rejects(executeCanonicalRelease('activate', record, p.ports), /journal belongs to another record/)
  assert.equal(await p.ports.active(), previousVersion)
})
test('uncertain policy activation reconciles only after exact policy verification without replaying activation', async (t) => {
  const { record } = transitionFixture(t),
    p = provider(record),
    activate = p.ports.activate
  await executeCanonicalRelease('upload', record, p.ports)
  p.ports.activate = async (...args) => {
    await activate(...args)
    throw new Error('Synthetic lost response')
  }
  await assert.rejects(executeCanonicalRelease('activate', record, p.ports), /lost response/)
  let verified = false
  p.ports.verify = async (_identity, policy) => {
    assert.deepEqual(policy, record.headerTransition!.candidate.policy)
    verified = true
  }
  assert.equal((await executeCanonicalRelease('reconcile', record, p.ports)).phase, 'activated')
  assert(verified)
  assert.equal(p.calls.filter((call) => call.startsWith('activate-')).length, 1)
})
test('CLI policy plan resolves relative receipts and remains offline without provider commands', (t) => {
  const { record, root, transition } = transitionFixture(t)
  record.candidate.directory = 'candidate'
  for (const key of ['independentReview', 'securityApproval'] as const) {
    const digest = transition.receipts[key].split('#sha256=')[1]
    transition.receipts[key] = `${key}.json#sha256=${digest}`
  }
  const path = join(root, 'policy-release.json')
  writeFileSync(path, JSON.stringify(record))
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', 'scripts/release-family.ts', 'plan', '--record', path],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: '' },
    },
  )
  assert.equal(result.status, 0, result.stderr)
  const plan = JSON.parse(result.stdout)
  assert.equal(plan.dryRun, true)
  assert.equal(plan.headerTransition.candidatePolicy, transition.candidate.policy.rawSha256)
  assert.equal(plan.headerTransition.recoveryPolicy, transition.recovery.policy.rawSha256)
})
for (const fault of [
  'approval',
  'duplicate-grade',
  'evidence-source',
  'evidence-hash',
  'recovery',
  'candidate-hash',
  'extra-file',
  'guard',
  'unguarded-entry',
] as const) {
  test(`release fails before provider calls for ${fault}`, async (t) => {
    const { record, evidence } = fixture(t),
      p = provider(record)
    if (fault === 'approval') record.approval.sourceRevision = 'c'.repeat(40)
    if (fault === 'duplicate-grade') record.approval.grades = ['grade2', 'grade2', 'grade5']
    if (fault === 'evidence-source') record.evidence.sourceRevision = 'c'.repeat(40)
    if (fault === 'evidence-hash') writeFileSync(evidence, 'changed receipt')
    if (fault === 'recovery') record.previous.sourceRevision = 'c'.repeat(40)
    if (fault === 'candidate-hash') record.candidate.fileTreeSha256 = '0'.repeat(64)
    if (fault === 'extra-file') writeFileSync(join(record.candidate.directory, '.env.local'), 'synthetic only')
    if (fault === 'guard' || fault === 'unguarded-entry') {
      writeFileSync(
        join(record.recovery.directory, fault === 'guard' ? 'rollback-guard.js' : 'index.html'),
        'unguarded',
      )
      const path = join(record.recovery.directory, 'family-beta-manifest.json'),
        manifest = JSON.parse(readFileSync(path, 'utf8'))
      manifest.files = artifactFileRecords(record.recovery.directory)
      manifest.fileTreeSha256 = fileTreeSha256(manifest.files)
      record.recovery.fileTreeSha256 = manifest.fileTreeSha256
      writeFileSync(path, JSON.stringify(manifest))
    }
    await assert.rejects(executeCanonicalRelease('upload', record, p.ports))
    assert.deepEqual(p.calls, [])
  })
}
test('artifact verifier rejects symlinks before following linked files', (t) => {
  const { record, root } = fixture(t)
  writeFileSync(join(root, 'outside.txt'), 'synthetic private file')
  symlinkSync(join(root, 'outside.txt'), join(record.candidate.directory, 'linked.txt'))
  assert.throws(() => verifyCanonicalPackage(record.candidate), /symlinks/)
})
test('unexpected shared provider bindings block upload without a journal or mutation', async (t) => {
  const { record } = fixture(t),
    p = provider(record)
  p.versions.get(previousVersion)!.resources.bindings.push({ type: 'kv_namespace' })
  await assert.rejects(executeCanonicalRelease('upload', record, p.ports), /shared bindings/)
  assert.equal(p.ports.journal(), null)
  assert.equal(
    p.calls.some((c) => c.startsWith('upload-')),
    false,
  )
})
test('concurrent active hosting changes block before either upload', async (t) => {
  const { record } = fixture(t),
    p = provider(record)
  p.setActive(candidateVersion)
  await assert.rejects(executeCanonicalRelease('upload', record, p.ports), /hosting changed/)
  assert.equal(p.ports.journal(), null)
})
test('hosting changes between recovery and candidate upload prevent the second mutation', async (t) => {
  const { record } = fixture(t),
    p = provider(record),
    upload = p.ports.upload
  p.ports.upload = async (...args) => {
    const id = await upload(...args)
    p.setActive(candidateVersion)
    return id
  }
  await assert.rejects(executeCanonicalRelease('upload', record, p.ports), /hosting changed/)
  assert.deepEqual(
    p.calls.filter((c) => c.startsWith('upload-')),
    ['upload-recovery'],
  )
})
test('uncertain uploads leave a pre-operation journal and cannot be blindly retried', async (t) => {
  const { record } = fixture(t),
    p = provider(record)
  let mutations = 0
  p.ports.upload = async () => {
    mutations++
    throw new Error('Synthetic connection lost after upload')
  }
  await assert.rejects(executeCanonicalRelease('upload', record, p.ports), /connection lost/)
  assert.equal(p.ports.journal()!.phase, 'uploading-recovery')
  await assert.rejects(executeCanonicalRelease('upload', record, p.ports), /already attempted/)
  assert.equal(mutations, 1)
})
test('changed provider runtime/headers leave uploads inactive and block promotion', async (t) => {
  const { record } = fixture(t),
    p = provider(record),
    upload = p.ports.upload
  p.ports.upload = async (...args) => {
    const id = await upload(...args)
    p.versions.get(id)!.resources.script_runtime = { changed: true }
    return id
  }
  await assert.rejects(executeCanonicalRelease('upload', record, p.ports), /runtime\/headers changed/)
  assert.equal(p.ports.journal()!.recoveryVersion, recoveryVersion)
  assert.equal(
    p.calls.some((c) => c.startsWith('activate-')),
    false,
  )
})
for (const representation of ['raw', 'parsed', 'both'] as const) {
  test(`nested ${representation} candidate header changes preserve the failed-upload journal and refuse activation/replay`, async (t) => {
    const { record } = fixture(t),
      p = provider(record),
      upload = p.ports.upload
    p.ports.upload = async (...args) => {
      const id = await upload(...args)
      if (id === candidateVersion) {
        const runtime = p.versions.get(id)!.resources.script_runtime as {
          assets: { raw_headers: string; headers: { version: number; rules: unknown } }
        }
        if (representation !== 'parsed')
          runtime.assets.raw_headers += "  Content-Security-Policy: frame-ancestors 'self'\n"
        if (representation !== 'raw')
          runtime.assets.headers.rules = {
            '/*': {
              set: { 'cache-control': 'no-store', 'content-security-policy': "frame-ancestors 'self'" },
              unset: [],
            },
          }
      }
      return id
    }
    await assert.rejects(executeCanonicalRelease('upload', record, p.ports), /runtime\/headers changed/)
    assert.deepEqual(
      p.calls.filter((c) => c.startsWith('upload-')),
      ['upload-recovery', 'upload-candidate'],
    )
    const journal = p.ports.journal()!
    assert.equal(journal.phase, 'uploading-candidate')
    assert.equal(journal.recoveryVersion, recoveryVersion)
    assert.equal(journal.candidateVersion, candidateVersion)
    await assert.rejects(executeCanonicalRelease('activate', record, p.ports), /Require a uploaded journal/)
    await assert.rejects(executeCanonicalRelease('upload', record, p.ports), /already attempted/)
    assert.deepEqual(p.ports.journal(), journal)
    assert.equal(p.calls.filter((c) => c.startsWith('upload-')).length, 2)
    assert.equal(
      p.calls.some((c) => c.startsWith('activate-')),
      false,
    )
    assert.equal(await p.ports.active(), previousVersion)
  })
}
test('activation rechecks nested parsed headers even after a previously verified inactive upload', async (t) => {
  const { record } = fixture(t),
    p = provider(record)
  await executeCanonicalRelease('upload', record, p.ports)
  const runtime = p.versions.get(candidateVersion)!.resources.script_runtime as {
    assets: { headers: { version: number } }
  }
  runtime.assets.headers.version = 3
  await assert.rejects(executeCanonicalRelease('activate', record, p.ports), /runtime\/headers changed/)
  assert.equal(p.ports.journal()!.phase, 'uploaded')
  assert.equal(
    p.calls.some((c) => c.startsWith('activate-')),
    false,
  )
  assert.equal(await p.ports.active(), previousVersion)
})
test('a forged uploaded-version annotation cannot be activated', async (t) => {
  const { record } = fixture(t),
    p = provider(record)
  await executeCanonicalRelease('upload', record, p.ports)
  p.versions.get(candidateVersion)!.annotations['workers/message'] = 'another candidate'
  await assert.rejects(executeCanonicalRelease('activate', record, p.ports), /not bound/)
  assert.equal(
    p.calls.some((c) => c.startsWith('activate-')),
    false,
  )
})
test('uncertain activation can be read back and reconciled without another deployment', async (t) => {
  const { record } = fixture(t),
    p = provider(record),
    activate = p.ports.activate
  await executeCanonicalRelease('upload', record, p.ports)
  p.ports.activate = async (...args) => {
    await activate(...args)
    throw new Error('Synthetic response lost')
  }
  await assert.rejects(executeCanonicalRelease('activate', record, p.ports), /response lost/)
  await assert.rejects(executeCanonicalRelease('activate', record, p.ports), /Require a uploaded journal/)
  assert.equal((await executeCanonicalRelease('reconcile', record, p.ports)).phase, 'activated')
  assert.equal(p.calls.filter((c) => c.startsWith('activate-')).length, 1)
})
test('failed post-activation asset verification still allows explicitly approved guarded containment', async (t) => {
  const { record } = fixture(t),
    p = provider(record),
    verify = p.ports.verify
  await executeCanonicalRelease('upload', record, p.ports)
  p.ports.verify = async (identity) => {
    if (identity.sourceRevision === record.candidate.sourceRevision) throw new Error('Synthetic asset 404')
    await verify(identity)
  }
  await assert.rejects(executeCanonicalRelease('activate', record, p.ports), /asset 404/)
  assert.equal(p.ports.journal()!.phase, 'activating')
  assert.equal((await executeCanonicalRelease('rollback', record, p.ports)).phase, 'rolled-back')
  assert.equal(p.calls.filter((c) => c.startsWith('activate-')).at(-1), `activate-${recoveryVersion}`)
})
test('uncertain guarded rollback reconciles by readback rather than replaying the deployment', async (t) => {
  const { record } = fixture(t),
    p = provider(record),
    activate = p.ports.activate
  await executeCanonicalRelease('upload', record, p.ports)
  await executeCanonicalRelease('activate', record, p.ports)
  p.ports.activate = async (...args) => {
    await activate(...args)
    throw new Error('Synthetic response lost')
  }
  await assert.rejects(executeCanonicalRelease('rollback', record, p.ports), /response lost/)
  assert.equal((await executeCanonicalRelease('reconcile', record, p.ports)).phase, 'rolled-back')
  assert.equal(p.calls.filter((c) => c.startsWith('activate-')).length, 2)
})
function liveRequest(identity: PackageIdentity, mutate?: (url: string, response: Response) => Response) {
  const requests: string[] = []
  const request = async (input: string | URL | Request) => {
    const url = String(input),
      parsed = new URL(url)
    assert.equal(parsed.origin, CANONICAL_FAMILY.origin)
    requests.push(url)
    const response = new Response(readFileSync(join(identity.directory, parsed.pathname.slice(1))))
    Object.defineProperty(response, 'url', { value: url, configurable: true })
    return mutate ? mutate(url, response) : response
  }
  return { request: request as typeof fetch, requests }
}
function headerLiveRequest(identity: PackageIdentity, mutate?: (url: URL, response: Response) => Response) {
  const requests: string[] = []
  const policy = packageHeaderPolicy(identity.directory)
  const manifest = verifyCanonicalPackage(identity)
  const request = async (input: string | URL | Request, options?: RequestInit) => {
    assert.equal(options?.redirect, 'manual')
    assert.equal(options?.credentials, 'omit')
    const url = new URL(String(input))
    assert.equal(url.origin, CANONICAL_FAMILY.origin)
    requests.push(url.href)
    let response: Response
    if (url.pathname.endsWith('.html')) {
      const next = new URL(url)
      next.pathname = next.pathname === '/index.html' ? '/' : next.pathname.slice(0, -5)
      response = new Response(null, { status: 307, headers: { location: next.href } })
    } else {
      const path = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
      const file = manifest.files.find((file) => file.path === path || file.path === `${path}.html`)?.path
      response = new Response(
        path === 'family-beta-manifest.json'
          ? JSON.stringify(manifest)
          : file
            ? readFileSync(join(identity.directory, file))
            : 'Not found',
        {
          status: file || path === 'family-beta-manifest.json' ? 200 : 404,
          headers: effectiveFamilyHeaders(policy, url.pathname),
        },
      )
    }
    Object.defineProperty(response, 'url', { value: url.href })
    return mutate ? mutate(url, response) : response
  }
  return { request: request as typeof fetch, requests, policy }
}
test('live policy verifier checks every asset, each queried HTML/clean grade entry and the missing-asset policy for candidate and recovery', async (t) => {
  const { record } = transitionFixture(t)
  for (const identity of [record.candidate, record.recovery]) {
    const live = headerLiveRequest(identity)
    const result = await verifyCanonicalLive(identity, live.request, live.policy)
    assert.equal(result.headerResponses, result.publicFiles + 27)
    assert(live.requests.some((url) => url.endsWith('/family-game?grade=kindergarten')))
    assert(live.requests.some((url) => url.endsWith('/family-beta-preview.html?grade=grade5')))
    assert(live.requests.some((url) => url.endsWith('/assets/__ninja_header_probe_missing__.js')))
  }
})
for (const fault of [
  'missing-csp',
  'asset-cache',
  'missing-asset-cache',
  'query-loss',
  'external-redirect',
  'route-swap',
] as const) {
  test(`live policy verification refuses ${fault} without unchecked redirects`, async (t) => {
    const { record } = transitionFixture(t)
    const live = headerLiveRequest(record.candidate, (url, response) => {
      if (fault === 'missing-csp' && response.status === 200) response.headers.delete('content-security-policy')
      if (fault === 'asset-cache' && url.pathname.endsWith('app-Abcd1234.js'))
        response.headers.set('cache-control', 'no-store, public, max-age=31536000, immutable')
      if (fault === 'missing-asset-cache' && url.pathname.endsWith('__ninja_header_probe_missing__.js'))
        response.headers.set('cache-control', 'public, max-age=31536000, immutable')
      if (response.status === 307 && url.search) {
        if (fault === 'query-loss') response.headers.set('location', url.pathname.replace('.html', ''))
        if (fault === 'external-redirect') response.headers.set('location', 'https://wrong.invalid/')
        if (fault === 'route-swap') response.headers.set('location', `/family-game${url.search}`)
      }
      return response
    })
    await assert.rejects(
      verifyCanonicalLive(record.candidate, live.request, live.policy),
      /Served .* differs|redirected off origin or changed/,
    )
    assert(live.requests.every((url) => url.startsWith(CANONICAL_FAMILY.origin)))
  })
}
test('canonical verifier checks the retained manifest and every public byte without touching older aliases', async (t) => {
  const { record } = fixture(t),
    live = liveRequest(record.candidate)
  const result = await verifyCanonicalLive(record.candidate, live.request)
  assert.equal(
    result.publicFiles,
    verifyCanonicalPackage(record.candidate).files.filter((f) => f.path !== '_headers' && !f.path.startsWith('.'))
      .length,
  )
  assert(live.requests.every((url) => url.startsWith(CANONICAL_FAMILY.origin + '/')))
  assert.equal(live.requests.length, result.publicFiles + 1)
})
for (const fault of ['redirect', 'asset-byte', 'asset-404', 'manifest-source'] as const) {
  test(`canonical read-only verification rejects ${fault}`, async (t) => {
    const { record } = fixture(t),
      live = liveRequest(record.candidate, (url, response) => {
        if (fault === 'redirect') {
          Object.defineProperty(response, 'url', { value: 'https://obsolete.example/' })
          return response
        }
        if (fault === 'manifest-source' && url.endsWith('family-beta-manifest.json')) {
          const manifest = verifyCanonicalPackage(record.candidate)
          const changed = new Response(JSON.stringify({ ...manifest, sourceRevision: 'c'.repeat(40) }))
          Object.defineProperty(changed, 'url', { value: url })
          return changed
        }
        if (!url.endsWith('family-beta-manifest.json')) {
          const changed = new Response(fault === 'asset-byte' ? 'changed bytes' : '', {
            status: fault === 'asset-404' ? 404 : 200,
          })
          Object.defineProperty(changed, 'url', { value: url })
          return changed
        }
        return response
      })
    const expected = {
      redirect: /redirected off origin/,
      'asset-byte': /Live asset differs/,
      'asset-404': /Asset unavailable/,
      'manifest-source': /live identity differs/,
    }
    await assert.rejects(verifyCanonicalLive(record.candidate, live.request), expected[fault])
  })
}
for (const operation of ['plan', 'upload', 'activate', 'rollback', 'reconcile']) {
  test(`CLI ${operation} defaults to an offline dry-run with no journal or provider executable`, (t) => {
    const { root, record } = fixture(t)
    const path = join(root, 'release.json')
    writeFileSync(path, JSON.stringify(record))
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', 'scripts/release-family.ts', operation, '--record', path],
      { encoding: 'utf8', env: { ...process.env, PATH: '' } },
    )
    assert.equal(result.status, 0, result.stderr)
    const plan = JSON.parse(result.stdout)
    assert.equal(plan.dryRun, true)
    assert.equal(plan.destination.origin, CANONICAL_FAMILY.origin)
    assert.equal(plan.expectedActive, previousVersion)
  })
}
test('CLI refuses unknown flags and execution without exact repeated identities before invoking any program', (t) => {
  const { root, record } = fixture(t),
    path = join(root, 'release.json')
  writeFileSync(path, JSON.stringify(record))
  for (const flags of [['--execute'], ['--origin', 'https://wrong.example'], ['--record', path]]) {
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', 'scripts/release-family.ts', 'upload', '--record', path, ...flags],
      { encoding: 'utf8', env: { ...process.env, PATH: '' } },
    )
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Repeat the exact candidate|Unknown or repeated/)
  }
})
const obsolete = [
  'deploy-family-beta',
  'deploy-grade2-pages',
  'publish-reviewed-grade2',
  'package-live-family',
  'package-grade5-review',
  'package-family-sync-alias',
]
for (const name of obsolete) {
  test(`${name} stops before credentials, commands, packaging or hosting even with execute flags`, () => {
    const source = readFileSync(resolve(`scripts/${name}.ts`), 'utf8')
    assert.match(source.trim(), /^throw new Error\(/)
    assert.doesNotMatch(source, /\bimport\b|execFile|spawn|writeFile|process\.env/)
    assert.match(readFileSync(resolve(`archive/deployment/${name}.ts.disabled`), 'utf8'), /^throw new Error/)
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', `scripts/${name}.ts`, '--execute', '--confirm-project=weeklydictationapp'],
      { encoding: 'utf8' },
    )
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Archived/)
  })
}
test('active npm release commands and workflow make canonical versus reference packaging explicit', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  for (const name of [
    'family-beta:preview',
    'family-beta:promote',
    'family-beta:rollback',
    'grade2-beta:promote',
    'grade2-beta:rollback',
  ])
    assert.equal(pkg.scripts[name], undefined)
  assert.match(pkg.scripts['release:family'], /scripts\/release-family\.ts/)
  assert.match(
    readFileSync('.github/workflows/family-beta-artifacts.yml', 'utf8'),
    /reference artifacts \(not live releases\)/,
  )
  const cli = readFileSync('scripts/release-family.ts', 'utf8')
  assert.match(cli, /\.release\.lock/)
  assert.match(cli, /const environment = canonicalProviderEnvironment\(process.env\)/)
  assert.doesNotMatch(cli, /hosting:clone|git', \['push|triggers', 'deploy|firestore:rules|run', 'deploy/)
  const example = JSON.parse(readFileSync('deployment/canonical-family-release.example.json', 'utf8'))
  assert.deepEqual(example.approval.grades, [])
  assert.throws(() => verifyReleaseRecord(example))
})
