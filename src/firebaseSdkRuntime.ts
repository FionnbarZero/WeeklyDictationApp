import type { FirebaseApp } from 'firebase/app'
import type { AppCheck } from 'firebase/app-check'
import { deploymentEnvironment, firebaseAppCheckSiteKey, firebaseConfig, firebaseConfigReady } from './config.ts'

let firebaseAppPromise: Promise<FirebaseApp> | null = null
let appCheckPromise: Promise<AppCheck | null> | null = null

export async function firebaseSdkApp() {
  if (!firebaseConfigReady) throw new Error('Firebase configuration is missing or unsafe.')
  if (!firebaseAppPromise) {
    firebaseAppPromise = import('firebase/app').then(({ getApp, getApps, initializeApp }) =>
      getApps().length ? getApp() : initializeApp(firebaseConfig),
    )
  }
  return firebaseAppPromise
}

async function firebaseAppCheck() {
  if (!firebaseAppCheckSiteKey) {
    if (deploymentEnvironment === 'staging') throw new Error('Firebase App Check is required in staging.')
    return null
  }
  if (!appCheckPromise) {
    appCheckPromise = Promise.all([firebaseSdkApp(), import('firebase/app-check')]).then(([app, appCheck]) =>
      appCheck.initializeAppCheck(app, {
        provider: new appCheck.ReCaptchaEnterpriseProvider(firebaseAppCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      }),
    )
  }
  return appCheckPromise
}

export async function firebaseAppCheckHeaders(): Promise<Record<string, string>> {
  const appCheck = await firebaseAppCheck()
  if (!appCheck) return {}
  const { getToken } = await import('firebase/app-check')
  const token = await getToken(appCheck)
  return { 'X-Firebase-AppCheck': token.token }
}
