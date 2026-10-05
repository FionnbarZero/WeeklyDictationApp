export const IMPORTER_PRODUCTION_PROJECT_ID = 'weeklydictationapp'
export const IMPORTER_SERVICE = 'weekly-dictation-importer'
export const IMPORTER_RUNTIME_ACCOUNT = 'weekly-dictation-importer'
export const IMPORTER_SCHEDULER_ACCOUNT = 'weekly-dictation-scheduler'
export const IMPORTER_SCHEDULER_JOB = 'weekly-dictation-monday-import'
export const IMPORTER_CUSTOM_ROLE = 'weeklyDictationImporter'
export const IMPORTER_DECK_ID = '10gpdTFqwBhWf9pD9HzF8AkD9Zyg7nBUSeTCGXuS8ky4'

export const importerSecrets = {
  GOOGLE_OAUTH_CLIENT_ID: 'weekly-dictation-google-oauth-client-id',
  GOOGLE_OAUTH_CLIENT_SECRET: 'weekly-dictation-google-oauth-client-secret',
  GOOGLE_OAUTH_REFRESH_TOKEN: 'weekly-dictation-google-oauth-refresh-token',
} as const

export const importerFirestorePermissions = [
  'datastore.databases.get',
  'datastore.entities.create',
  'datastore.entities.get',
  'datastore.entities.list',
  'datastore.entities.update',
] as const

export type ImporterDeploymentConfig = {
  projectId: string
  region: string
}

export function requireImporterDeploymentConfig(projectId: string | undefined, region: string | undefined) {
  if (projectId !== IMPORTER_PRODUCTION_PROJECT_ID) {
    throw new Error(`Importer deployment is locked to Google Cloud project ${IMPORTER_PRODUCTION_PROJECT_ID}.`)
  }
  if (!region || !/^[a-z]+(?:-[a-z0-9]+)+[0-9]$/.test(region)) {
    throw new Error('Importer region must be an explicit Google Cloud region such as us-west1.')
  }
  return { projectId, region } satisfies ImporterDeploymentConfig
}

export function importerIdentities(config: ImporterDeploymentConfig) {
  return {
    runtimeEmail: `${IMPORTER_RUNTIME_ACCOUNT}@${config.projectId}.iam.gserviceaccount.com`,
    schedulerEmail: `${IMPORTER_SCHEDULER_ACCOUNT}@${config.projectId}.iam.gserviceaccount.com`,
    customRole: `projects/${config.projectId}/roles/${IMPORTER_CUSTOM_ROLE}`,
  }
}

export function importerDeployCommand(config: ImporterDeploymentConfig) {
  const identities = importerIdentities(config)
  const secretBindings = Object.entries(importerSecrets)
    .map(([environmentName, secretName]) => `${environmentName}=${secretName}:latest`)
    .join(',')
  const environment = [
    `FIREBASE_PROJECT_ID=${config.projectId}`,
    `GOOGLE_SLIDES_PRESENTATION_ID=${IMPORTER_DECK_ID}`,
    'IMPORT_AUTH_MODE=cloud-run-iam',
    'IMPORT_WRITE_ENABLED=true',
  ].join(',')
  return [
    'gcloud',
    'run',
    'deploy',
    IMPORTER_SERVICE,
    '--source',
    '.',
    '--project',
    config.projectId,
    '--region',
    config.region,
    '--service-account',
    identities.runtimeEmail,
    '--no-allow-unauthenticated',
    '--ingress',
    'internal-and-cloud-load-balancing',
    '--concurrency',
    '1',
    '--min-instances',
    '0',
    '--max-instances',
    '1',
    '--cpu',
    '1',
    '--memory',
    '512Mi',
    '--timeout',
    '300s',
    '--set-env-vars',
    environment,
    '--set-secrets',
    secretBindings,
  ] as const
}

export function importerSchedulerCommand(
  operation: 'create' | 'update',
  config: ImporterDeploymentConfig,
  serviceUrl: string,
) {
  const identities = importerIdentities(config)
  if (new URL(serviceUrl).protocol !== 'https:') throw new Error('Cloud Run service URL must use HTTPS.')
  return [
    'gcloud',
    'scheduler',
    'jobs',
    operation,
    'http',
    IMPORTER_SCHEDULER_JOB,
    '--project',
    config.projectId,
    '--location',
    config.region,
    '--schedule',
    '0 15 * * 1',
    '--time-zone',
    'America/Los_Angeles',
    '--uri',
    `${serviceUrl}/run`,
    '--http-method',
    'POST',
    '--oidc-service-account-email',
    identities.schedulerEmail,
    '--oidc-token-audience',
    serviceUrl,
    '--headers',
    'Content-Type=application/json',
    '--message-body',
    '{}',
    '--attempt-deadline',
    '300s',
    '--max-retry-attempts',
    '1',
    '--min-backoff',
    '300s',
    '--max-backoff',
    '300s',
    '--max-retry-duration',
    '600s',
  ] as const
}
