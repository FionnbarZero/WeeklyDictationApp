import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  requireConfirmedStagingProject,
  validateStagingEnvironment,
  type StagingEnvironment,
} from '../scripts/stagingEnvironment.ts'

const root = resolve(import.meta.dirname, '..')
const validEnvironment: StagingEnvironment = {
  VITE_DEPLOYMENT_ENV: 'staging',
  VITE_STAGING_SYNTHETIC_ONLY: 'true',
  VITE_STAGING_OBSERVABILITY: 'true',
  VITE_FIREBASE_API_KEY: 'staging-browser-api-key',
  VITE_FIREBASE_PROJECT_ID: 'weekly-dictation-staging',
  VITE_FIREBASE_AUTH_DOMAIN: 'weekly-dictation-staging.firebaseapp.com',
  VITE_FIREBASE_APP_ID: '1:123:web:staging',
  VITE_FIREBASE_APPCHECK_SITE_KEY: 'staging-app-check-site-key',
}

test('staging configuration requires a matching isolated project and operational gates', () => {
  assert.equal(validateStagingEnvironment(validEnvironment).projectId, 'weekly-dictation-staging')
  assert.throws(
    () => validateStagingEnvironment({ ...validEnvironment, VITE_FIREBASE_PROJECT_ID: 'weekly-dictation-production' }),
    /Refusing non-staging Firebase project/,
  )
  assert.throws(
    () => validateStagingEnvironment({ ...validEnvironment, VITE_STAGING_SYNTHETIC_ONLY: 'false' }),
    /synthetic-only/,
  )
  assert.throws(
    () => validateStagingEnvironment({ ...validEnvironment, VITE_STAGING_OBSERVABILITY: 'false' }),
    /observability/,
  )
  assert.throws(
    () => validateStagingEnvironment({ ...validEnvironment, VITE_FIREBASE_APPCHECK_SITE_KEY: '' }),
    /VITE_FIREBASE_APPCHECK_SITE_KEY/,
  )
  assert.throws(
    () =>
      validateStagingEnvironment({
        ...validEnvironment,
        VITE_FIREBASE_AUTH_DOMAIN: 'different-project.firebaseapp.com',
      }),
    /auth domain must match/,
  )
})

test('a live staging deploy requires the exact project ID as an explicit confirmation', () => {
  assert.equal(
    requireConfirmedStagingProject(validEnvironment, 'weekly-dictation-staging').projectId,
    'weekly-dictation-staging',
  )
  assert.throws(() => requireConfirmedStagingProject(validEnvironment, undefined), /--confirm-project/)
  assert.throws(
    () => requireConfirmedStagingProject(validEnvironment, 'weekly-dictation-production'),
    /--confirm-project weekly-dictation-staging/,
  )

  const deployScript = readFileSync(resolve(root, 'scripts/deploy-staging.ts'), 'utf8')
  assert.match(deployScript, /git', \['status', '--porcelain'\]/)
  assert.match(deployScript, /hosting,firestore:rules,auth/)
  assert.doesNotMatch(deployScript, /--force/)
})

test('Firebase Hosting serves only the production dist and deploys restrictive baseline headers', () => {
  const aliases = JSON.parse(readFileSync(resolve(root, '.firebaserc'), 'utf8'))
  const config = JSON.parse(readFileSync(resolve(root, 'firebase.json'), 'utf8'))
  assert.deepEqual(aliases.projects, { staging: 'weekly-dictation-staging' })
  assert.deepEqual(config.auth, { providers: { emailPassword: true } })
  assert.equal(config.hosting.public, 'dist')
  assert.deepEqual(config.hosting.rewrites, [{ source: '**', destination: '/index.html' }])
  assert.ok(config.hosting.headers.some((entry: { source: string }) => entry.source === '/assets/**'))
  assert.ok(
    config.hosting.headers.some((entry: { headers: Array<{ key: string }> }) =>
      entry.headers.some((header) => header.key === 'Permissions-Policy'),
    ),
  )
})

test('staging requests carry App Check and staging telemetry stays outside the initial Firebase SDK graph', () => {
  const authClient = readFileSync(resolve(root, 'src/firebaseClient.ts'), 'utf8')
  const firestoreClient = readFileSync(resolve(root, 'src/firestoreClient.ts'), 'utf8')
  const sdkRuntime = readFileSync(resolve(root, 'src/firebaseSdkRuntime.ts'), 'utf8')
  const observability = readFileSync(resolve(root, 'src/stagingObservability.ts'), 'utf8')

  assert.match(authClient, /firebaseAppCheckHeaders/)
  assert.match(firestoreClient, /firebaseAppCheckHeaders/)
  assert.match(firestoreClient, /documents:batchGet/)
  assert.match(sdkRuntime, /ReCaptchaEnterpriseProvider/)
  assert.match(sdkRuntime, /import\('firebase\/app-check'\)/)
  assert.match(observability, /import\('firebase\/performance'\)/)
})
