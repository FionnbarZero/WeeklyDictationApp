import type { Tier2ReadingProfile } from './contracts.ts'
import { grade2Tier2ReadingProfile } from './profiles/grade2.ts'
import { grade5Tier2ReadingProfile } from './profiles/grade5.ts'
import { kindergartenTier2ReadingProfile } from './profiles/kindergarten.ts'

export const tier2ReadingProfiles: readonly Tier2ReadingProfile[] = [
  kindergartenTier2ReadingProfile,
  grade2Tier2ReadingProfile,
  grade5Tier2ReadingProfile,
]

export function tier2ReadingProfileForScope(grade: string | null | undefined, schoolYearKey: string | null | undefined) {
  if (!grade || !schoolYearKey) return null
  return tier2ReadingProfiles.find((profile) => profile.grade === grade && profile.schoolYearKey === schoolYearKey) || null
}
