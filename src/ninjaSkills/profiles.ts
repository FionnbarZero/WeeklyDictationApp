import type { SupportedGrade } from '../config.ts'
import type { LearningModuleId } from './contracts.ts'

export type NinjaSkillsProfile = {
  readonly grade: SupportedGrade
  readonly cohortPolicy: string
  readonly maximumItems: Readonly<Record<LearningModuleId, number>>
}

const STANDARD_LIMITS: Readonly<Record<LearningModuleId, number>> = {
  'dictation-streak': 6,
  'speed-match': 8,
  'target-blast': 6,
  'memory-flip': 8,
  'context-gap-dash': 10,
  'sentence-scramble': 6,
}

function profile(grade: SupportedGrade, cohortPolicy: string): NinjaSkillsProfile {
  return { grade, cohortPolicy, maximumItems: STANDARD_LIMITS }
}

export const NINJA_SKILLS_PROFILES: Readonly<Record<SupportedGrade, NinjaSkillsProfile>> = {
  Kindergarten: profile('Kindergarten', 'current-week'),
  'Grade 1': profile('Grade 1', 'inactive-until-authoritative-source'),
  'Grade 2': profile('Grade 2', 'current-acquisition-or-reviewed-mastery'),
  'Grade 3': profile('Grade 3', 'inactive-until-authoritative-source'),
  'Grade 4': profile('Grade 4', 'inactive-until-authoritative-source'),
  'Grade 5': profile('Grade 5', 'test-review-1'),
}
