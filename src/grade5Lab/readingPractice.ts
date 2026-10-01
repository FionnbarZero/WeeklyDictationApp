import type { Grade5SourceExtraction } from '../curriculum/adapters/grade5GoogleSlides.ts'
import { datasetFromCanonicalCandidate } from '../curriculum/datasetProjection.ts'
import type { WeeklyDatasetCandidate } from '../curriculum/model.ts'
import type {
  Tier2ReadingCohort,
  Tier2ReadingPathway,
  Tier2ReadingTarget,
} from '../tier2/contracts.ts'
import type { Grade5ActivityLaunchRequest } from './learningHub.ts'

function candidateById(extraction: Grade5SourceExtraction, datasetId: string) {
  return extraction.classification.selectedCandidates.find((candidate) =>
    candidate.datasetId === datasetId && candidate.status === 'valid')
}

function readingCohort(candidate: WeeklyDatasetCandidate): Tier2ReadingCohort {
  const dataset = datasetFromCanonicalCandidate(candidate)
  const targets = dataset.vocabulary?.tier2 || []
  const valid = targets.every((target) => target.language === 'mandarin'
    && target.tier === 'tier-2'
    && target.activityType === 'reading')
  if (!valid) throw new Error(`Grade 5 cohort ${dataset.id} contains invalid Tier 2 reading targets.`)
  return {
    datasetId: dataset.id,
    targets: targets as Tier2ReadingTarget[],
    available: targets.length > 0,
    ...(targets.length === 0 ? { unavailableReason: 'This Grade 5 cohort has no Tier 2 reading targets.' } : {}),
  }
}

export function grade5LabReadingRequestIsConnected(request: Grade5ActivityLaunchRequest) {
  return request.learningChannel === 'tier-2-reading'
    && (Boolean(request.cohortId) || request.activityKind === 'warmup')
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
  const kind = request.activityKind === 'acquisition' || request.activityKind === 'reacquisition'
    ? 'acquisition'
    : request.activityKind === 'test-review'
      ? 'test-review'
      : 'mastery'
  const cycle = request.stage === 'test-review-2' ? 2 : request.stage === 'test-review-1' ? 1 : undefined
  return {
    kind,
    ...(cycle ? { cycle } : {}),
    cohorts,
    available,
    ...(!available ? { unavailableReason: 'No Tier 2 reading targets are available for this Grade 5 pathway.' } : {}),
  }
}
