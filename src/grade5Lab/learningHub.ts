import type {
  Grade5BookResource,
  Grade5SourceExtraction,
} from '../curriculum/adapters/grade5GoogleSlides.ts'
import { schoolYearToken } from '../curriculum/identity.ts'
import type { WeeklyDatasetCandidate } from '../curriculum/model.ts'
import { resolveLifecycle } from '../lifecycle/registry.ts'

export type Grade5HubStage = 'acquisition' | 'test-review-1' | 'test-review-2' | 'mastery'
export type Grade5LearningChannel = 'tier-1-writing' | 'tier-2-reading'
export type Grade5ActivityKind = 'acquisition' | 'test-review' | 'warmup' | 'reacquisition'
export type Grade5ActivityAvailability = 'ready' | 'not-connected' | 'unavailable'

export type Grade5ActivityLaunchRequest = {
  cohortId: string | null
  eligibleCohortIds: string[]
  stage: Grade5HubStage
  learningChannel: Grade5LearningChannel
  activityKind: Grade5ActivityKind
  requiredWarmup: boolean
}

export type Grade5CohortSummary = {
  cohortId: string
  dateRangeLabel: string
  tier1Words: string[]
  tier2Words: string[]
  tier3Words: string[]
}

export type Grade5BookActivityResource = {
  title: string
  url: string
  sourceRole: Grade5BookResource['role']
}

export type Grade5HubActivity = {
  id: string
  label: string
  description: string
  availability: Grade5ActivityAvailability
  unavailableReason?: string
  book?: Grade5BookActivityResource
  launchRequests: Grade5ActivityLaunchRequest[]
}

export type Grade5HubSection = {
  id: 'homework' | 'test-review-1' | 'test-review-2' | 'review'
  title: string
  subtitle: string
  stage: Grade5HubStage
  cohorts: Grade5CohortSummary[]
  available: boolean
  unavailableReason?: string
  activities: Grade5HubActivity[]
}

export type Grade5LearningHubModel = {
  grade: 'Grade 5'
  sections: Grade5HubSection[]
}

function summary(candidate: WeeklyDatasetCandidate): Grade5CohortSummary {
  return {
    cohortId: candidate.datasetId!,
    dateRangeLabel: candidate.dateRangeLabel || candidate.normalizedStartDate || 'Unknown week',
    tier1Words: candidate.tier1.map((word) => word.text),
    tier2Words: candidate.tier2.map((word) => word.text),
    tier3Words: candidate.tier3.map((word) => word.text),
  }
}

function launchRequest(
  candidate: WeeklyDatasetCandidate,
  stage: Exclude<Grade5HubStage, 'mastery'>,
  learningChannel: Grade5LearningChannel,
  activityKind: 'acquisition' | 'test-review',
): Grade5ActivityLaunchRequest {
  return {
    cohortId: candidate.datasetId!,
    eligibleCohortIds: [candidate.datasetId!],
    stage,
    learningChannel,
    activityKind,
    requiredWarmup: true,
  }
}

function masteryLaunchRequest(
  candidates: WeeklyDatasetCandidate[],
  learningChannel: Grade5LearningChannel,
  activityKind: 'warmup' | 'reacquisition',
): Grade5ActivityLaunchRequest {
  return {
    cohortId: null,
    eligibleCohortIds: candidates.map((candidate) => candidate.datasetId!),
    stage: 'mastery',
    learningChannel,
    activityKind,
    requiredWarmup: false,
  }
}

function exactBookResource(
  extraction: Grade5SourceExtraction,
  datasetId: string,
  role: Grade5BookResource['role'],
) {
  return extraction.bookResources.find((resource) =>
    resource.datasetId === datasetId && resource.role === role)
}

