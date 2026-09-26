import { grade2PracticeProfile } from './grade2.ts'
import type { WritingPracticeProfile } from './model.ts'

export const writingPracticeProfiles: readonly WritingPracticeProfile[] = [grade2PracticeProfile]

export function practiceProfileForGrade(grade: string | null | undefined) {
  return writingPracticeProfiles.find((profile) => profile.grade === grade) || null
}

export function requirePracticeProfileForGrade(grade: string | null | undefined) {
  const profile = practiceProfileForGrade(grade)
  if (!profile) throw new Error(`Writing practice is not configured for ${grade || 'an unspecified grade'}.`)
  return profile
}
