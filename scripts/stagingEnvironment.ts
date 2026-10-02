export type StagingEnvironment = Record<string, string | undefined>

export type ValidatedStagingEnvironment = {
  apiKey: string
  appCheckSiteKey: string
  appId: string
  authDomain: string
  projectId: string
}

const placeholder = /^(?:change-me|example|placeholder|your[-_])/i
const stagingProject = /(?:^|-)staging(?:-|$)|(?:^|-)stg(?:-|$)/i

function required(environment: StagingEnvironment, name: string) {
  const value = environment[name]?.trim() || ''
  if (!value || placeholder.test(value)) throw new Error(`Staging configuration requires ${name}.`)
  return value
}

export function validateStagingEnvironment(environment: StagingEnvironment): ValidatedStagingEnvironment {
  if (required(environment, 'VITE_DEPLOYMENT_ENV') !== 'staging') {
    throw new Error('A staging build requires VITE_DEPLOYMENT_ENV=staging.')
  }
  if (required(environment, 'VITE_STAGING_SYNTHETIC_ONLY') !== 'true') {
    throw new Error('B1 staging must remain synthetic-only.')
  }
  if (required(environment, 'VITE_STAGING_OBSERVABILITY') !== 'true') {
    throw new Error('B1 staging requires observability to remain enabled.')
  }

  const projectId = required(environment, 'VITE_FIREBASE_PROJECT_ID')
  if (!stagingProject.test(projectId)) {
    throw new Error(`Refusing non-staging Firebase project ${projectId}.`)
  }

  const authDomain = required(environment, 'VITE_FIREBASE_AUTH_DOMAIN')
  if (authDomain !== `${projectId}.firebaseapp.com`) {
    throw new Error('The staging Firebase auth domain must match its project ID.')
  }

  return {
    apiKey: required(environment, 'VITE_FIREBASE_API_KEY'),
    appCheckSiteKey: required(environment, 'VITE_FIREBASE_APPCHECK_SITE_KEY'),
    appId: required(environment, 'VITE_FIREBASE_APP_ID'),
    authDomain,
    projectId,
  }
}

export function requireConfirmedStagingProject(
  environment: StagingEnvironment,
  confirmedProjectId: string | undefined,
) {
  const validated = validateStagingEnvironment(environment)
  if (!confirmedProjectId || confirmedProjectId !== validated.projectId) {
    throw new Error(`Confirm the exact staging project with --confirm-project ${validated.projectId}.`)
  }
  return validated
}
