import type { Grade5SourceExtraction } from '../curriculum/adapters/grade5GoogleSlides.ts'
import type { WeeklyDatasetCandidate } from '../curriculum/model.ts'
import type { Dataset } from '../domain/contracts.ts'
import { grade5AcquisitionTargetSet } from './acquisitionLab.ts'
import { resolveGrade5SourceLifecycle, type Grade5ActivityLaunchRequest } from './learningHub.ts'
import { grade5WritingLabProfile } from './practiceProfile.ts'

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
  return extraction.classification.selectedCandidates
    .filter((candidate) => candidate.status === 'valid' && Boolean(candidate.datasetId))
    .map(grade5LabDataset)
}

export function grade5LabWritingRequestIsConnected(request: Grade5ActivityLaunchRequest) {
  return (request.activityKind === 'acquisition' || request.activityKind === 'test-review')
    && request.learningChannel === 'tier-1-writing'
    && Boolean(request.cohortId)
}

function shuffled<T>(values: readonly T[], random: () => number) {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = result[index]
    result[index] = result[swapIndex]
    result[swapIndex] = current
  }
  return result
}

export function grade5LabWarmupSelection(
  extraction: Grade5SourceExtraction,
  currentDateKey: string,
  random: () => number = Math.random,
) {
  const datasets = grade5LabDatasets(extraction)
  const lifecycle = resolveGrade5SourceLifecycle(extraction, currentDateKey)
  const masteredIds = new Set(lifecycle.masteryDatasetIds)
  const seenTerms = new Set<string>()
  const eligibleWords = datasets.filter((dataset) => masteredIds.has(dataset.id)).flatMap((dataset) => dataset.words)
  const words = shuffled(eligibleWords, random).filter((word) => {
    const term = word.text.normalize('NFC').trim().replace(/\s+/g, ' ')
    if (seenTerms.has(term)) return false
    seenTerms.add(term)
    return true
  }).slice(0, grade5WritingLabProfile.warmupPreview.preActivityMaximum)
  return { words }
}
