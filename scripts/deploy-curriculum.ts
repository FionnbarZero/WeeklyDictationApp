// This deploys only the curriculum service, never a grade app or Firestore rules.
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const project = 'weeklydictationapp'
const region = 'us-central1'
const service = 'weekly-dictation-curriculum'
const account = `${service}@${project}.iam.gserviceaccount.com`
const bucket = `${project}-validated-curriculum`
const cliIndex = process.argv.indexOf('--gcloud')
const cli = cliIndex >= 0 ? process.argv[cliIndex + 1] : 'gcloud'
const execute = process.argv.includes('--execute')
if (execute && !process.argv.includes(`--confirm-project=${project}`))
  throw new Error('Confirm the exact cloud project.')
function capture(args: string[]) {
  return execFileSync(cli, [...args, '--project', project], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim()
}
function run(args: string[]) {
  console.log(`gcloud ${args.join(' ')} --project ${project}`)
  execFileSync(cli, [...args, '--project', project, '--quiet'], { cwd: root, stdio: 'inherit' })
}
console.log(
  JSON.stringify(
    {
      project,
      region,
      service,
      account,
      bucket,
      scope:
        'Read-only teacher source access; private curriculum storage; public curriculum-only GET endpoint. No child data, sign-in, Firestore or grade publishing changes.',
    },
    null,
    2,
  ),
)
if (!execute) process.exit(0)

const accounts = capture(['iam', 'service-accounts', 'list', '--format=value(email)']).split('\n')
if (!accounts.includes(account))
  run(['iam', 'service-accounts', 'create', service, '--display-name=Curriculum-only runtime'])
const buckets = capture(['storage', 'buckets', 'list', '--format=value(name)'])
  .split('\n')
  .map((s) => s.replace(/^gs:\/\//, '').replace(/\/$/, ''))
if (!buckets.includes(bucket))
  run([
    'storage',
    'buckets',
    'create',
    `gs://${bucket}`,
    `--location=${region}`,
    '--uniform-bucket-level-access',
    '--public-access-prevention',
  ])
run(['storage', 'buckets', 'update', `gs://${bucket}`, '--versioning'])
// Overwriting an object requires delete permission, but old versions remain recoverable.
const role = 'curriculumSnapshotWriter'
const roles = capture(['iam', 'roles', 'list', '--format=value(name)']).split('\n')
run([
  'iam',
  'roles',
  roles.includes(`projects/${project}/roles/${role}`) ? 'update' : 'create',
  role,
  '--title=Curriculum snapshot writer',
  '--permissions=storage.objects.get,storage.objects.create,storage.objects.delete',
  '--stage=GA',
])
run([
  'storage',
  'buckets',
  'add-iam-policy-binding',
  `gs://${bucket}`,
  `--member=serviceAccount:${account}`,
  `--role=projects/${project}/roles/${role}`,
])

const secretBindings: string[] = []
for (const [env, suffix] of [
  ['GOOGLE_OAUTH_CLIENT_ID', 'client-id'],
  ['GOOGLE_OAUTH_CLIENT_SECRET', 'client-secret'],
  ['GOOGLE_OAUTH_REFRESH_TOKEN', 'refresh-token'],
]) {
  const secret = `weekly-dictation-google-oauth-${suffix}`
  const version = capture(['secrets', 'versions', 'describe', 'latest', `--secret=${secret}`, '--format=value(name)'])
    .split('/')
    .pop()
  if (!version || !/^\d+$/.test(version)) throw new Error('Missing approved secret version.')
  run([
    'secrets',
    'add-iam-policy-binding',
    secret,
    `--member=serviceAccount:${account}`,
    '--role=roles/secretmanager.secretAccessor',
    '--condition=None',
  ])
  secretBindings.push(`${env}=${secret}:${version}`)
}

// Explicit allowlist avoids uploading local env files, recordings, tests, or personal documents.
const stage = mkdtempSync(join(tmpdir(), 'dictation-curriculum-build-'))
for (const name of ['src', 'backend', 'package.json', 'package-lock.json'])
  cpSync(resolve(root, name), join(stage, name), { recursive: true })
cpSync(resolve(root, 'backend/Dockerfile.curriculum'), join(stage, 'Dockerfile'))
writeFileSync(join(stage, '.gcloudignore'), '.git\nnode_modules\n.env*\n*.local\n')
writeFileSync(
  join(stage, 'lifecycle.json'),
  JSON.stringify({ rule: [{ action: { type: 'Delete' }, condition: { isLive: false, daysSinceNoncurrentTime: 30 } }] }),
)
run(['storage', 'buckets', 'update', `gs://${bucket}`, `--lifecycle-file=${join(stage, 'lifecycle.json')}`])
run([
  'run',
  'deploy',
  service,
  `--region=${region}`,
  `--source=${stage}`,
  `--service-account=${account}`,
  '--allow-unauthenticated',
  '--ingress=all',
  '--min-instances=0',
  '--max-instances=1',
  '--concurrency=8',
  '--timeout=300',
  '--memory=512Mi',
  '--cpu=1',
  `--set-env-vars=CURRICULUM_BUCKET=${bucket}`,
  `--set-secrets=${secretBindings.join(',')}`,
])
const url = capture(['run', 'services', 'describe', service, `--region=${region}`, '--format=value(status.url)'])
console.log(`Curriculum service: ${url}`)
console.log(`Build context retained for audit at ${stage}. No grade was published.`)