function cohortActivities(
  extraction: Grade5SourceExtraction,
  candidate: WeeklyDatasetCandidate | undefined,
  stage: 'acquisition' | 'test-review-1' | 'test-review-2',
) {
  const isAcquisition = stage === 'acquisition'
  const unavailableReason = isAcquisition
    ? 'This week’s training words are not ready yet.'
    : `${stage === 'test-review-1' ? 'Ninja Skills' : 'The Final Boss'} becomes available when that word set reaches this stage.`
  const book = candidate
    ? exactBookResource(extraction, candidate.datasetId!, isAcquisition ? 'acquisition' : 'review')
    : undefined
  const writingLabel = isAcquisition ? 'Learn to Write' : 'Writing Test'
  const readingLabel = isAcquisition ? 'Read the Words' : 'Reading Test'
  const activityKind = isAcquisition ? 'acquisition' : 'test-review'

  const activities: Grade5HubActivity[] = [
    {
      id: `${stage}-book`,
      label: 'Read the Book',
      description: book
        ? `${book.title} opens in a separate tab.`
        : 'The book link for this cohort and stage is not available.',
      availability: book ? 'ready' : 'unavailable',
      ...(book ? { book: { title: book.title, url: book.url, sourceRole: book.role } } : {}),
      ...(!book ? { unavailableReason: candidate ? 'The teacher source has no book link for this stage.' : unavailableReason } : {}),
      launchRequests: [],
    },
    {
      id: `${stage}-writing`,
      label: writingLabel,
      description: isAcquisition
        ? 'Warm up, then learn to write this week’s Tier 1 words.'
        : 'Warm up, then practice the complete writing test.',
      availability: candidate ? 'not-connected' : 'unavailable',
      ...(candidate ? {} : { unavailableReason }),
      launchRequests: candidate
        ? [launchRequest(candidate, stage, 'tier-1-writing', activityKind)]
        : [],
    },
    {
      id: `${stage}-reading`,
      label: readingLabel,
      description: isAcquisition
        ? 'Warm up, then learn to read this week’s Tier 2 words.'
        : 'Warm up, then practice the complete reading test.',
      availability: candidate ? 'not-connected' : 'unavailable',
      ...(candidate ? {} : { unavailableReason }),
      launchRequests: candidate
        ? [launchRequest(candidate, stage, 'tier-2-reading', activityKind)]
        : [],
    },
  ]
  if (!isAcquisition) {
    activities.push({
      id: `${stage}-reenter-training-dojo`,
      label: 'Reenter the Training Dojo',
      description: 'Return to guided writing or reading Acquisition for this word set when more help is needed.',
      availability: candidate ? 'not-connected' : 'unavailable',
      ...(candidate ? {} : { unavailableReason }),
      launchRequests: candidate
        ? [
            launchRequest(candidate, stage, 'tier-1-writing', 'acquisition'),
            launchRequest(candidate, stage, 'tier-2-reading', 'acquisition'),
          ]
        : [],
    })
  }
  return activities
}

function masteryActivities(candidates: WeeklyDatasetCandidate[]) {
  const available = candidates.length > 0
  const unavailableReason = 'Review becomes available after a cohort completes both Grade 5 test-review stages.'
  return [
    {
      id: 'mastery-writing-warmup',
      label: 'Tier 1 Writing Warmup',
      description: 'Extended writing review using words from the mastery bank.',
      availability: available ? 'not-connected' : 'unavailable',
      ...(!available ? { unavailableReason } : {}),
      launchRequests: available ? [masteryLaunchRequest(candidates, 'tier-1-writing', 'warmup')] : [],
    },
    {
      id: 'mastery-reading-warmup',
      label: 'Tier 2 Reading Warmup',
      description: 'Extended reading review using words from the Tier 2 mastery bank.',
      availability: available ? 'not-connected' : 'unavailable',
      ...(!available ? { unavailableReason } : {}),
      launchRequests: available ? [masteryLaunchRequest(candidates, 'tier-2-reading', 'warmup')] : [],
    },
    {
      id: 'mastery-reteach',
      label: 'Re-teach Words',
      description: 'Future writing and reading re-acquisition queues remain separate.',
      availability: available ? 'not-connected' : 'unavailable',
      ...(!available ? { unavailableReason } : {}),
      launchRequests: available
        ? [
            masteryLaunchRequest(candidates, 'tier-1-writing', 'reacquisition'),
            masteryLaunchRequest(candidates, 'tier-2-reading', 'reacquisition'),
          ]
        : [],
    },
  ] satisfies Grade5HubActivity[]
}

function latestProgressionDate(extraction: Grade5SourceExtraction) {
  return extraction.progressionEvents.reduce((latest, event) => event.effectiveDate > latest ? event.effectiveDate : latest, '0000-00-00')
}

