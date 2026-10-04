import { schoolYearToken } from './curriculum/identity.ts'
import type { CurriculumSourceType } from './curriculum/model.ts'
import { grade2PracticeProfile } from './practice/profiles/grade2.ts'
import { kindergartenWritingPracticeProfile } from './practice/profiles/kindergarten.ts'
import { requirePracticeProfileForGrade } from './practice/profiles/registry.ts'

export { APP_VERSION } from './releaseMetadata.ts'
export const DEFAULT_TIME_ZONE = 'America/Los_Angeles'
export const SUPPORTED_GRADES = ['Kindergarten', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5'] as const
export type SupportedGrade = typeof SUPPORTED_GRADES[number]

export const DEFAULT_GRADE = 'Grade 2' as SupportedGrade
export const DEFAULT_SCHOOL_YEAR = '2026–2027'
export function primaryLifecycleWarmupTrialsFor(grade: string) {
  return requirePracticeProfileForGrade(grade).lifecycle.primaryWarmupTrials
}
export const GRADE2_DECK_ID = '10gpdTFqwBhWf9pD9HzF8AkD9Zyg7nBUSeTCGXuS8ky4'
export const GRADE5_DECK_ID = '1-CBvr9gGWsj0yQj1ArmHz3AvtgB0brKFipe90NY_9RI'
export const KINDERGARTEN_SHEETS_ID = '1lBWZeDhb_IIhBJ8SIzZts637JBS6HETh6uFblNNTOxA'
export const ACTIVE_DECK_ID = GRADE2_DECK_ID

export type CurriculumSourceRegistryEntry = {
  grade: SupportedGrade
  displayName: string
  schoolYear: string
  sourceType: CurriculumSourceType
  sourceDocumentId: string
  sourceAdapterId: string
  practiceProfileId: string
  parserProfileId?: string
  active: boolean
}

export type DeckRegistryEntry = CurriculumSourceRegistryEntry

export const SOURCE_REGISTRY: CurriculumSourceRegistryEntry[] = [
  { grade: 'Grade 2', displayName: 'Grade 2', schoolYear: DEFAULT_SCHOOL_YEAR, sourceType: 'google-slides', sourceDocumentId: GRADE2_DECK_ID, parserProfileId: 'grade-2-2026-27-weekly-focus', sourceAdapterId: 'grade-2-google-slides', practiceProfileId: grade2PracticeProfile.id, active: true },
  { grade: 'Grade 5', displayName: 'Grade 5', schoolYear: DEFAULT_SCHOOL_YEAR, sourceType: 'google-slides', sourceDocumentId: GRADE5_DECK_ID, parserProfileId: 'grade-5-2026-27-weekly-focus', sourceAdapterId: 'grade-5-google-slides-v1', practiceProfileId: 'grade-5-unimplemented', active: false },
  { grade: 'Kindergarten', displayName: 'Kindergarten', schoolYear: DEFAULT_SCHOOL_YEAR, sourceType: 'google-sheets', sourceDocumentId: KINDERGARTEN_SHEETS_ID, parserProfileId: 'kindergarten-2026-27-weekly-focus', sourceAdapterId: 'kindergarten-google-sheets-v1', practiceProfileId: kindergartenWritingPracticeProfile.id, active: false },
]
export const DECK_REGISTRY = SOURCE_REGISTRY

export function productionSourceIsActive(grade: string | null | undefined, schoolYear: string | null | undefined) {
  if (!grade || !schoolYear) return false
  let requestedYear: string
  try { requestedYear = schoolYearToken(schoolYear) } catch { return false }
  return SOURCE_REGISTRY.some((source) =>
    source.active
      && source.grade === grade
      && schoolYearToken(source.schoolYear) === requestedYear,
  )
}

export { schoolYearToken }

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
  if (runtimeEnv.VITE_STAGING_SYNTHETIC_ONLY !== 'true') return 'The staging application is restricted to synthetic data.'
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

export const firebaseSetupMessage = stagingFirebaseError
  || 'Firebase is not configured. Add VITE_FIREBASE_API_KEY and VITE_FIREBASE_PROJECT_ID to .env.local for authenticated cloud practice.'
