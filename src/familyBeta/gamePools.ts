import type { Dataset } from '../domain/contracts.ts'
import { resolveDatasetLifecycles } from '../domain.ts'
import type { LearningHubSection } from '../learningHub/contracts.ts'
import type { WeeklyDatasetCandidate } from '../curriculum/model.ts'
import { learningModuleCapability, learningModuleCohortFromDatasets } from '../ninjaSkills/content.ts'
import { GAME_POLICIES } from '../ninjaSkills/policy.ts'
import { LEARNING_MODULE_CATALOG } from '../ninjaSkills/catalog.ts'
import { NINJA_SKILLS_PROFILES } from '../ninjaSkills/profiles.ts'
import type { BetaGrade, BetaResult } from './model.ts'

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
/** Resolve each tier's earlier relevant week independently; never borrow targets
 * from the current week or the other channel of an older week's dataset. */
export function reinforcementGames(
  datasets: readonly Dataset[], anchor: string, grade: BetaGrade,
  completed: readonly BetaResult[] = [], childId = '',
) {
  const sources = datasets.filter(dataset => dataset.grade === grade)
  const writing = latestEarlierTargets(sources, anchor, 'writing')
  const reading = latestEarlierTargets(sources, anchor, 'reading')
  return LEARNING_MODULE_CATALOG.map(entry => {
    const tiers: readonly string[] = GAME_POLICIES[entry.id].tiers
    const channels = (['writing', 'reading'] as const).filter(channel => tiers.includes(channel === 'writing' ? 'tier-1' : 'tier-2'))
    const cohorts = channels.map(channel => channelCohort(channel === 'writing' ? writing : reading, channel, 'Earlier targets'))
      .filter(cohort => cohort !== null)
    const selected = [...new Map(channels.flatMap(channel => channel === 'writing' ? writing : reading).map(dataset => [dataset.id, dataset])).values()]
    const base = learningModuleCohortFromDatasets(`game:${selected.map(dataset => dataset.id).join(':')}`, 'Earlier relevant writing/reading targets', selected)
    const cohort = base ? { ...base, terms: cohorts.flatMap(item => item.terms) } : null
    // Distinct immutable completions, not wrong answers or upload retries. This
    // cursor reflects the confirmed history available on this device.
    const visit = new Set(completed.filter(result => result.childId === childId && result.grade === grade && result.channel === 'game' &&
      result.activity === entry.title && result.datasetIds.length === selected.length && selected.every(dataset => result.datasetIds.includes(dataset.id)))
      .map(result => result.id)).size
    return { capability: learningModuleCapability(entry.id, cohort, NINJA_SKILLS_PROFILES[grade], visit),
      channel: channels.length === 1 ? channels[0] : 'mixed' as const, datasets: selected }
  })
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
