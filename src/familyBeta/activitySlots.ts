import type { LearningModulePack } from '../ninjaSkills/contracts.ts'
import type { BetaProfile } from './model.ts'
import type { CurriculumSnapshot } from './curriculum.ts'

/** In-session ownership. Reviewed durable checkpoints remain owned by the grade engines. */
export type FamilyActivitySlot = {
  id: string
  workspace: string
  profile: BetaProfile
  week: string
  curriculumVersion: string
  source?: CurriculumSnapshot
  resumeChannel?: 'writing' | 'reading'
  teachingVersion: string
  kind: 'activities' | 'game'
  src: string
  game?: { attemptId: string; pack: LearningModulePack }
}

export function activityWorkspace(profile: BetaProfile, week: string) {
  return JSON.stringify([profile.id, profile.grade, week])
}
