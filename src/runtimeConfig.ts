const runtimeEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {}

export const deploymentEnvironment = runtimeEnv.VITE_DEPLOYMENT_ENV || 'local'
export const firebaseConfig = {
  apiKey: runtimeEnv.VITE_FIREBASE_API_KEY || '',
  projectId: runtimeEnv.VITE_FIREBASE_PROJECT_ID || '',
  authDomain: runtimeEnv.VITE_FIREBASE_AUTH_DOMAIN || '',
  appId: runtimeEnv.VITE_FIREBASE_APP_ID || '',
}
export const firebaseAppCheckSiteKey = runtimeEnv.VITE_FIREBASE_APPCHECK_SITE_KEY || ''
export const stagingObservabilityEnabled =
  deploymentEnvironment === 'staging' && runtimeEnv.VITE_STAGING_OBSERVABILITY === 'true'

const stagingFirebaseError = (() => {
  if (deploymentEnvironment !== 'staging') return null
  if (runtimeEnv.VITE_STAGING_SYNTHETIC_ONLY !== 'true')
    return 'The staging application is restricted to synthetic data.'
  if (!/(?:^|-)staging(?:-|$)|(?:^|-)stg(?:-|$)/i.test(firebaseConfig.projectId)) {
    return 'The staging application refused a Firebase project without a staging identity.'
  }
  if (firebaseConfig.authDomain !== `${firebaseConfig.projectId}.firebaseapp.com`) {
    return 'The staging Firebase auth domain does not match its project.'
  }
  if (!firebaseConfig.appId || !firebaseAppCheckSiteKey) return 'The staging application requires Firebase App Check.'
  if (!stagingObservabilityEnabled) return 'The staging application requires observability.'
  return null
})()

export const firebaseConfigReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && !stagingFirebaseError)

export const firebaseSetupMessage =
  stagingFirebaseError ||
  'Firebase is not configured. Add VITE_FIREBASE_API_KEY and VITE_FIREBASE_PROJECT_ID to .env.local for authenticated cloud practice.'
