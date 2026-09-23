export const APP_VERSION = '0.2.0-stage2'
export const DEFAULT_TIME_ZONE = 'America/Los_Angeles'
export const SUPPORTED_GRADES = ['Kindergarten', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5'] as const
export type SupportedGrade = typeof SUPPORTED_GRADES[number]

export const DEFAULT_GRADE = 'Grade 2' as SupportedGrade
export const DEFAULT_SCHOOL_YEAR = '2026–2027'
export const GRADE2_DECK_ID = '10gpdTFqwBhWf9pD9HzF8AkD9Zyg7nBUSeTCGXuS8ky4'
export const GRADE5_DECK_ID = '1-CBvr9gGWsj0yQj1ArmHz3AvtgB0brKFipe90NY_9RI'
export const ACTIVE_DECK_ID = GRADE2_DECK_ID

export type DeckRegistryEntry = {
  grade: SupportedGrade
  displayName: string
  schoolYear: string
  sourceDeckId: string
  parserProfileId: string
  active: boolean
}

export const DECK_REGISTRY: DeckRegistryEntry[] = [
  { grade: 'Grade 2', displayName: 'Grade 2', schoolYear: DEFAULT_SCHOOL_YEAR, sourceDeckId: GRADE2_DECK_ID, parserProfileId: 'grade-2-2026-27-weekly-focus', active: true },
  { grade: 'Grade 5', displayName: 'Grade 5', schoolYear: DEFAULT_SCHOOL_YEAR, sourceDeckId: GRADE5_DECK_ID, parserProfileId: 'grade-5-2026-27-weekly-focus', active: false },
]

export function schoolYearToken(schoolYear: string) {
  const years = [...schoolYear.matchAll(/20\d{2}/g)].map((match) => Number(match[0]))
  if (years.length >= 2) return `${years[0]}-${String(years[1]).slice(-2)}`
  if (years.length === 1) return `${years[0]}-${String(years[0] + 1).slice(-2)}`
  throw new Error(`School year cannot be normalized: ${schoolYear}`)
}

const runtimeEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {}
export const firebaseConfig = {
  apiKey: runtimeEnv.VITE_FIREBASE_API_KEY || '',
  projectId: runtimeEnv.VITE_FIREBASE_PROJECT_ID || '',
  authDomain: runtimeEnv.VITE_FIREBASE_AUTH_DOMAIN || '',
}

export const firebaseConfigReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

export const firebaseSetupMessage = 'Firebase is not configured. Add VITE_FIREBASE_API_KEY and VITE_FIREBASE_PROJECT_ID to .env.local for authenticated cloud practice.'
