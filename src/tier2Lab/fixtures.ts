import type { AcquisitionTargetSet } from '../acquisition/contracts.ts'
import type { Dataset, Word } from '../domain/contracts.ts'
import type { LifecycleContext, LifecycleProgressionEvent, LifecycleSet } from '../lifecycle/contracts.ts'
import type {
  Tier2ReadingLifecycle,
  Tier2ReadingPathway,
  Tier2ReadingProfile,
  Tier2ReadingTarget,
} from '../tier2/contracts.ts'
import { resolveTier2ReadingLifecycle } from '../tier2/lifecycle.ts'
import { tier2ReadingProfileForScope } from '../tier2/registry.ts'
import {
  TIER2_PROTOTYPE_CURRICULUM,
  type Tier2PrototypeCycle,
  type Tier2PrototypeGrade,
} from './prototypeCurriculum.ts'

export type Tier2SmokeGrade = Tier2PrototypeGrade

export type Tier2SmokeScenarioOption = {
  id: string
  label: string
}

export type Tier2SmokeSnapshot = {
  id: string
  label: string
  description: string
  currentDateKey: string
  profile: Tier2ReadingProfile
  datasets: readonly Dataset[]
  lifecycle: Tier2ReadingLifecycle
}

export const TIER2_SMOKE_GRADES: readonly Tier2SmokeGrade[] = ['Kindergarten', 'Grade 2', 'Grade 5']

function vocabularyWord(
  datasetId: string,
  id: string,
  text: string,
  tier: 'tier-1' | 'tier-2',
): Word {
  return {
    id,
    text,
    sentence: '',
    datasetId,
    language: 'mandarin',
    tier,
    activityType: tier === 'tier-1' ? 'dictation' : 'reading',
  }
}

function fixtureDataset(
  grade: Tier2SmokeGrade,
  cycle: Tier2PrototypeCycle,
): Dataset {
  const tier1 = cycle.tier1Terms.map((text, index) => vocabularyWord(
    cycle.id,
    `${cycle.id}-tier-1-${index + 1}`,
    text,
    'tier-1',
  ))
  const tier2 = cycle.tier2Terms.map((text, index) => vocabularyWord(
    cycle.id,
    `${cycle.id}-tier-2-${index + 1}`,
    text,
    'tier-2',
  ))
  return {
    id: cycle.id,
    dateRange: `${cycle.startDate}–${cycle.endDate}`,
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    grade,
    schoolYear: '2026–2027',
    description: `Development-only Tier 2 prototype override · ${cycle.sourceReference}`,
    words: tier1,
    vocabulary: { tier1, tier2, tier3: [] },
  }
}

function lifecycleSet(dataset: Dataset): LifecycleSet {
  return {
    datasetId: dataset.id,
    grade: dataset.grade,
    schoolYearKey: '2026-27',
    activationDate: dataset.startDate,
    instructionalEndDate: dataset.endDate,
    kind: 'vocabulary',
  }
}

function lifecycleContext(
  grade: Tier2SmokeGrade,
  currentDateKey: string,
  datasets: readonly Dataset[],
  progressionEvents: readonly LifecycleProgressionEvent[] = [],
): LifecycleContext {
  return {
    scope: { grade, schoolYearKey: '2026-27', currentDateKey },
    sets: datasets.map(lifecycleSet),
    progressionEvents,
  }
}

const kindergartenDatasets = TIER2_PROTOTYPE_CURRICULUM.Kindergarten
  .map((cycle) => fixtureDataset('Kindergarten', cycle))

const grade2Datasets = TIER2_PROTOTYPE_CURRICULUM['Grade 2']
  .map((cycle) => fixtureDataset('Grade 2', cycle))

const grade5Datasets = TIER2_PROTOTYPE_CURRICULUM['Grade 5']
  .map((cycle) => fixtureDataset('Grade 5', cycle))

const grade5ProgressionEvents: LifecycleProgressionEvent[] = grade5Datasets.map((dataset, index) => ({
  eventId: `grade5-smoke-event-${index + 1}`,
  grade: 'Grade 5',
  schoolYearKey: '2026-27',
  effectiveDate: dataset.startDate,
  introducedDatasetId: dataset.id,
  ...(index > 0 ? { confirmedDatasetId: grade5Datasets[index - 1].id } : {}),
}))

const scenarioOptions: Record<Tier2SmokeGrade, readonly Tier2SmokeScenarioOption[]> = {
  Kindergarten: [
    { id: 'active-unit', label: 'Active Unit 1 · Acquisition and cumulative review' },
    { id: 'completed-unit', label: 'After Unit 1 · Mastery eligibility' },
  ],
  'Grade 2': [{ id: 'current-week', label: 'Current week · Acquisition, Test Review, and Mastery' }],
  'Grade 5': [{ id: 'current-week', label: 'Current week · Acquisition, Test Review 1, Test Review 2, and Mastery' }],
}

