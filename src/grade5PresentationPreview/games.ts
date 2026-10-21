import type { Dataset } from '../domain/contracts.ts'
import type { BetaResult } from '../familyBeta/model.ts'
import { LEARNING_MODULE_CATALOG } from '../ninjaSkills/catalog.ts'
import { learningModuleCapability, learningModuleCohortFromDatasets } from '../ninjaSkills/content.ts'
import { NINJA_SKILLS_PROFILES } from '../ninjaSkills/profiles.ts'
import { grade5AssessmentGameProfile } from './gameProfile.ts'

/** Use the approved current assessment, with every reference sentence included. */
export function grade5AssessmentGames(datasets: Dataset[], completed: readonly BetaResult[], childId: string) {
  const cohort = learningModuleCohortFromDatasets(
    `assessment:${datasets.map((dataset) => dataset.id).join(':')}`,
    'October 23 · eight shared words',
    datasets,
  )
  const profile = NINJA_SKILLS_PROFILES['Grade 5']
  return LEARNING_MODULE_CATALOG.map((entry) => {
    const visit = new Set(
      completed
        .filter(
          (result) =>
            result.childId === childId &&
            result.grade === 'Grade 5' &&
            result.channel === 'game' &&
            result.activity === entry.title &&
            result.datasetIds.length === datasets.length &&
            datasets.every((dataset) => result.datasetIds.includes(dataset.id)),
        )
        .map((result) => result.id),
    ).size
    return {
      capability: learningModuleCapability(
        entry.id,
        cohort,
        cohort ? grade5AssessmentGameProfile(profile, cohort) : profile,
        visit,
      ),
      channel: 'mixed' as const,
      datasets,
    }
  })
}
