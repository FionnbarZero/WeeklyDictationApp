import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import {
  channelHasRelease,
  channelIsRetained,
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
  GRADE2_CURRICULUM_DOCUMENT_ID,
  GRADE2_CURRICULUM_SNAPSHOT_SCHEMA,
  GRADE2_CURRICULUM_SOURCE_PATH,
  type FamilyBetaArtifactManifest,
  type FamilyBetaGrade,
  familyBetaGradeConfig,
  fileTreeSha256,
  requireMatchingSourceRevision,
  rollbackChannelId,
  verifyFamilyBetaArtifact,
  sha256,
} from '../scripts/familyBetaRelease.ts'
import {
  GRADE2_PAGES_ORIGIN,
  GRADE2_PAGES_REF,
  GRADE2_PAGES_REMOTE_URL,
  grade2PagesPromotionPlan,
  grade2PagesRollbackPlan,
  requireGrade2PagesOrigin,
} from '../scripts/grade2PagesDelivery.ts'

const revision = '1234567890abcdef1234567890abcdef12345678'
const previousRevision = 'abcdef1234567890abcdef1234567890abcdef12'
const identity = {
  grade: 'kindergarten' as const,
  projectId: 'weeklydictationapp',
  siteId: 'weeklydictation-k-beta',
}

