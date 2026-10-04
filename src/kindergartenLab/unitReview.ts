import type { WeeklyDatasetCandidate } from '../curriculum/model.ts'
import type { Dataset, Word } from '../domain/contracts.ts'
import { kindergartenAudioForText } from '../audio/kindergartenAudio.ts'
import { kindergartenCandidateIsUsableInLab } from './acquisitionLab.ts'
import { datasetFromCanonicalCandidate } from '../curriculum/datasetProjection.ts'
import { kindergartenDictationContextCatalog } from '../curriculum/kindergartenDictationContextCatalog.ts'
import type { DictationContextCatalog } from '../curriculum/contextCatalog.ts'

export type KindergartenCumulativePoolLab = {
  kind: 'active-unit' | 'unit-practice' | 'completed-unit'
  unitId: string | null
  label: string
  title: string | null
  sourceWeekCount: number
  tier1Words: string[]
  tier2Words: string[]
  dataset: Dataset
}

// Kept as an alias while the lab's reading pathway moves from the original
// explicit development fixture to source-derived cumulative pools.
export type KindergartenUnitReviewLab = KindergartenCumulativePoolLab

type PoolInput = {
  kind: KindergartenCumulativePoolLab['kind']
  candidates: WeeklyDatasetCandidate[]
  datasetId: string
  label: string
  title: string | null
  unitId: string | null
  endDate: string
  description: string
  contextCatalog: DictationContextCatalog
}

function cumulativePool(input: PoolInput): KindergartenCumulativePoolLab {
  const included = [...input.candidates].sort((left, right) =>
    left.normalizedStartDate!.localeCompare(right.normalizedStartDate!),
  )
  const tier1: Word[] = []
  const tier2: Word[] = []
  for (const candidate of included) {
    const projected = datasetFromCanonicalCandidate(candidate, input.contextCatalog)
    for (const occurrence of projected.vocabulary!.tier1) {
      tier1.push({
        id: `${input.datasetId}:tier-1:${tier1.length + 1}`,
        text: occurrence.text,
        sentence: occurrence.sentence,
        datasetId: input.datasetId,
        grade: 'Kindergarten',
        sourceSlideId: candidate.source.sourceUnitId,
        language: 'mandarin',
        tier: 'tier-1',
        activityType: 'dictation',
        audio: kindergartenAudioForText(occurrence.text),
      })
    }
    for (const occurrence of projected.vocabulary!.tier2) {
      tier2.push({
        id: `${input.datasetId}:tier-2:${tier2.length + 1}`,
        text: occurrence.text,
        sentence: occurrence.sentence,
        datasetId: input.datasetId,
        grade: 'Kindergarten',
        sourceSlideId: candidate.source.sourceUnitId,
        language: 'mandarin',
        tier: 'tier-2',
        activityType: 'reading',
        audio: kindergartenAudioForText(occurrence.text),
      })
    }
  }
  if (!included.length || tier1.length === 0) {
    throw new Error(`The Kindergarten ${input.label} pool contains no usable Tier 1 writing targets.`)
  }
  const startDate = included[0].normalizedStartDate!
  return {
    kind: input.kind,
    unitId: input.unitId,
    label: input.label,
    title: input.title,
    sourceWeekCount: included.length,
    tier1Words: tier1.map((word) => word.text),
    tier2Words: tier2.map((word) => word.text),
    dataset: {
      id: input.datasetId,
      dateRange: `${startDate}–${input.endDate}`,
      startDate,
      endDate: input.endDate,
      grade: 'Kindergarten',
      schoolYear: included[0].schoolYear,
      description: input.description,
      importStatus: 'valid',
      words: tier1,
      vocabulary: { tier1, tier2, tier3: [] },
    },
  }
}

function usableBeforeOrOn(candidates: WeeklyDatasetCandidate[], date: string) {
  return candidates.filter(kindergartenCandidateIsUsableInLab)
    .filter((candidate) => candidate.normalizedStartDate! <= date)
}

