import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import {
  channelHasRelease,
  familyBetaHostingConfig,
  familyBetaHostingHeaders,
  previewDeliveryPlan,
  promotionDeliveryPlan,
  rollbackDeliveryPlan,
} from '../scripts/familyBetaDelivery.ts'
import {
  artifactFileRecords,
  candidateChannelId,
  FAMILY_BETA_ARTIFACT_SCHEMA,
  type FamilyBetaArtifactManifest,
  familyBetaGradeConfig,
  fileTreeSha256,
  requireMatchingSourceRevision,
  rollbackChannelId,
  verifyFamilyBetaArtifact,
} from '../scripts/familyBetaRelease.ts'

const revision = '1234567890abcdef1234567890abcdef12345678'
const previousRevision = 'abcdef1234567890abcdef1234567890abcdef12'
const identity = {
  grade: 'kindergarten' as const,
  projectId: 'weeklydictationapp',
  siteId: 'weeklydictation-k-beta',
  rollbackSiteId: 'weeklydictation-k-rollback',
}

function verifiedArtifact() {
  const directory = mkdtempSync(join(tmpdir(), 'weekly-dictation-family-beta-'))
  const grade = familyBetaGradeConfig.kindergarten
  writeFileSync(
    resolve(directory, 'index.html'),
    `<html><body>${grade.displayName}<code>status=${grade.status} | version=0.2.0-stage2 | revision=${revision} | persistence=${grade.persistence}</code></body></html>`,
  )
  writeFileSync(resolve(directory, 'app.js'), 'console.log("family beta")\n')
  const files = artifactFileRecords(directory)
  const manifest: FamilyBetaArtifactManifest = {
    schema: FAMILY_BETA_ARTIFACT_SCHEMA,
    grade: 'kindergarten',
    displayName: grade.displayName,
    status: grade.status,
    persistence: grade.persistence,
    applicationVersion: '0.2.0-stage2',
    sourceRevision: revision,
    sourceCommittedAt: '2026-10-03T00:00:00.000Z',
    dirty: false,
    entry: 'index.html',
    build: {
      command: 'npm run package:family-beta -- --grade kindergarten',
      node: 'v24.0.0',
      npm: '11.0.0',
      packageLockSha256: 'a'.repeat(64),
    },
    fileTreeSha256: fileTreeSha256(files),
    files,
  }
  writeFileSync(resolve(directory, 'family-beta-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return directory
}

test('an isolated grade artifact verifies its exact file inventory and displayed revision', () => {
  const directory = verifiedArtifact()
  try {
    const manifest = verifyFamilyBetaArtifact(directory, 'kindergarten')
    assert.equal(manifest.sourceRevision, revision)
    assert.equal(manifest.fileTreeSha256, fileTreeSha256(manifest.files))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('artifact verification rejects mutations, dirty builds, and a destination-grade mismatch', () => {
  const directory = verifiedArtifact()
  try {
    writeFileSync(resolve(directory, 'app.js'), 'changed after review\n')
    assert.throws(() => verifyFamilyBetaArtifact(directory, 'kindergarten'), /inventory does not match/i)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }

  const dirtyDirectory = verifiedArtifact()
  try {
    const manifestPath = resolve(dirtyDirectory, 'family-beta-manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest.dirty = true
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    assert.throws(() => verifyFamilyBetaArtifact(dirtyDirectory, 'kindergarten'), /dirty-worktree/i)
    assert.throws(() => verifyFamilyBetaArtifact(dirtyDirectory, 'grade5'), /requested destination/i)
  } finally {
    rmSync(dirtyDirectory, { recursive: true, force: true })
  }
})

test('preview, exact promotion, and rollback plans remain grade-specific', () => {
  assert.equal(candidateChannelId(revision), 'candidate-1234567890ab')
  assert.equal(rollbackChannelId(previousRevision), 'rollback-abcdef123456')

  const preview = previewDeliveryPlan(identity, revision, '.firebase-family-beta-123.generated.json')
  assert.equal(preview.channel, 'candidate-1234567890ab')
  assert.match(preview.commands[0].join(' '), /hosting:channel:deploy candidate-1234567890ab/)
  assert.match(preview.commands[0].join(' '), /--project weeklydictationapp/)

  const promotion = promotionDeliveryPlan(identity, revision, previousRevision)
  assert.equal(promotion.commands.length, 2)
  assert.match(promotion.commands[0].join(' '), /weeklydictation-k-beta:live weeklydictation-k-rollback:live/)
  assert.match(promotion.commands[1].join(' '), /weeklydictation-k-beta:candidate-.* weeklydictation-k-beta:live/)

  const rollback = rollbackDeliveryPlan(identity, previousRevision)
  assert.equal(rollback.source, 'weeklydictation-k-rollback:live')
  assert.doesNotMatch(rollback.commands.flat().join(' '), /grade5|weeklydictation-g5-beta/)
})

test('packaging cannot label a different checked-out revision as its source', () => {
  assert.equal(requireMatchingSourceRevision(revision, revision), revision)
  assert.throws(() => requireMatchingSourceRevision(previousRevision, revision), /not checked out at HEAD/)
})

test('an automatically provisioned empty live channel is not an existing release', () => {
  assert.equal(
    channelHasRelease({ name: 'projects/example/sites/example/channels/live', url: 'https://example.web.app' }),
    false,
  )
  assert.equal(
    channelHasRelease({
      name: 'projects/example/sites/example/channels/live',
      url: 'https://example.web.app',
      release: { version: { name: 'projects/example/sites/example/versions/abc123' } },
    }),
    true,
  )
})

test('family beta routes bypass caches while fingerprinted assets remain immutable', () => {
  assert.deepEqual(familyBetaHostingHeaders.slice(0, 2), [
    { source: '**', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    {
      source: '/assets/**',
      headers: [{ key: 'Cache-Control', value: 'public,max-age=31536000,immutable' }],
    },
  ])

  const config = familyBetaHostingConfig('weeklydictation-g5-beta', 'family-beta-dist/grade5')
  assert.equal(config.hosting.site, 'weeklydictation-g5-beta')
  assert.deepEqual(config.hosting.headers, familyBetaHostingHeaders)
  assert.deepEqual(config.hosting.rewrites, [{ source: '**', destination: '/index.html' }])
})

test('the packaging workflow cannot deploy or replace the shared Grade 2 site', () => {
  const workflow = readFileSync(resolve('.github/workflows/family-beta-artifacts.yml'), 'utf8')
  const deployScript = readFileSync(resolve('scripts/deploy-family-beta.ts'), 'utf8')
  const deliveryPlans = readFileSync(resolve('scripts/familyBetaDelivery.ts'), 'utf8')
  assert.match(workflow, /grade: \[kindergarten, grade5\]/)
  assert.match(workflow, /actions\/upload-artifact@v4/)
  assert.doesNotMatch(workflow, /deploy-pages|gh-pages|grade2/)
  assert.match(deliveryPlans, /hosting:channel:deploy/)
  assert.match(deliveryPlans, /hosting:clone/)
  assert.doesNotMatch(deployScript, /gh-pages|Grade 2|grade2/)
  assert.doesNotMatch(deliveryPlans, /gh-pages|Grade 2|grade2/)
  assert.match(deployScript, /already has a live release/)
  assert.match(deployScript, /delivery is locked to Hosting site/)
})
