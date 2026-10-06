import type { Dataset } from '../domain/contracts.ts'
import { resolveDatasetLifecycles } from '../domain.ts'
import type { LearningHubSection } from '../learningHub/contracts.ts'
import type { WeeklyDatasetCandidate } from '../curriculum/model.ts'
import { learningModuleCohortFromDatasets } from '../ninjaSkills/content.ts'

export type PracticeChannel = 'writing' | 'reading'
export function channelWords(dataset: Dataset, channel: PracticeChannel) {
  return channel === 'writing' ? dataset.vocabulary?.tier1 || dataset.words : dataset.vocabulary?.tier2 || []
}
export function latestEarlierTargets(datasets: readonly Dataset[], date: string, channel: PracticeChannel) {
  return [...datasets]
    .filter((dataset) => dataset.startDate < date && channelWords(dataset, channel).length)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .slice(0, 1)
}
export function channelCohort(datasets: Dataset[], channel: PracticeChannel, label: string) {
  const cohort = learningModuleCohortFromDatasets(`${channel}:${datasets.map((d) => d.id).join(':')}`, label, datasets)
  return cohort
    ? { ...cohort, terms: cohort.terms.filter((term) => term.tier === (channel === 'writing' ? 'tier-1' : 'tier-2')) }
    : null
}
export function sectionDatasets<Launch>(
  section: LearningHubSection<Launch>,
  datasets: Dataset[],
  candidates: WeeklyDatasetCandidate[],
  date: string,
) {
  const arrived = datasets.filter((d) => d.startDate <= date)
  const direct = arrived.filter((d) => section.cohorts.some((c) => c.id === d.id))
  if (direct.length) return direct
  if (arrived[0]?.grade === 'Kindergarten' && section.id === 'spirit-realm') {
    const completedUnits = new Set(
      candidates
        .filter(
          (c) =>
            c.status === 'no-instruction' &&
            c.noInstructionReason === 'unit-review' &&
            c.normalizedEndDate &&
            c.normalizedEndDate < date,
        )
        .map((c) => c.curriculumUnit?.id),
    )
    return arrived.filter((d) =>
      candidates.some((c) => c.datasetId === d.id && c.curriculumUnit && completedUnits.has(c.curriculumUnit.id)),
    )
  }
  if (arrived[0]?.grade === 'Grade 2') {
    const lifecycle = resolveDatasetLifecycles(datasets, new Date(`${date}T12:00:00-07:00`))
    if (section.id === 'spirit-realm') return lifecycle.mastered
    if (section.id === 'final-boss') return lifecycle.testReview ? [lifecycle.testReview] : []
    return lifecycle.acquisition ? [lifecycle.acquisition] : []
  }
  const unitIds = new Set(
    candidates
      .filter(
        (c) =>
          c.curriculumUnit &&
          section.cohorts.some((cohort) => cohort.id.startsWith(`__kindergarten-${c.curriculumUnit!.id}-`)),
      )
      .map((c) => c.curriculumUnit!.id),
  )
  return arrived.filter((d) =>
    candidates.some((c) => c.datasetId === d.id && c.curriculumUnit && unitIds.has(c.curriculumUnit.id)),
  )
}
