import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import {
  IMPORTER_CUSTOM_ROLE,
  IMPORTER_PRODUCTION_PROJECT_ID,
  IMPORTER_RUNTIME_ACCOUNT,
  IMPORTER_SCHEDULER_ACCOUNT,
  IMPORTER_SCHEDULER_JOB,
  IMPORTER_SERVICE,
  importerDeployCommand,
  importerFirestorePermissions,
  importerIdentities,
  importerSchedulerCommand,
  importerSecrets,
  requireImporterDeploymentConfig,
} from './importerDeployment.ts'

const root = resolve(import.meta.dirname, '..')
const execute = process.argv.includes('--execute')

function flag(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const projectId = flag('--project') || IMPORTER_PRODUCTION_PROJECT_ID
const region = flag('--region') || process.env.IMPORTER_REGION
const config = requireImporterDeploymentConfig(projectId, region)
if (flag('--confirm-project') !== config.projectId) {
  throw new Error(`Repeat --confirm-project ${config.projectId} exactly.`)
}
if (flag('--confirm-region') !== config.region) {
  throw new Error(`Repeat --confirm-region ${config.region} exactly.`)
}

function capture(program: string, args: readonly string[], allowFailure = false) {
  const result = spawnSync(program, [...args], { cwd: root, encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0 && !allowFailure) {
    if (result.stderr) process.stderr.write(result.stderr)
    throw new Error(`${program} ${args.join(' ')} failed with exit code ${result.status}.`)
  }
  return result.status === 0 ? result.stdout.trim() : ''
}

function run(command: readonly string[]) {
  const [program, ...args] = command
  const result = spawnSync(program, args, { cwd: root, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command.join(' ')} failed with exit code ${result.status}.`)
}

function show(command: readonly string[]) {
  console.log(command.join(' '))
}

function gcloudExists(...args: string[]) {
  return Boolean(capture('gcloud', args, true))
}

function assertExecutionPreconditions() {
  if (capture('git', ['status', '--porcelain'])) {
    throw new Error('Executing the importer deployment requires a clean Git worktree.')
  }
  if (!capture('which', ['gcloud'], true)) {
    throw new Error(
      'Google Cloud CLI is required for an executed deployment. The dry-run remains available without it.',
    )
  }
  if (!capture('gcloud', ['auth', 'list', '--filter=status:ACTIVE', '--format=value(account)'])) {
    throw new Error('Google Cloud CLI has no active account.')
  }
  const describedProject = capture('gcloud', ['projects', 'describe', config.projectId, '--format=value(projectId)'])
  if (describedProject !== config.projectId) throw new Error('Google Cloud project confirmation failed.')
  const billing = capture('gcloud', [
    'billing',
    'projects',
    'describe',
    config.projectId,
    '--format=value(billingEnabled)',
  ])
  if (billing !== 'True')
    throw new Error('Cloud Run deployment requires billing to be enabled for the confirmed project.')
}

const identities = importerIdentities(config)
const apiCommand = [
  'gcloud',
  'services',
  'enable',
  'run.googleapis.com',
  'cloudbuild.googleapis.com',
  'artifactregistry.googleapis.com',
  'secretmanager.googleapis.com',
  'cloudscheduler.googleapis.com',
  'firestore.googleapis.com',
  '--project',
  config.projectId,
] as const

function accountCreateCommand(account: string, displayName: string) {
  return [
    'gcloud',
    'iam',
    'service-accounts',
    'create',
    account,
    '--project',
    config.projectId,
    '--display-name',
    displayName,
  ] as const
}

function customRoleCommand(operation: 'create' | 'update') {
  return [
    'gcloud',
    'iam',
    'roles',
    operation,
    IMPORTER_CUSTOM_ROLE,
    '--project',
    config.projectId,
    '--title',
    'Weekly Dictation importer',
    '--description',
    'Least-privilege Firestore entity access for the trusted weekly dataset importer.',
    '--permissions',
    importerFirestorePermissions.join(','),
    '--stage',
    'GA',
  ] as const
}

function projectBindingCommand(member: string, role: string) {
  return [
    'gcloud',
    'projects',
    'add-iam-policy-binding',
    config.projectId,
    '--member',
    `serviceAccount:${member}`,
    '--role',
    role,
    '--condition=None',
  ] as const
}

function secretBindingCommand(secret: string) {
  return [
    'gcloud',
    'secrets',
    'add-iam-policy-binding',
    secret,
    '--project',
    config.projectId,
    '--member',
    `serviceAccount:${identities.runtimeEmail}`,
    '--role',
    'roles/secretmanager.secretAccessor',
    '--condition=None',
  ] as const
}

function runInvokerCommand() {
  return [
    'gcloud',
    'run',
    'services',
    'add-iam-policy-binding',
    IMPORTER_SERVICE,
    '--project',
    config.projectId,
    '--region',
    config.region,
    '--member',
    `serviceAccount:${identities.schedulerEmail}`,
    '--role',
    'roles/run.invoker',
    '--condition=None',
  ] as const
}

console.log(execute ? 'Executing importer deployment:' : 'Importer deployment dry run:')
show(apiCommand)
show(accountCreateCommand(IMPORTER_RUNTIME_ACCOUNT, 'Weekly Dictation importer runtime'))
show(accountCreateCommand(IMPORTER_SCHEDULER_ACCOUNT, 'Weekly Dictation importer scheduler'))
show(customRoleCommand('create'))
console.log('(the custom role is updated instead when it already exists)')
show(projectBindingCommand(identities.runtimeEmail, identities.customRole))
for (const secret of Object.values(importerSecrets)) {
  console.log(`require secret version: projects/${config.projectId}/secrets/${secret}/versions/latest`)
  show(secretBindingCommand(secret))
}
show(importerDeployCommand(config))
show(runInvokerCommand())
show(importerSchedulerCommand('create', config, 'https://deployed-cloud-run-service-url.example'))

if (!execute) {
  console.log('No Google Cloud state changed. Populate the three Secret Manager secrets, then repeat with --execute.')
  process.exit(0)
}

assertExecutionPreconditions()
run(apiCommand)

if (
  !gcloudExists(
    'iam',
    'service-accounts',
    'describe',
    identities.runtimeEmail,
    '--project',
    config.projectId,
    '--format=value(email)',
  )
) {
  run(accountCreateCommand(IMPORTER_RUNTIME_ACCOUNT, 'Weekly Dictation importer runtime'))
}
if (
  !gcloudExists(
    'iam',
    'service-accounts',
    'describe',
    identities.schedulerEmail,
    '--project',
    config.projectId,
    '--format=value(email)',
  )
) {
  run(accountCreateCommand(IMPORTER_SCHEDULER_ACCOUNT, 'Weekly Dictation importer scheduler'))
}

const roleExists = gcloudExists(
  'iam',
  'roles',
  'describe',
  IMPORTER_CUSTOM_ROLE,
  '--project',
  config.projectId,
  '--format=value(name)',
)
run(customRoleCommand(roleExists ? 'update' : 'create'))
run(projectBindingCommand(identities.runtimeEmail, identities.customRole))

for (const secret of Object.values(importerSecrets)) {
  const version = capture('gcloud', [
    'secrets',
    'versions',
    'describe',
    'latest',
    '--secret',
    secret,
    '--project',
    config.projectId,
    '--format=value(state)',
  ])
  if (version !== 'ENABLED') throw new Error(`Secret ${secret} must have an enabled latest version.`)
  run(secretBindingCommand(secret))
}

run(importerDeployCommand(config))
run(runInvokerCommand())
const serviceUrl = capture('gcloud', [
  'run',
  'services',
  'describe',
  IMPORTER_SERVICE,
  '--project',
  config.projectId,
  '--region',
  config.region,
  '--format=value(status.url)',
])
if (!serviceUrl.startsWith('https://')) throw new Error('Cloud Run did not return a valid service URL.')
const schedulerExists = gcloudExists(
  'scheduler',
  'jobs',
  'describe',
  IMPORTER_SCHEDULER_JOB,
  '--project',
  config.projectId,
  '--location',
  config.region,
  '--format=value(name)',
)
run(importerSchedulerCommand(schedulerExists ? 'update' : 'create', config, serviceUrl))

const unauthenticated = await fetch(`${serviceUrl}/healthz`, { redirect: 'manual' })
if (![401, 403, 404].includes(unauthenticated.status)) {
  throw new Error(
    `Unauthenticated Cloud Run health check returned ${unauthenticated.status}; expected an IAM or internal-ingress denial.`,
  )
}
console.log(`Importer deployed at ${serviceUrl}; unauthenticated access is denied and Scheduler is configured.`)
