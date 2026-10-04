import type { Grade5SourceExtraction } from '../curriculum/adapters/grade5GoogleSlides.ts'
import type { WeeklyDatasetCandidate } from '../curriculum/model.ts'
import type { Dataset, Word } from '../domain/contracts.ts'
import { grade5AcquisitionTargetSet } from './acquisitionLab.ts'
import { resolveGrade5SourceLifecycle, type Grade5ActivityLaunchRequest } from './learningHub.ts'
import { grade5WritingLabProfile } from './practiceProfile.ts'
import type { Grade5LabResult } from './persistence.ts'
import type { WarmupCategory } from '../warmup/contracts.ts'

type Grade5WarmupCategory = Exclude<WarmupCategory, 'acquisition'>

export function grade5LabDataset(candidate: WeeklyDatasetCandidate): Dataset {
  if (
    !candidate.datasetId ||
    !candidate.dateRangeLabel ||
    !candidate.normalizedStartDate ||
    !candidate.normalizedEndDate
  ) {
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
  return (
    (request.activityKind === 'acquisition' ||
      request.activityKind === 'test-review' ||
      request.activityKind === 'reacquisition') &&
    request.learningChannel === 'tier-1-writing' &&
    Boolean(request.cohortId)
  )
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
  priorResults: readonly Grade5LabResult[] = [],
) {
  const datasets = grade5LabDatasets(extraction)
  const lifecycle = resolveGrade5SourceLifecycle(extraction, currentDateKey)
  const masteredIds = new Set(lifecycle.masteryDatasetIds)
  const seenTerms = new Set<string>()
  const eligibleWords = datasets
    .filter((dataset) => masteredIds.has(dataset.id))
    .flatMap((dataset) => dataset.words)
    .filter((word) => {
      const term = word.text.normalize('NFC').trim().replace(/\s+/g, ' ')
      if (seenTerms.has(term)) return false
      seenTerms.add(term)
      return true
    })
  const bucketByWordId = new Map<string, Grade5WarmupCategory>()
  const streakByWordId = new Map<string, number>()
  const orderedResults = [...priorResults].sort((left, right) => left.completedAt.localeCompare(right.completedAt))
  for (const result of orderedResults) {
    for (const answer of result.answers) {
      if (answer.phase === 'primary' && result.reviewCycle !== 2) continue
      if (!answer.correct) {
        bucketByWordId.set(answer.wordId, 'errored-word')
        streakByWordId.set(answer.wordId, 0)
        continue
      }
      const streak = (streakByWordId.get(answer.wordId) || 0) + 1
      streakByWordId.set(answer.wordId, streak)
      const current = bucketByWordId.get(answer.wordId)
      if (answer.phase === 'primary' && result.reviewCycle === 2) {
        bucketByWordId.set(answer.wordId, 'recent-review')
      } else if (current === 'errored-word' && streak >= grade5WritingLabProfile.lifecycle.erroredWordPromotionStreak) {
        bucketByWordId.set(answer.wordId, 'random-rotation')
      } else if (
        current === 'recent-review' &&
        streak >= grade5WritingLabProfile.lifecycle.recentReviewPromotionStreak
      ) {
        bucketByWordId.set(answer.wordId, 'random-rotation')
      }
    }
  }
  const categories = {
    'errored-word': shuffled(
      eligibleWords.filter((word) => bucketByWordId.get(word.id) === 'errored-word'),
      random,
    ),
    'recent-review': shuffled(
      eligibleWords.filter((word) => bucketByWordId.get(word.id) === 'recent-review'),
      random,
    ),
    'random-rotation': shuffled(
      eligibleWords.filter((word) => !bucketByWordId.has(word.id) || bucketByWordId.get(word.id) === 'random-rotation'),
      random,
    ),
  } satisfies Record<Grade5WarmupCategory, Word[]>
  const allocations: Record<Grade5WarmupCategory, number> = {
    'errored-word': 1,
    'recent-review': 2,
    'random-rotation': 3,
  }
  const words: Word[] = []
  const selected = new Set<string>()
  const addFrom = (category: Grade5WarmupCategory, maximum: number) => {
    for (const word of categories[category]) {
      if (words.length >= grade5WritingLabProfile.warmupPreview.preActivityMaximum || maximum <= 0) break
      if (selected.has(word.id)) continue
      words.push(word)
      selected.add(word.id)
      bucketByWordId.set(word.id, category)
      maximum -= 1
    }
  }
  for (const category of ['errored-word', 'recent-review', 'random-rotation'] as const) {
    addFrom(category, allocations[category])
  }
  for (const category of ['errored-word', 'recent-review', 'random-rotation'] as const) {
    addFrom(category, grade5WritingLabProfile.warmupPreview.preActivityMaximum - words.length)
  }
  return {
    words,
    categoryByWordId: Object.fromEntries(
      words.map((word) => [word.id, bucketByWordId.get(word.id) || 'random-rotation']),
    ),
  }
}