function verifiedArtifact(artifactGrade: FamilyBetaGrade = 'kindergarten') {
  const directory = mkdtempSync(join(tmpdir(), 'weekly-dictation-family-beta-'))
  const grade = familyBetaGradeConfig[artifactGrade]
  writeFileSync(
    resolve(directory, 'index.html'),
    `<html><body>${grade.displayName}<code>status=${grade.status} | version=0.2.0-stage2 | revision=${revision} | persistence=${grade.persistence}</code></body></html>`,
  )
  writeFileSync(resolve(directory, 'app.js'), 'console.log("family beta")\n')
  let curriculumSource: FamilyBetaArtifactManifest['curriculumSource']
  if (artifactGrade === 'grade2') {
    writeFileSync(resolve(directory, '.nojekyll'), '\n')
    const presentation = {
      presentationId: GRADE2_CURRICULUM_DOCUMENT_ID,
      slides: [{ objectId: 'slide-1', text: 'Week 10/5-10/9\nMandarin\nTier 1: 英雄' }],
    }
    const contentSha256 = sha256(JSON.stringify(presentation))
    const snapshot = {
      schema: GRADE2_CURRICULUM_SNAPSHOT_SCHEMA,
      source: {
        type: 'google-slides',
        documentId: GRADE2_CURRICULUM_DOCUMENT_ID,
        documentUrl: `https://docs.google.com/presentation/d/${GRADE2_CURRICULUM_DOCUMENT_ID}`,
        retrievedAt: '2026-10-03T00:00:00.000Z',
        contentSha256,
      },
      presentation,
    }
    const curriculumPath = resolve(directory, GRADE2_CURRICULUM_SOURCE_PATH)
    mkdirSync(dirname(curriculumPath), { recursive: true })
    writeFileSync(curriculumPath, `${JSON.stringify(snapshot, null, 2)}\n`)
    curriculumSource = { ...snapshot.source, artifactPath: GRADE2_CURRICULUM_SOURCE_PATH, datasetCount: 1 }
  }
  const files = artifactFileRecords(directory)
  const manifest: FamilyBetaArtifactManifest = {
    schema: FAMILY_BETA_ARTIFACT_SCHEMA,
    grade: artifactGrade,
    displayName: grade.displayName,
    status: grade.status,
    persistence: grade.persistence,
    applicationVersion: '0.2.0-stage2',
    sourceRevision: revision,
    sourceCommittedAt: '2026-10-03T00:00:00.000Z',
    dirty: false,
    entry: 'index.html',
    build: {
      command: `npm run package:family-beta -- --grade ${artifactGrade}`,
      node: 'v24.0.0',
      npm: '11.0.0',
      packageLockSha256: 'a'.repeat(64),
    },
    ...(curriculumSource ? { curriculumSource } : {}),
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

test('a Grade 2 artifact carries its durable identity and GitHub Pages marker', () => {
  const directory = verifiedArtifact('grade2')
  try {
    const manifest = verifyFamilyBetaArtifact(directory, 'grade2')
    assert.equal(manifest.status, 'Family beta')
    assert.match(manifest.persistence, /Tier 1 writing durable here/)
    assert.ok(manifest.files.some((file) => file.path === '.nojekyll'))
    assert.equal(manifest.curriculumSource?.documentId, GRADE2_CURRICULUM_DOCUMENT_ID)
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
  assert.equal(rollbackChannelId(previousRevision), 'rollback-stable-abcdef123456')

  const preview = previewDeliveryPlan(identity, revision, '.firebase-family-beta-123.generated.json')
  assert.equal(preview.channel, 'candidate-1234567890ab')
  assert.match(preview.commands[0].join(' '), /hosting:channel:deploy candidate-1234567890ab/)
  assert.match(preview.commands[0].join(' '), /--project weeklydictationapp/)

  const promotion = promotionDeliveryPlan(identity, revision, previousRevision)
  assert.equal(promotion.commands.length, 2)
  assert.match(promotion.commands[0].join(' '), /weeklydictation-k-beta:live weeklydictation-k-beta:rollback-/)
  assert.match(promotion.commands[1].join(' '), /weeklydictation-k-beta:candidate-.* weeklydictation-k-beta:live/)

  const rollback = rollbackDeliveryPlan(identity, previousRevision)
  assert.equal(rollback.source, 'rollback-stable-abcdef123456')
  assert.doesNotMatch(rollback.commands.flat().join(' '), /grade5|weeklydictation-g5-beta/)
})

test('Grade 2 Pages promotion and rollback preserve the storage origin with fast-forward deployments', () => {
  assert.equal(requireGrade2PagesOrigin(GRADE2_PAGES_ORIGIN), GRADE2_PAGES_ORIGIN)
  assert.equal(GRADE2_PAGES_REMOTE_URL, 'https://github.com/FionnbarZero/WeeklyDictationApp.git')
  assert.throws(() => requireGrade2PagesOrigin('https://weeklydictation-g2-preview.web.app/'), /confirm-origin/)

  const promotion = grade2PagesPromotionPlan(revision, previousRevision)
  assert.equal(promotion.destinationRef, GRADE2_PAGES_REF)
  assert.equal(promotion.fastForwardParent, previousRevision)
  assert.equal(promotion.treeSource, 'verified-grade2-artifact')

  const rollback = grade2PagesRollbackPlan(previousRevision, revision)
  assert.equal(rollback.destinationRef, GRADE2_PAGES_REF)
  assert.equal(rollback.fastForwardParent, revision)
  assert.equal(rollback.treeSource, `${previousRevision}^{tree}`)
  assert.throws(() => grade2PagesRollbackPlan(revision, revision), /must differ/i)
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

test('only channels without an expiration satisfy retained rollback policy', () => {
  assert.equal(
    channelIsRetained({
      name: 'projects/example/sites/example/channels/rollback-stable-abc123',
      url: 'https://example.web.app',
    }),
    true,
  )
  assert.equal(
    channelIsRetained({
      name: 'projects/example/sites/example/channels/rollback-abc123',
      url: 'https://example.web.app',
      expireTime: '2026-10-11T00:00:00Z',
    }),
    false,
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

test('the packaging workflow includes Grade 2 but stable delivery remains locked to its existing origin', () => {
  const workflow = readFileSync(resolve('.github/workflows/family-beta-artifacts.yml'), 'utf8')
  const deployScript = readFileSync(resolve('scripts/deploy-family-beta.ts'), 'utf8')
  const grade2DeployScript = readFileSync(resolve('scripts/deploy-grade2-pages.ts'), 'utf8')
  const deliveryPlans = readFileSync(resolve('scripts/familyBetaDelivery.ts'), 'utf8')
  assert.match(workflow, /grade: \[kindergarten, grade2, grade5\]/)
  assert.match(workflow, /actions\/upload-artifact@v4/)
  assert.doesNotMatch(workflow, /deploy-pages|gh-pages/)
  assert.match(deliveryPlans, /hosting:channel:deploy/)
  assert.match(deliveryPlans, /hosting:clone/)
  assert.match(deployScript, /Grade 2 uses Firebase Hosting for disposable preview only/)
  assert.doesNotMatch(deliveryPlans, /gh-pages|Grade 2|grade2/)
  assert.match(grade2DeployScript, /refs\/heads\/gh-pages|GRADE2_PAGES_REF/)
  assert.match(grade2DeployScript, /delivery is locked to Git remote/)
  assert.match(grade2DeployScript, /fast-forward commit/)
  assert.doesNotMatch(grade2DeployScript, /--force-with-lease|push[^\n]+--force|hosting:clone/)
  assert.match(deployScript, /already has a live release/)
  assert.match(deployScript, /delivery is locked to Hosting site/)
})
