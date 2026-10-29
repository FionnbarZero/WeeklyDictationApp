import type { LearningModuleCohort } from '../ninjaSkills/contracts.ts'
import type { NinjaSkillsProfile } from '../ninjaSkills/profiles.ts'
import { isGrade5AssessmentSource } from './sourceIdentity.ts'

export function grade5AssessmentGameProfile(profile: NinjaSkillsProfile, cohort: LearningModuleCohort) {
  return cohort.grade === 'Grade 5' &&
    cohort.provenance.length === 1 &&
    isGrade5AssessmentSource(cohort.provenance[0].source)
    ? { ...profile, maximumItems: { ...profile.maximumItems, 'sentence-scramble': 8 } }
    : profile
}