export function tier2SmokeScenarioOptions(grade: Tier2SmokeGrade) {
  return scenarioOptions[grade]
}

function scenarioInputs(grade: Tier2SmokeGrade, scenarioId: string) {
  if (grade === 'Kindergarten') {
    if (scenarioId === 'completed-unit') return {
      label: 'Kindergarten after Unit 1',
      description: 'The approved unit has ended, so its Tier 2 reading occurrences are now in Mastery.',
      currentDateKey: '2026-09-28',
      datasets: kindergartenDatasets,
      progressionEvents: [] as LifecycleProgressionEvent[],
    }
    if (scenarioId !== 'active-unit') throw new Error(`Unknown Kindergarten smoke scenario ${scenarioId}.`)
    return {
      label: 'Kindergarten active Unit 1',
      description: 'The newest week is in Acquisition and all arrived weeks share the cumulative Unit Review.',
      currentDateKey: '2026-09-27',
      datasets: kindergartenDatasets,
      progressionEvents: [] as LifecycleProgressionEvent[],
    }
  }
  if (scenarioId !== 'current-week') throw new Error(`Unknown ${grade} smoke scenario ${scenarioId}.`)
  if (grade === 'Grade 2') return {
    label: 'Grade 2 current week',
    description: 'The replacement lifecycle supplies one Acquisition cohort, one Test Review cohort, and older Mastery cohorts.',
    currentDateKey: '2026-09-21',
    datasets: grade2Datasets,
    progressionEvents: [] as LifecycleProgressionEvent[],
  }
  return {
    label: 'Grade 5 current week',
    description: 'The progression lifecycle supplies Acquisition, Test Review 1, Test Review 2, and Mastery.',
    currentDateKey: '2026-09-21',
    datasets: grade5Datasets,
    progressionEvents: grade5ProgressionEvents,
  }
}

export function buildTier2SmokeSnapshot(grade: Tier2SmokeGrade, requestedScenarioId?: string): Tier2SmokeSnapshot {
  const option = tier2SmokeScenarioOptions(grade)
    .find((candidate) => candidate.id === requestedScenarioId)
    || tier2SmokeScenarioOptions(grade)[0]
  const inputs = scenarioInputs(grade, option.id)
  const profile = tier2ReadingProfileForScope(grade, '2026-27')
  if (!profile) throw new Error(`Tier 2 reading is not configured for ${grade}.`)
  const lifecycle = resolveTier2ReadingLifecycle(
    profile,
    lifecycleContext(grade, inputs.currentDateKey, inputs.datasets, inputs.progressionEvents),
    inputs.datasets,
  )
  return {
    id: option.id,
    label: inputs.label,
    description: inputs.description,
    currentDateKey: inputs.currentDateKey,
    profile,
    datasets: inputs.datasets,
    lifecycle,
  }
}

export function tier2SmokePathways(snapshot: Tier2SmokeSnapshot): Tier2ReadingPathway[] {
  return [
    ...(snapshot.lifecycle.acquisition ? [snapshot.lifecycle.acquisition] : []),
    ...snapshot.lifecycle.testReviews,
    snapshot.lifecycle.mastery,
  ]
}

export function tier2SmokePathwayId(pathway: Tier2ReadingPathway) {
  if (pathway.kind === 'acquisition') return 'acquisition'
  if (pathway.kind === 'mastery') return 'mastery'
  return `test-review-${pathway.cycle || 1}-${pathway.reviewGroupId || pathway.cohorts.map((cohort) => cohort.datasetId).join('-')}`
}

export function tier2SmokePathwayLabel(pathway: Tier2ReadingPathway) {
  if (pathway.kind === 'acquisition') return 'Acquisition'
  if (pathway.kind === 'mastery') return 'Mastery reading'
  if (pathway.reviewGroupId) return `Cumulative Unit Review · cycle ${pathway.cycle || 1}`
  return `Test Review ${pathway.cycle || 1}`
}

export function tier2SmokePathwayTargets(pathway: Tier2ReadingPathway): Tier2ReadingTarget[] {
  return pathway.cohorts.flatMap((cohort) => cohort.targets)
}

export function tier2SmokeAcquisitionTargetSet(pathway: Tier2ReadingPathway): AcquisitionTargetSet<Tier2ReadingTarget> {
  if (pathway.kind !== 'acquisition' || pathway.cohorts.length !== 1 || !pathway.available) {
    throw new Error('The Tier 2 Acquisition smoke test requires one available Acquisition cohort.')
  }
  const cohort = pathway.cohorts[0]
  return { id: cohort.datasetId, targets: cohort.targets }
}