export function resolveGrade5SourceLifecycle(
  extraction: Grade5SourceExtraction,
  currentDateKey = latestProgressionDate(extraction),
) {
  const candidates = extraction.candidates.filter((candidate) =>
    candidate.datasetId
      && candidate.normalizedStartDate
      && candidate.normalizedEndDate
      && (candidate.status === 'valid' || candidate.status === 'no-instruction'))
  return resolveLifecycle({
    scope: {
      grade: 'Grade 5',
      schoolYearKey: schoolYearToken(candidates[0]?.schoolYear || '2026–2027'),
      currentDateKey,
    },
    sets: candidates.map((candidate) => ({
      datasetId: candidate.datasetId!,
      grade: candidate.grade,
      schoolYearKey: schoolYearToken(candidate.schoolYear),
      activationDate: candidate.normalizedStartDate!,
      instructionalEndDate: candidate.normalizedEndDate!,
      kind: candidate.status === 'no-instruction' ? 'no-instruction' : 'vocabulary',
    })),
    progressionEvents: extraction.progressionEvents,
  })
}

export function buildGrade5LearningHub(
  extraction: Grade5SourceExtraction,
  currentDateKey = latestProgressionDate(extraction),
): Grade5LearningHubModel {
  const candidateByDatasetId = new Map(
    extraction.candidates
      .filter((candidate) => candidate.datasetId && candidate.status === 'valid')
      .map((candidate) => [candidate.datasetId!, candidate]),
  )
  const lifecycle = resolveGrade5SourceLifecycle(extraction, currentDateKey)
  const acquisition = candidateByDatasetId.get(lifecycle.acquisitionDatasetId || '')
  const testReview1 = candidateByDatasetId.get(lifecycle.testReviews.find((review) => review.cycle === 1)?.datasetId || '')
  const testReview2 = candidateByDatasetId.get(lifecycle.testReviews.find((review) => review.cycle === 2)?.datasetId || '')
  const mastery = lifecycle.masteryDatasetIds
    .map((datasetId) => candidateByDatasetId.get(datasetId))
    .filter((candidate): candidate is WeeklyDatasetCandidate => Boolean(candidate))

  const sections: Grade5HubSection[] = [
    {
      id: 'homework',
      title: 'Enter the Training Dojo',
      subtitle: 'Learn this week’s newest writing and reading words.',
      stage: 'acquisition',
      cohorts: acquisition ? [summary(acquisition)] : [],
      available: Boolean(acquisition),
      ...(!acquisition ? { unavailableReason: 'This week’s training words are not ready yet.' } : {}),
      activities: cohortActivities(extraction, acquisition, 'acquisition'),
    },
    {
      id: 'test-review-1',
      title: 'Practice your Ninja Skills',
      subtitle: 'Build confidence with your first test-practice word set.',
      stage: 'test-review-1',
      cohorts: testReview1 ? [summary(testReview1)] : [],
      available: Boolean(testReview1),
      ...(!testReview1 ? { unavailableReason: 'Ninja Skills will unlock when a word set reaches Test Review 1.' } : {}),
      activities: cohortActivities(extraction, testReview1, 'test-review-1'),
    },
    {
      id: 'test-review-2',
      title: 'The Final Boss Test!',
      subtitle: 'Get ready to face the older word set one more time.',
      stage: 'test-review-2',
      cohorts: testReview2 ? [summary(testReview2)] : [],
      available: Boolean(testReview2),
      ...(!testReview2 ? { unavailableReason: 'The Final Boss will unlock when a word set reaches Test Review 2.' } : {}),
      activities: cohortActivities(extraction, testReview2, 'test-review-2'),
    },
    {
      id: 'review',
      title: 'Enter the Spirit realm',
      subtitle: 'Keep older writing and reading vocabulary active.',
      stage: 'mastery',
      cohorts: mastery.map(summary),
      available: mastery.length > 0,
      ...(mastery.length === 0 ? { unavailableReason: 'No cohort has completed both test-review stages yet.' } : {}),
      activities: masteryActivities(mastery),
    },
  ]

  return { grade: 'Grade 5', sections }
}
