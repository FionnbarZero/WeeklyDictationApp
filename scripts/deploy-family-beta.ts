import { execFileSync, spawnSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { loadEnv } from 'vite'
import {
  FAMILY_BETA_FIREBASE_PROJECT_ID,
  candidateChannelId,
  familyBetaGradeConfig,
  requireFamilyBetaGrade,
  requireFirebaseResourceId,
  requireFullGitRevision,
  rollbackChannelId,
  verifyFamilyBetaArtifact,
  type FamilyBetaGrade,
} from './familyBetaRelease.ts'
import {
  familyBetaHostingConfig,
  channelHasRelease,
  previewDeliveryPlan,
  promotionDeliveryPlan,
  rollbackDeliveryPlan,
  type FamilyBetaDeliveryIdentity,
  type FamilyBetaHostingChannel,
} from './familyBetaDelivery.ts'

const root = resolve(import.meta.dirname, '..')
const fileEnvironment = loadEnv('family-beta', root, '')
const environment = { ...fileEnvironment, ...process.env }
const operation = process.argv[2]
const execute = process.argv.includes('--execute')

function flag(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function capture(program: string, args: string[]) {
  return execFileSync(program, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
}

function run(command: readonly string[]) {
  const [program, ...args] = command
  const result = spawnSync(program, args, { cwd: root, encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    process.stderr.write(result.stderr)
    throw new Error(`${command.join(' ')} failed with exit code ${result.status}.`)
  }
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.stdout) process.stdout.write(result.stdout)
  return result.stdout.trim()
}

function environmentSite(grade: FamilyBetaGrade) {
  return grade === 'kindergarten'
    ? environment.FAMILY_BETA_KINDERGARTEN_SITE_ID
    : environment.FAMILY_BETA_GRADE5_SITE_ID
}

function deliveryIdentity() {
  const grade = requireFamilyBetaGrade(flag('--grade'))
  const expectedSiteId = familyBetaGradeConfig[grade].siteId
  const projectId = requireFirebaseResourceId(
    flag('--project') || environment.FAMILY_BETA_FIREBASE_PROJECT_ID || FAMILY_BETA_FIREBASE_PROJECT_ID,
    'Family beta project ID',
  )
  const siteId = requireFirebaseResourceId(
    flag('--site') || environmentSite(grade) || expectedSiteId,
    'Family beta site ID',
  )
  if (projectId !== FAMILY_BETA_FIREBASE_PROJECT_ID) {
    throw new Error(`Family beta delivery is locked to Firebase project ${FAMILY_BETA_FIREBASE_PROJECT_ID}.`)
  }
  if (siteId !== expectedSiteId) {
    throw new Error(`${familyBetaGradeConfig[grade].displayName} delivery is locked to Hosting site ${expectedSiteId}.`)
  }
  if (/(?:^|-)staging(?:-|$)|(?:^|-)stg(?:-|$)/.test(projectId)) {
    throw new Error('Family beta delivery cannot target the synthetic staging project.')
  }
  if (flag('--confirm-project') !== projectId) throw new Error(`Repeat --confirm-project ${projectId} exactly.`)
  if (flag('--confirm-site') !== siteId) throw new Error(`Repeat --confirm-site ${siteId} exactly.`)
  return { grade, projectId, siteId } satisfies FamilyBetaDeliveryIdentity
}

function assertCleanWorktree() {
  if (capture('git', ['status', '--porcelain']))
    throw new Error('Executing family beta delivery requires a clean Git worktree.')
}

function renderPlan(commands: readonly (readonly string[])[]) {
  console.log(execute ? 'Executing family beta delivery plan:' : 'Family beta delivery dry run:')
  for (const command of commands) console.log(command.join(' '))
  if (!execute) console.log('No Firebase state changed. Repeat with --execute after review.')
}

function channels(identity: FamilyBetaDeliveryIdentity) {
  const raw = run([
    'npx',
    'firebase',
    'hosting:channel:list',
    '--site',
    identity.siteId,
    '--project',
    identity.projectId,
    '--json',
  ])
  const parsed = JSON.parse(raw) as { result?: { channels?: FamilyBetaHostingChannel[] } }
  return parsed.result?.channels || []
}

function channel(identity: FamilyBetaDeliveryIdentity, channelId: string) {
  const match = channels(identity).find((item) => item.name.endsWith(`/channels/${channelId}`))
  if (!match) throw new Error(`Hosting channel ${identity.siteId}:${channelId} does not exist.`)
  return match
}

function assertNoLiveRelease(identity: FamilyBetaDeliveryIdentity) {
  const live = channels(identity).find((item) => item.name.endsWith('/channels/live'))
  if (channelHasRelease(live)) {
    throw new Error(
      `Hosting site ${identity.siteId} already has a live release. Use --previous-revision instead of --initial-release.`,
    )
  }
}

async function verifyHostedRevision(identity: FamilyBetaDeliveryIdentity, channelId: string, revision: string) {
  const expected = requireFullGitRevision(revision)
  const hosted = channel(identity, channelId)
  const response = await fetch(hosted.url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`Hosted revision check failed with HTTP ${response.status}.`)
  if (!(await response.text()).includes(`revision=${expected}`)) {
    throw new Error(`Hosting channel ${identity.siteId}:${channelId} does not expose revision ${expected}.`)
  }
  console.log(`Verified ${identity.siteId}:${channelId} at ${hosted.url} as revision ${expected}.`)
}

async function preview(identity: FamilyBetaDeliveryIdentity) {
  const artifactDirectory = resolve(root, flag('--artifact') || `family-beta-dist/${identity.grade}`)
  const manifest = verifyFamilyBetaArtifact(artifactDirectory, identity.grade)
  if (execute) assertCleanWorktree()
  const configPath = resolve(root, `.firebase-family-beta-${process.pid}.generated.json`)
  const config = familyBetaHostingConfig(identity.siteId, relative(root, artifactDirectory))
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
  try {
    const plan = previewDeliveryPlan(identity, manifest.sourceRevision, basenameForCommand(configPath))
    renderPlan(plan.commands)
    if (!execute) return
    for (const command of plan.commands) run(command)
    await verifyHostedRevision(identity, plan.channel, manifest.sourceRevision)
  } finally {
    rmSync(configPath, { force: true })
  }
}

function basenameForCommand(path: string) {
  return relative(root, path)
}

async function promote(identity: FamilyBetaDeliveryIdentity) {
  const revision = requireFullGitRevision(flag('--revision'), 'Promotion revision')
  if (flag('--confirm-revision') !== revision) throw new Error(`Repeat --confirm-revision ${revision} exactly.`)
  const initialRelease = process.argv.includes('--initial-release')
  const previousRevision = initialRelease
    ? undefined
    : requireFullGitRevision(flag('--previous-revision'), 'Previous stable revision')
  const plan = promotionDeliveryPlan(identity, revision, previousRevision)
  renderPlan(plan.commands)
  if (!execute) return
  assertCleanWorktree()
  await verifyHostedRevision(identity, candidateChannelId(revision), revision)
  if (initialRelease) assertNoLiveRelease(identity)
  if (previousRevision) await verifyHostedRevision(identity, 'live', previousRevision)
  for (const command of plan.commands) run(command)
  if (previousRevision) await verifyHostedRevision(identity, rollbackChannelId(previousRevision), previousRevision)
  await verifyHostedRevision(identity, 'live', revision)
}

async function rollback(identity: FamilyBetaDeliveryIdentity) {
  const revision = requireFullGitRevision(flag('--revision'), 'Rollback revision')
  if (flag('--confirm-revision') !== revision) throw new Error(`Repeat --confirm-revision ${revision} exactly.`)
  const plan = rollbackDeliveryPlan(identity, revision)
  renderPlan(plan.commands)
  if (!execute) return
  assertCleanWorktree()
  await verifyHostedRevision(identity, plan.source, revision)
  for (const command of plan.commands) run(command)
  await verifyHostedRevision(identity, 'live', revision)
}

if (!['preview', 'promote', 'rollback'].includes(operation)) {
  throw new Error('Use preview, promote, or rollback as the family beta delivery operation.')
}

const identity = deliveryIdentity()
if (operation === 'preview') await preview(identity)
if (operation === 'promote') await promote(identity)
if (operation === 'rollback') await rollback(identity)
