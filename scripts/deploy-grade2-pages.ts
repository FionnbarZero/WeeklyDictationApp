import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { requireFullGitRevision, sha256, verifyFamilyBetaArtifact } from './familyBetaRelease.ts'
import {
  GRADE2_PAGES_ORIGIN,
  GRADE2_PAGES_REF,
  GRADE2_PAGES_REMOTE_URL,
  grade2PagesPromotionPlan,
  grade2PagesRollbackPlan,
  requireGrade2PagesOrigin,
} from './grade2PagesDelivery.ts'

const root = resolve(import.meta.dirname, '..')
const operation = process.argv[2]
const execute = process.argv.includes('--execute')

function flag(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function capture(program: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  return execFileSync(program, args, {
    cwd: options.cwd || root,
    env: options.env || process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim()
}

function run(program: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  const result = spawnSync(program, args, {
    cwd: options.cwd || root,
    env: options.env || process.env,
    encoding: 'utf8',
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${program} ${args.join(' ')} failed with exit code ${result.status}.`)
}

function assertCleanWorktree() {
  if (capture('git', ['status', '--porcelain'])) {
    throw new Error('Executing Grade 2 Pages delivery requires a clean Git worktree.')
  }
}

function assertExpectedRemote() {
  const remote = capture('git', ['remote', 'get-url', 'origin'])
  if (remote !== GRADE2_PAGES_REMOTE_URL) {
    throw new Error(`Grade 2 delivery is locked to Git remote ${GRADE2_PAGES_REMOTE_URL}.`)
  }
}

function assertRepeatedFlag(name: string, expected: string) {
  if (flag(name) !== expected) throw new Error(`Repeat ${name} ${expected} exactly.`)
}

function renderPlan(lines: readonly string[]) {
  console.log(execute ? 'Executing Grade 2 Pages delivery plan:' : 'Grade 2 Pages delivery dry run:')
  for (const line of lines) console.log(`- ${line}`)
  if (!execute) console.log('No Git branch, Firebase resource, or child-facing destination changed.')
}

function fetchPagesBranch() {
  run('git', ['fetch', 'origin', 'gh-pages'])
  return requireFullGitRevision(capture('git', ['rev-parse', 'origin/gh-pages']), 'Fetched Grade 2 deployment')
}

function assertCommitExists(revision: string) {
  run('git', ['cat-file', '-e', `${revision}^{commit}`])
}

function assertAncestor(ancestor: string, descendant: string) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: root, stdio: 'ignore' })
  if (result.status !== 0)
    throw new Error(`Rollback target ${ancestor} is not retained in deployment history ${descendant}.`)
}

function createArtifactTree(artifactDirectory: string) {
  const temporary = mkdtempSync(join(tmpdir(), 'weekly-dictation-grade2-pages-index-'))
  const indexPath = resolve(temporary, 'index')
  const gitDirectory = capture('git', ['rev-parse', '--absolute-git-dir'])
  const environment = { ...process.env, GIT_INDEX_FILE: indexPath }
  const git = [`--git-dir=${gitDirectory}`, `--work-tree=${artifactDirectory}`]
  try {
    run('git', [...git, 'read-tree', '--empty'], { cwd: artifactDirectory, env: environment })
    run('git', [...git, 'add', '--all', '--force', '.'], { cwd: artifactDirectory, env: environment })
    return capture('git', [...git, 'write-tree'], { cwd: artifactDirectory, env: environment })
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

function createDeploymentCommit(tree: string, parent: string, message: string) {
  const environment = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Weekly Dictation Release',
    GIT_AUTHOR_EMAIL: 'weekly-dictation-release@users.noreply.github.com',
    GIT_COMMITTER_NAME: 'Weekly Dictation Release',
    GIT_COMMITTER_EMAIL: 'weekly-dictation-release@users.noreply.github.com',
  }
  return execFileSync('git', ['commit-tree', tree, '-p', parent], {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    input: `${message}\n`,
  }).trim()
}

function pushDeployment(commit: string) {
  run('git', ['push', 'origin', `${commit}:${GRADE2_PAGES_REF}`])
  const remote = capture('git', ['ls-remote', 'origin', GRADE2_PAGES_REF]).split(/\s+/)[0]
  if (remote !== commit)
    throw new Error(`Grade 2 deployment verification expected ${commit}, received ${remote || 'none'}.`)
}

async function waitForLive(check: (body: Buffer) => boolean, expected: string) {
  let lastStatus = 0
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const url = new URL(GRADE2_PAGES_ORIGIN)
    url.searchParams.set('release-check', `${Date.now()}-${attempt}`)
    const response = await fetch(url, { cache: 'no-store', redirect: 'follow' })
    lastStatus = response.status
    if (response.ok && check(Buffer.from(await response.arrayBuffer()))) return
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000))
  }
  throw new Error(`The Grade 2 live origin did not expose ${expected}; last HTTP status was ${lastStatus}.`)
}

async function promote() {
  requireGrade2PagesOrigin(flag('--confirm-origin'))
  const revision = requireFullGitRevision(flag('--revision'), 'Grade 2 source revision')
  assertRepeatedFlag('--confirm-revision', revision)
  const previous = requireFullGitRevision(flag('--previous-deployment'), 'Current Grade 2 deployment')
  assertRepeatedFlag('--confirm-previous-deployment', previous)
  const artifactDirectory = resolve(root, flag('--artifact') || 'family-beta-dist/grade2')
  const manifest = verifyFamilyBetaArtifact(artifactDirectory, 'grade2')
  if (manifest.sourceRevision !== revision) {
    throw new Error(`The Grade 2 artifact contains revision ${manifest.sourceRevision}, not ${revision}.`)
  }
  const plan = grade2PagesPromotionPlan(revision, previous)
  renderPlan([
    `verify immutable Grade 2 artifact for ${plan.sourceRevision}`,
    `require origin/gh-pages to equal ${plan.expectedCurrentDeployment}`,
    'create a deployment commit from only the verified artifact tree',
    `push one fast-forward commit to ${plan.destinationRef}`,
    `verify ${plan.stableOrigin} displays revision ${plan.sourceRevision}`,
  ])
  if (!execute) return
  assertCleanWorktree()
  assertExpectedRemote()
  const current = fetchPagesBranch()
  if (current !== plan.expectedCurrentDeployment) {
    throw new Error(`Grade 2 deployment changed: expected ${plan.expectedCurrentDeployment}, found ${current}.`)
  }
  const tree = createArtifactTree(artifactDirectory)
  const commit = createDeploymentCommit(tree, current, `Deploy Grade 2 family beta ${revision}`)
  pushDeployment(commit)
  await waitForLive((body) => body.includes(Buffer.from(`revision=${revision}`)), `revision ${revision}`)
  console.log(`Promoted Grade 2 revision ${revision} as deployment ${commit}.`)
}

async function rollback() {
  requireGrade2PagesOrigin(flag('--confirm-origin'))
  const target = requireFullGitRevision(flag('--target-deployment'), 'Grade 2 rollback deployment')
  assertRepeatedFlag('--confirm-target-deployment', target)
  const currentFlag = requireFullGitRevision(flag('--current-deployment'), 'Current Grade 2 deployment')
  assertRepeatedFlag('--confirm-current-deployment', currentFlag)
  const plan = grade2PagesRollbackPlan(target, currentFlag)
  renderPlan([
    `require origin/gh-pages to equal ${plan.expectedCurrentDeployment}`,
    `require retained deployment ${plan.targetDeployment} in current deployment history`,
    `create a new fast-forward commit from tree ${plan.treeSource}`,
    `push one fast-forward commit to ${plan.destinationRef}`,
    `verify ${plan.stableOrigin} index bytes match the retained target`,
  ])
  if (!execute) return
  assertCleanWorktree()
  assertExpectedRemote()
  const current = fetchPagesBranch()
  if (current !== plan.expectedCurrentDeployment) {
    throw new Error(`Grade 2 deployment changed: expected ${plan.expectedCurrentDeployment}, found ${current}.`)
  }
  assertCommitExists(target)
  assertAncestor(target, current)
  const tree = capture('git', ['rev-parse', `${target}^{tree}`])
  const expectedIndex = execFileSync('git', ['show', `${target}:index.html`], { cwd: root })
  const commit = createDeploymentCommit(tree, current, `Roll back Grade 2 family beta to ${target}`)
  pushDeployment(commit)
  await waitForLive((body) => sha256(body) === sha256(expectedIndex), `the index from deployment ${target}`)
  console.log(`Rolled back Grade 2 to retained deployment tree ${target} as deployment ${commit}.`)
}

if (!['promote', 'rollback'].includes(operation)) {
  throw new Error('Use promote or rollback as the Grade 2 Pages delivery operation.')
}

if (operation === 'promote') await promote()
if (operation === 'rollback') await rollback()
