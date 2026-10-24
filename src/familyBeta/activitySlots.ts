import type { LearningModulePack } from '../ninjaSkills/contracts.ts'
import type { CurriculumSnapshot } from './curriculum.ts'
import type { BetaProfile } from './model.ts'
import type { GameCheckpoint } from '../ninjaSkills/progress.ts'

/** In-session ownership. Reviewed durable checkpoints remain owned by the grade engines. */
export type FamilyActivitySlot = {
  id: string
  workspace: string
  profile: BetaProfile
  week: string
  curriculumVersion: string
  source?: CurriculumSnapshot
  resumeChannel?: 'writing' | 'reading'
  resumeExperience?: 'whispering-scrolls' | 'stroke-order-slay'
  savedLesson?: { progressionId: string; fingerprint: string }
  teachingVersion: string
  kind: 'activities' | 'game'
  src: string
  game?: { attemptId: string; pack: LearningModulePack; recoveryCheckpoint?: GameCheckpoint | null }
}

export function activityWorkspace(profile: BetaProfile, week: string) {
  return JSON.stringify([profile.id, profile.grade, week])
}
