import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { loadEnv } from 'vite'
import { requireConfirmedStagingProject, validateStagingEnvironment } from './stagingEnvironment.ts'

const root = resolve(import.meta.dirname, '..')
const environment = loadEnv('staging', root, '')
const dryRun = process.argv.includes('--dry-run')
const confirmationIndex = process.argv.indexOf('--confirm-project')
const confirmedProjectId = confirmationIndex >= 0 ? process.argv[confirmationIndex + 1] : undefined
const validated = dryRun
  ? validateStagingEnvironment(environment)
  : requireConfirmedStagingProject(environment, confirmedProjectId)

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd: root, env: process.env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}.`)
}

function capture(command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}.`)
  return result.stdout.trim()
}

if (!dryRun && capture('git', ['status', '--porcelain'])) {
  throw new Error('A live staging deployment requires a clean Git worktree.')
}
const revision = process.env.GITHUB_SHA || capture('git', ['rev-parse', '--short=12', 'HEAD'])

run('npm', ['run', 'build:staging'])
run('npx', [
  'firebase',
  'deploy',
  '--project',
  validated.projectId,
  '--only',
  'hosting,firestore:rules',
  '--message',
  `staging-${revision}`,
  ...(dryRun ? ['--dry-run'] : []),
])
