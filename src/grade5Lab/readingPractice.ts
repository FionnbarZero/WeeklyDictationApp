import type { Grade5SourceExtraction } from '../curriculum/adapters/grade5GoogleSlides.ts'
import { datasetFromCanonicalCandidate } from '../curriculum/datasetProjection.ts'
import type { WeeklyDatasetCandidate } from '../curriculum/model.ts'
import type { Tier2ReadingCohort, Tier2ReadingPathway, Tier2ReadingTarget } from '../tier2/contracts.ts'
import { resolveGrade5SourceLifecycle, type Grade5ActivityLaunchRequest } from './learningHub.ts'
import type { Grade5LabResult } from './persistence.ts'
import { grade5WritingLabProfile } from './practiceProfile.ts'

function candidateById(extraction: Grade5SourceExtraction, datasetId: string) {
  return extraction.classification.selectedCandidates.find(
    (candidate) => candidate.datasetId === datasetId && candidate.status === 'valid',
  )
}

function readingCohort(candidate: WeeklyDatasetCandidate): Tier2ReadingCohort {
  const dataset = datasetFromCanonicalCandidate(candidate)
  const targets = dataset.vocabulary?.tier2 || []
  const valid = targets.every(
    (target) => target.language === 'mandarin' && target.tier === 'tier-2' && target.activityType === 'reading',
  )
  if (!valid) throw new Error(`Grade 5 cohort ${dataset.id} contains invalid Tier 2 reading targets.`)
  return {
    datasetId: dataset.id,
    targets: targets as Tier2ReadingTarget[],
    available: targets.length > 0,
    ...(targets.length === 0 ? { unavailableReason: 'This Grade 5 cohort has no Tier 2 reading targets.' } : {}),
  }
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

/**
 * Grade 5 reading uses the same 1/2/3 recovery/recent/rotation shape and
 * promotion thresholds as writing, but selects only Tier 2 reading targets.
 */
export function grade5LabReadingWarmupPathway(
  extraction: Grade5SourceExtraction,
  currentDateKey: string,
  scopeId: string,
  random: () => number = Math.random,
  priorResults: readonly Grade5LabResult[] = [],
): Tier2ReadingPathway {
  const lifecycle = resolveGrade5SourceLifecycle(extraction, currentDateKey)
  const masteredIds = new Set(lifecycle.masteryDatasetIds)
  const seenTerms = new Set<string>()
  const eligibleTargets = extraction.classification.selectedCandidates
    .filter((candidate) => candidate.datasetId && candidate.status === 'valid' && masteredIds.has(candidate.datasetId))
    .flatMap((candidate) => readingCohort(candidate).targets)
    .filter((target) => {
      const term = target.text.normalize('NFC').trim().replace(/\s+/g, ' ')
      if (seenTerms.has(term)) return false
      seenTerms.add(term)
      return true
    })
  const categoryByTargetId = new Map<string, 'needs-attention' | 'recent-entry' | 'mastery-rotation'>()
  const streakByTargetId = new Map<string, number>()
  const orderedResults = priorResults
    .filter((result) => result.channel === 'tier-2-reading')
    .sort((left, right) => left.completedAt.localeCompare(right.completedAt))
  for (const result of orderedResults) {
    for (const answer of result.answers) {
      if (!answer.correct) {
        categoryByTargetId.set(answer.wordId, 'needs-attention')
        streakByTargetId.set(answer.wordId, 0)
        continue
      }
      const streak = (streakByTargetId.get(answer.wordId) || 0) + 1
      streakByTargetId.set(answer.wordId, streak)
      const current = categoryByTargetId.get(answer.wordId)
      if (answer.phase === 'primary' && result.reviewCycle === 2) {
        categoryByTargetId.set(answer.wordId, 'recent-entry')
      } else if (
        current === 'needs-attention' &&
        streak >= grade5WritingLabProfile.lifecycle.erroredWordPromotionStreak
      ) {
        categoryByTargetId.set(answer.wordId, 'mastery-rotation')
      } else if (
        current === 'recent-entry' &&
        streak >= grade5WritingLabProfile.lifecycle.recentReviewPromotionStreak
      ) {
        categoryByTargetId.set(answer.wordId, 'mastery-rotation')
      }
    }
  }
  const categories = {
    'needs-attention': shuffled(
      eligibleTargets.filter((target) => categoryByTargetId.get(target.id) === 'needs-attention'),
      random,
    ),
    'recent-entry': shuffled(
      eligibleTargets.filter((target) => categoryByTargetId.get(target.id) === 'recent-entry'),
      random,
    ),
    'mastery-rotation': shuffled(
      eligibleTargets.filter(
        (target) =>
          !categoryByTargetId.has(target.id) || categoryByTargetId.get(target.id) === 'mastery-rotation',
      ),
      random,
    ),
  }
  const allocation = { 'needs-attention': 1, 'recent-entry': 2, 'mastery-rotation': 3 } as const
  const targets: Tier2ReadingTarget[] = []
  const selected = new Set<string>()
  const addFrom = (category: keyof typeof categories, maximum: number) => {
    for (const target of categories[category]) {
      if (targets.length >= grade5WritingLabProfile.lifecycle.primaryWarmupTrials || maximum <= 0) break
      if (selected.has(target.id)) continue
      targets.push(target)
      selected.add(target.id)
      maximum -= 1
    }
  }
  for (const category of ['needs-attention', 'recent-entry', 'mastery-rotation'] as const) {
    addFrom(category, allocation[category])
  }
  for (const category of ['needs-attention', 'recent-entry', 'mastery-rotation'] as const) {
    addFrom(category, grade5WritingLabProfile.lifecycle.primaryWarmupTrials - targets.length)
  }
  const available = targets.length > 0
  return {
    kind: 'mastery',
    cohorts: [
      {
        datasetId: `__grade5-reading-warmup__:${scopeId}`,
        targets,
        available,
        ...(!available ? { unavailableReason: 'No mastered Tier 2 reading targets are ready for Warmup.' } : {}),
      },
    ],
    available,
    ...(!available ? { unavailableReason: 'No mastered Tier 2 reading targets are ready for Warmup.' } : {}),
  }
}

export function grade5LabReadingRequestIsConnected(request: Grade5ActivityLaunchRequest) {
  return (
    request.learningChannel === 'tier-2-reading' && (Boolean(request.cohortId) || request.activityKind === 'warmup')
  )
}

export function grade5LabReadingPathway(
  extraction: Grade5SourceExtraction,
  request: Grade5ActivityLaunchRequest,
): Tier2ReadingPathway {
  if (!grade5LabReadingRequestIsConnected(request)) {
    throw new Error('This Grade 5 reading request is not connected to the prototype reading runner.')
  }
  const cohortIds = request.cohortId ? [request.cohortId] : request.eligibleCohortIds
  const cohorts = cohortIds.map((datasetId) => {
    const candidate = candidateById(extraction, datasetId)
    if (!candidate) throw new Error(`The Grade 5 reading cohort ${datasetId} is unavailable.`)
    return readingCohort(candidate)
  })
  const available = cohorts.some((cohort) => cohort.available)
  const kind =
    request.activityKind === 'acquisition' || request.activityKind === 'reacquisition'
      ? 'acquisition'
      : request.activityKind === 'test-review'
        ? 'test-review'
        : 'mastery'
  const cycle = request.stage === 'test-review-2' ? 2 : request.stage === 'test-review-1' ? 1 : undefined
  return {
    kind,
    ...(cycle ? { cycle } : {}),
    ...(kind === 'test-review' && request.cohortId ? { reviewGroupId: `grade5-review:${request.cohortId}` } : {}),
    cohorts,
    available,
    ...(!available ? { unavailableReason: 'No Tier 2 reading targets are available for this Grade 5 pathway.' } : {}),
  }
}
