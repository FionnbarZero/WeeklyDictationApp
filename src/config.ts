export const APP_VERSION = '0.2.0-stage2'
export const DEFAULT_TIME_ZONE = 'America/Los_Angeles'
export const SUPPORTED_GRADES = ['Kindergarten', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5'] as const
export type SupportedGrade = typeof SUPPORTED_GRADES[number]

export const DEFAULT_GRADE = 'Grade 5' as SupportedGrade
export const DEFAULT_SCHOOL_YEAR = '2026–27'
export const ACTIVE_DECK_ID = '1-CBvr9gGWsj0yQj1ArmHz3AvtgB0brKFipe90NY_9RI'

const runtimeEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {}
export const firebaseConfig = {
  apiKey: runtimeEnv.VITE_FIREBASE_API_KEY || '',
  projectId: runtimeEnv.VITE_FIREBASE_PROJECT_ID || '',
  authDomain: runtimeEnv.VITE_FIREBASE_AUTH_DOMAIN || '',
}

export const firebaseConfigReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

export const firebaseSetupMessage = 'Firebase is not configured. Add VITE_FIREBASE_API_KEY and VITE_FIREBASE_PROJECT_ID to .env.local for authenticated cloud practice.'
