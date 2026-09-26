import { schoolYearToken } from './curriculum/identity.ts'
import type { CurriculumSourceType } from './curriculum/model.ts'
import { grade2PracticeProfile } from './practice/profiles/grade2.ts'
import { requirePracticeProfileForGrade } from './practice/profiles/registry.ts'

export const APP_VERSION = '0.2.0-stage2'
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
  { grade: 'Grade 5', displayName: 'Grade 5', schoolYear: DEFAULT_SCHOOL_YEAR, sourceType: 'google-slides', sourceDocumentId: GRADE5_DECK_ID, parserProfileId: 'grade-5-2026-27-weekly-focus', sourceAdapterId: 'grade-5-google-slides-placeholder', practiceProfileId: 'grade-5-unimplemented', active: false },
]
export const DECK_REGISTRY = SOURCE_REGISTRY

export { schoolYearToken }

const runtimeEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {}
export const firebaseConfig = {
  apiKey: runtimeEnv.VITE_FIREBASE_API_KEY || '',
  projectId: runtimeEnv.VITE_FIREBASE_PROJECT_ID || '',
  authDomain: runtimeEnv.VITE_FIREBASE_AUTH_DOMAIN || '',
}

export const firebaseConfigReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

export const firebaseSetupMessage = 'Firebase is not configured. Add VITE_FIREBASE_API_KEY and VITE_FIREBASE_PROJECT_ID to .env.local for authenticated cloud practice.'
