import assert from 'node:assert/strict'
import test from 'node:test'
import {
  importerDeployCommand,
  importerFirestorePermissions,
  importerSchedulerCommand,
  importerSecrets,
  requireImporterDeploymentConfig,
} from '../scripts/importerDeployment.ts'

const config = { projectId: 'weeklydictationapp', region: 'us-west1' }

test('importer deployment is locked to an explicit production project and region', () => {
  assert.deepEqual(requireImporterDeploymentConfig(config.projectId, config.region), config)
  assert.throws(() => requireImporterDeploymentConfig('weekly-dictation-staging', config.region), /locked/)
  assert.throws(() => requireImporterDeploymentConfig(config.projectId, undefined), /explicit Google Cloud region/)
})

test('Cloud Run uses IAM, bounded concurrency, and managed OAuth secrets', () => {
  const command = importerDeployCommand(config).join(' ')
  assert.match(command, /--no-allow-unauthenticated/)
  assert.match(command, /--ingress internal-and-cloud-load-balancing/)
  assert.match(command, /--concurrency 1/)
  assert.match(command, /--max-instances 1/)
  assert.match(command, /IMPORT_AUTH_MODE=cloud-run-iam/)
  assert.match(command, /IMPORT_WRITE_ENABLED=true/)
  for (const secret of Object.values(importerSecrets)) assert.match(command, new RegExp(`${secret}:latest`))
  assert.doesNotMatch(command, /IMPORT_RUN_TOKEN/)
})

test('Scheduler uses its service identity and the Monday Pacific schedule', () => {
  const command = importerSchedulerCommand('create', config, 'https://importer.example.run.app').join(' ')
  assert.match(command, /--schedule 0 15 \* \* 1/)
  assert.match(command, /--time-zone America\/Los_Angeles/)
  assert.match(command, /--uri https:\/\/importer\.example\.run\.app\/run/)
  assert.match(command, /--oidc-service-account-email weekly-dictation-scheduler@weeklydictationapp/)
  assert.match(command, /--oidc-token-audience https:\/\/importer\.example\.run\.app/)
  assert.match(command, /--max-retry-attempts 1/)
})

test('the custom Firestore role cannot delete data', () => {
  assert.deepEqual(importerFirestorePermissions, [
    'datastore.databases.get',
    'datastore.entities.create',
    'datastore.entities.get',
    'datastore.entities.list',
    'datastore.entities.update',
  ])
  assert.equal(
    importerFirestorePermissions.some((permission) => permission.includes('delete')),
    false,
  )
})
