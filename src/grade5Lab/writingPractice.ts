import type { Grade5SourceExtraction } from '../curriculum/adapters/grade5GoogleSlides.ts'
import type { WeeklyDatasetCandidate } from '../curriculum/model.ts'
import type { Dataset } from '../domain/contracts.ts'
import type { WarmupLifecycle } from '../warmup/contracts.ts'
import { selectWarmupWords } from '../warmup/engine.ts'
import { grade5AcquisitionTargetSet } from './acquisitionLab.ts'
import { resolveGrade5SourceLifecycle, type Grade5ActivityLaunchRequest } from './learningHub.ts'
import { grade5WritingLabProfile } from './practiceProfile.ts'

function localDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

export function grade5LabDataset(candidate: WeeklyDatasetCandidate): Dataset {
  if (!candidate.datasetId || !candidate.dateRangeLabel || !candidate.normalizedStartDate || !candidate.normalizedEndDate) {
    throw new Error('The validated Grade 5 cohort is missing canonical dates or identity.')
  }
  const targetSet = grade5AcquisitionTargetSet(candidate)
  return {
    id: candidate.datasetId,
    dateRange: candidate.dateRangeLabel,
    startDate: candidate.normalizedStartDate,
    endDate: candidate.normalizedEndDate,
    grade: candidate.grade,
    schoolYear: candidate.schoolYear,
    description: 'Grade 5 Tier 1 writing',
    sourceDeckId: candidate.source.sourceDocumentId,
    sourceSlideId: candidate.source.sourceUnitId,
    importStatus: 'valid',
    words: targetSet.targets.map((target) => ({
      ...target,
      grade: 'Grade 5',
      sourceSlideId: candidate.source.sourceUnitId,
    })),
  }
}

export function grade5LabDatasets(extraction: Grade5SourceExtraction) {
  return extraction.candidates
    .filter((candidate) => candidate.status === 'valid' && Boolean(candidate.datasetId))
    .map(grade5LabDataset)
}

export function grade5LabWritingRequestIsConnected(request: Grade5ActivityLaunchRequest) {
  return (request.activityKind === 'acquisition' || request.activityKind === 'test-review')
    && request.learningChannel === 'tier-1-writing'
    && Boolean(request.cohortId)
}

function warmupLifecycle(kind: string): WarmupLifecycle {
  if (kind === 'mastery') return 'mastered'
  if (kind === 'test-review') return 'test-review'
  if (kind === 'acquisition') return 'acquisition'
  if (kind === 'no-instruction') return 'no-instruction'
  return 'future'
}

export function grade5LabWarmupSelection(
  extraction: Grade5SourceExtraction,
  currentDateKey: string,
  random: () => number = Math.random,
) {
  const datasets = grade5LabDatasets(extraction)
  const lifecycle = resolveGrade5SourceLifecycle(extraction, currentDateKey)
  const selection = selectWarmupWords({
    datasets,
    results: [],
    childId: 'grade5-lab-child',
    today: localDate(currentDateKey),
    rotationCycleId: 1,
    lifecycle: {
      masteredDatasetIds: lifecycle.masteryDatasetIds,
      masteredAtByDatasetId: lifecycle.masteredAtByDatasetId,
      lifecycleByDatasetId: Object.fromEntries(
        Object.entries(lifecycle.assignmentByDatasetId).map(([datasetId, assignment]) => [datasetId, warmupLifecycle(assignment.stage.kind)]),
      ),
    },
    policy: grade5WritingLabProfile.lifecycle,
    targetSize: grade5WritingLabProfile.lifecycle.primaryWarmupTrials,
    random,
  })
  const words = [...selection.words]
  const exhaustedPool = [...selection.words]
  let repeatIndex = 0
  while (words.length < grade5WritingLabProfile.lifecycle.primaryWarmupTrials && exhaustedPool.length > 0) {
    words.push(exhaustedPool[repeatIndex % exhaustedPool.length])
    repeatIndex += 1
  }
  return { ...selection, words }
}