export function kindergartenUnitPoolForLab(
  candidates: WeeklyDatasetCandidate[],
  current: WeeklyDatasetCandidate,
  contextCatalog: DictationContextCatalog = kindergartenDictationContextCatalog,
): KindergartenCumulativePoolLab {
  if (!current.curriculumUnit || !current.normalizedStartDate || !current.normalizedEndDate) {
    throw new Error('The current Kindergarten spreadsheet tab does not identify its curriculum unit.')
  }
  const unit = current.curriculumUnit
  return cumulativePool({
    kind: 'active-unit',
    candidates: usableBeforeOrOn(candidates, current.normalizedStartDate)
      .filter((candidate) => candidate.curriculumUnit?.id === unit.id),
    datasetId: `__kindergarten-${unit.id}-review-lab__`,
    label: unit.label,
    title: unit.title,
    unitId: unit.id,
    endDate: current.normalizedEndDate,
    description: `Development-only cumulative ${unit.label} pool derived from the Kindergarten workbook`,
    contextCatalog,
  })
}

export function kindergartenNinjaUnitPoolsForLab(
  candidates: WeeklyDatasetCandidate[],
  current: WeeklyDatasetCandidate,
  contextCatalog: DictationContextCatalog = kindergartenDictationContextCatalog,
): KindergartenCumulativePoolLab[] {
  if (!current.normalizedStartDate) return []
  const arrived = usableBeforeOrOn(candidates, current.normalizedStartDate)
    .filter((candidate) => Boolean(candidate.curriculumUnit))
  const byUnit = new Map<string, WeeklyDatasetCandidate[]>()
  for (const candidate of arrived) {
    const unitId = candidate.curriculumUnit!.id
    byUnit.set(unitId, [...(byUnit.get(unitId) || []), candidate])
  }

  return [...byUnit.values()]
    .sort((left, right) => left[0].normalizedStartDate!.localeCompare(right[0].normalizedStartDate!))
    .map((unitCandidates) => {
      const latest = [...unitCandidates]
        .sort((left, right) => right.normalizedEndDate!.localeCompare(left.normalizedEndDate!))[0]
      const unit = latest.curriculumUnit!
      return cumulativePool({
        kind: 'unit-practice',
        candidates: unitCandidates,
        datasetId: `__kindergarten-${unit.id}-ninja-lab__`,
        label: unit.label,
        title: unit.title,
        unitId: unit.id,
        endDate: latest.normalizedEndDate!,
        description: `Development-only ${unit.label} Ninja Skills pool derived from the Kindergarten workbook`,
        contextCatalog,
      })
    })
}

function reviewTabs(candidates: WeeklyDatasetCandidate[]) {
  return candidates.filter((candidate) => candidate.status === 'no-instruction'
    && candidate.noInstructionReason === 'unit-review'
    && Boolean(candidate.curriculumUnit)
    && Boolean(candidate.normalizedStartDate)
    && Boolean(candidate.normalizedEndDate))
}

export function kindergartenCompletedUnitPoolForLab(
  candidates: WeeklyDatasetCandidate[],
  current: WeeklyDatasetCandidate,
  contextCatalog: DictationContextCatalog = kindergartenDictationContextCatalog,
): KindergartenCumulativePoolLab | null {
  if (!current.normalizedStartDate) return null
  const completedReview = reviewTabs(candidates)
    .filter((candidate) => candidate.normalizedEndDate! < current.normalizedStartDate!)
    .sort((left, right) => right.normalizedEndDate!.localeCompare(left.normalizedEndDate!))[0]
  if (!completedReview) return null
  return { ...kindergartenUnitPoolForLab(candidates, completedReview, contextCatalog), kind: 'completed-unit' }
}

export function kindergartenUnitReviewForLab(
  candidates: WeeklyDatasetCandidate[],
  contextCatalog: DictationContextCatalog = kindergartenDictationContextCatalog,
): KindergartenUnitReviewLab {
  const review = reviewTabs(candidates)
    .sort((left, right) => right.normalizedStartDate!.localeCompare(left.normalizedStartDate!))[0]
  if (!review) throw new Error('The Kindergarten workbook contains no explicit unit-review tab.')
  return kindergartenUnitPoolForLab(candidates, review, contextCatalog)
}
