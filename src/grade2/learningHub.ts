import type { Dataset, PracticeTarget } from '../domain.ts'
import type { DojoExperienceId, DojoReentryCohort } from '../practice/dojoReentry.ts'
import type {
  LearningHubActivity,
  LearningHubCohort,
  LearningHubSection,
  LearningHubViewModel,
} from '../learningHub/contracts.ts'
import { SHARED_LEARNING_PATH_TITLES } from '../learningHub/activityNames.ts'
import type { Tier2ReadingLifecycle, Tier2ReadingPathway } from '../tier2/contracts.ts'
import { tier2ReadingAcquisitionPathwayForDataset, tier2ReadingPathwayTargets } from '../tier2/pathway.ts'
import { grade2StrokeOrderConfig } from '../learningGames/strokeOrder/grade2Adapter.ts'

export type DojoLaunchSelection = {
  readonly intent: 'start' | 'continue' | 'practice-again'
  readonly progressionId?: string
}

export type Grade2LearningHubLaunch =
  | { kind: 'writing'; target: PracticeTarget; selection?: DojoLaunchSelection }
  | { kind: 'stroke-order'; target: PracticeTarget; selection?: DojoLaunchSelection }
  | { kind: 'reading'; pathway: Tier2ReadingPathway; selection?: DojoLaunchSelection }
  | { kind: 'warmup' }

export type Grade2LearningHubInput = {
  childName: string
  datasets: readonly Dataset[]
  masteredDatasets: readonly Dataset[]
  acquisitionTarget: PracticeTarget | null
  testReviewTarget: PracticeTarget | null
  readingLifecycle: Tier2ReadingLifecycle | null
  warmupWordCount: number
  reentryCohorts?: readonly DojoReentryCohort[]
}

function uniqueWords(words: readonly string[]) {
  return [...new Set(words)]
}

function datasetsForTarget(target: PracticeTarget | null) {
  return target ? target.reviewDatasets || [target.dataset] : []
}

function datasetsForPathway(pathway: Tier2ReadingPathway | null, datasets: readonly Dataset[]) {
  if (!pathway) return []
  const byId = new Map(datasets.map((dataset) => [dataset.id, dataset]))
  return pathway.cohorts
    .map((cohort) => byId.get(cohort.datasetId))
    .filter((dataset): dataset is Dataset => Boolean(dataset))
}

function cohort(id: string, datasets: readonly Dataset[]): LearningHubCohort | null {
  if (datasets.length === 0) return null
  const writing = uniqueWords(datasets.flatMap((dataset) => dataset.words.map((word) => word.text)))
  const reading = uniqueWords(datasets.flatMap((dataset) => dataset.vocabulary?.tier2?.map((word) => word.text) || []))
  return {
    id,
    label: datasets.length === 1 ? datasets[0].dateRange : `${datasets.length} teaching weeks`,
    countLabel: `${writing.length} writing · ${reading.length} reading`,
    groups: [
      { label: 'Tier 1 · Writing', words: writing },
      { label: 'Tier 2 · Reading', words: reading },
    ],
  }
}

function launchActivity(
  id: string,
  eyebrow: string,
  title: string,
  description: string,
  icon: string,
  launch: Grade2LearningHubLaunch | null,
  unavailableReason: string,
): LearningHubActivity<Grade2LearningHubLaunch> {
  return {
    id,
    eyebrow,
    title,
    description,
    icon,
    action: launch
      ? { kind: 'launch', label: title, launch }
      : { kind: 'disabled', label: 'Not Available Yet', reason: unavailableReason },
  }
}

function gamePreview(id: string, eyebrow: string, title: string, description: string, icon: string) {
  return launchActivity(
    id,
    eyebrow,
    title,
    description,
    icon,
    null,
    'The shared game UI is ready, but Grade 2 game scoring is not connected yet.',
  )
}

function section(
  values: Omit<LearningHubSection<Grade2LearningHubLaunch>, 'cohorts'> & { cohort: LearningHubCohort | null },
): LearningHubSection<Grade2LearningHubLaunch> {
  const { cohort: sectionCohort, ...rest } = values
  return { ...rest, cohorts: sectionCohort ? [sectionCohort] : [] }
}

function readingPathway(lifecycle: Tier2ReadingLifecycle | null, kind: Tier2ReadingPathway['kind']) {
  if (!lifecycle) return null
  if (kind === 'acquisition') return lifecycle.acquisition?.available ? lifecycle.acquisition : null
  if (kind === 'mastery') return lifecycle.mastery.available ? lifecycle.mastery : null
  return lifecycle.testReviews.find((pathway) => pathway.available) || null
}

const reentryExperienceLabels: Record<DojoExperienceId, string> = {
  writing: 'Writing',
  'stroke-order': 'Stroke Order',
  reading: 'Reading',
}

function reentryFor(cohorts: readonly DojoReentryCohort[]): LearningHubSection<Grade2LearningHubLaunch>['reentry'] {
  if (cohorts.length === 0) return undefined
  return {
    label: 'Reenter',
    description:
      'Choose any earlier date to continue unfinished work, start another activity, or practice a completed activity again.',
    pickerLabel: 'Choose a historical date',
    cohorts: cohorts.map((cohort) => {
      const target: PracticeTarget = { dataset: cohort.dataset, phase: 'acquisition' }
      const reading = tier2ReadingAcquisitionPathwayForDataset(cohort.dataset)
      const strokeAvailable = grade2StrokeOrderConfig(target).unsupportedTargets.length === 0
      const byExperience = new Map(cohort.experiences.map((experience) => [experience.experienceId, experience]))
      const actionFor = (
        experienceId: DojoExperienceId,
        launch: Grade2LearningHubLaunch | null,
        capabilityReason: string,
      ) => {
        const experience = byExperience.get(experienceId)!
        const activity = reentryExperienceLabels[experienceId]
        if (!launch || experience.status === 'unavailable') {
          const reason = experience.unavailableReason || capabilityReason
          return {
            id: `${cohort.dataset.id}-${experienceId}`,
            kind: 'disabled' as const,
            label: `${activity} Unavailable`,
            description: reason,
            reason,
          }
        }
        const intent =
          experience.status === 'in-progress'
            ? ('continue' as const)
            : experience.status === 'completed'
              ? ('practice-again' as const)
              : ('start' as const)
        const verb = intent === 'continue' ? 'Continue' : intent === 'practice-again' ? 'Practice again' : 'Start'
        return {
          id: `${cohort.dataset.id}-${experienceId}`,
          kind: 'launch' as const,
          label: `${verb} ${activity}`,
          description:
            intent === 'continue'
              ? 'Resume the latest saved prompt.'
              : intent === 'practice-again'
                ? 'Create a new visit without changing the completed cohort.'
                : `Begin ${activity} for this date.`,
          launch: { ...launch, selection: { intent, progressionId: experience.progressionId } },
        }
      }
      const completed = cohort.experiences.filter((experience) => experience.status === 'completed').length
      const unfinished = cohort.experiences.filter((experience) => experience.status === 'in-progress').length
      const availableToStart = cohort.experiences.filter((experience) => experience.status === 'not-started').length
      const unavailable = cohort.experiences.filter((experience) => experience.status === 'unavailable').length
      return {
        id: cohort.dataset.id,
        label: cohort.dataset.dateRange,
        statusLabel: [
          unfinished ? `${unfinished} unfinished` : '',
          completed ? `${completed} completed` : '',
          availableToStart ? `${availableToStart} available to start` : '',
          unavailable ? `${unavailable} unavailable` : '',
        ]
          .filter(Boolean)
          .join(' · '),
        actions: [
          actionFor('writing', { kind: 'writing', target }, 'Writing targets are unavailable for this date.'),
          actionFor(
            'stroke-order',
            strokeAvailable ? { kind: 'stroke-order', target } : null,
            'Stroke geometry is incomplete for this date.',
          ),
          actionFor(
            'reading',
            reading ? { kind: 'reading', pathway: reading } : null,
            'Reading targets are unavailable for this date.',
          ),
        ],
      }
    }),
  }
}

export function grade2LearningHubView(input: Grade2LearningHubInput): LearningHubViewModel<Grade2LearningHubLaunch> {
  const readingAcquisition = readingPathway(input.readingLifecycle, 'acquisition')
  const readingReview = readingPathway(input.readingLifecycle, 'test-review')
  const readingMastery = readingPathway(input.readingLifecycle, 'mastery')
  const acquisitionDatasets = datasetsForTarget(input.acquisitionTarget).length
    ? datasetsForTarget(input.acquisitionTarget)
    : datasetsForPathway(readingAcquisition, input.datasets)
  const reviewDatasets = datasetsForTarget(input.testReviewTarget).length
    ? datasetsForTarget(input.testReviewTarget)
    : datasetsForPathway(readingReview, input.datasets)
  const dojoCohort = cohort('grade-2-dojo', acquisitionDatasets)
  const reviewCohort = cohort('grade-2-final-boss', reviewDatasets)
  const masteryCohort = cohort('grade-2-spirit-realm', input.masteredDatasets)
  const gamesCohort = dojoCohort || masteryCohort
  const dojoReentry = reentryFor(input.reentryCohorts || [])
  const dojoAvailable = Boolean(input.acquisitionTarget || readingAcquisition || dojoReentry)
  const finalBossAvailable = Boolean(input.testReviewTarget || readingReview)
  const spiritRealmAvailable = input.warmupWordCount > 0 || Boolean(readingMastery)

  return {
    brandMark: '二',
    brandLabel: 'Weekly Dictation',
    profileLabel: 'Grade 2',
    eyebrow: 'Grade 2 adventures',
    title: 'Ready for your next challenge,',
    titleAccent: `${input.childName}?`,
    introduction: 'Choose one path. Writing and reading use the same weekly words while keeping their own practice records.',
    heroTitle: 'Learn. Practice.',
    heroAccent: 'Grow stronger.',
    heroDescription: 'Visit this week’s Dojo, build Ninja Skills, prepare for the Final Boss, or strengthen mastery words in the Spirit Realm.',
    heroMark: '字',
    sectionEyebrow: 'Choose your path',
    sectionTitle: 'Where do you want to go?',
    sectionHint: 'One challenge at a time',
    sections: [
      section({
        id: 'dojo',
        number: '1',
        kicker: 'Current week',
        title: SHARED_LEARNING_PATH_TITLES.dojo,
        subtitle: 'Learn this week’s writing and reading words.',
        detailTitle: 'Welcome to the Dojo',
        detailSubtitle: 'Choose Writing, Reading, or Stroke Order. Each activity keeps its own progress.',
        actionLabel: SHARED_LEARNING_PATH_TITLES.dojo,
        theme: 'gold',
        available: dojoAvailable,
        ...(!dojoAvailable ? { unavailableReason: 'This week’s Acquisition words are not available.' } : {}),
        cohort: dojoCohort,
        ...(dojoReentry ? { reentry: dojoReentry } : {}),
        activities: [
          launchActivity(
            'dojo-writing',
            'Tier 1 · Writing',
            'Learn to Write',
            'Complete the established Grade 2 Acquisition sequence.',
            '✍️',
            input.acquisitionTarget ? { kind: 'writing', target: input.acquisitionTarget } : null,
            'No writing Acquisition cohort is active.',
          ),
          launchActivity(
            'dojo-stroke-order',
            'Tier 1 · Writing game',
            'Stroke Order',
            'Watch each target form, copy its strokes, then write it from memory.',
            '🥋',
            input.acquisitionTarget && grade2StrokeOrderConfig(input.acquisitionTarget).unsupportedTargets.length === 0
              ? { kind: 'stroke-order', target: input.acquisitionTarget }
              : null,
            input.acquisitionTarget
              ? 'Stroke geometry is incomplete for this cohort.'
              : 'No writing Acquisition cohort is active.',
          ),
          launchActivity(
            'dojo-reading',
            'Tier 2 · Reading',
            'Read the Words',
            'Look, listen, record, compare, and self-assess each reading word.',
            '🎧',
            readingAcquisition ? { kind: 'reading', pathway: readingAcquisition } : null,
            'No reading Acquisition cohort is active.',
          ),
        ],
      }),
      section({
        id: 'ninja-skills',
        number: '2',
        kicker: 'Play and practice',
        title: SHARED_LEARNING_PATH_TITLES.ninjaSkills,
        subtitle: 'Build writing and reading power through short games.',
        actionLabel: 'Choose a game',
        theme: 'blue',
        available: Boolean(gamesCohort),
        ...(!gamesCohort ? { unavailableReason: 'Ninja Skills will open when curriculum words are available.' } : {}),
        cohort: gamesCohort,
        activities: [
          gamePreview('ninja-listening', 'Listening game', 'Listening Lily Pads', 'Hear a word and choose its matching character.', '🐸'),
          gamePreview('ninja-memory', 'Reading game', 'Memory Lanterns', 'Turn over cards and match the same word.', '🏮'),
          gamePreview('ninja-sky-writing', 'Writing game', 'Sky Writing', 'Practice forming a character on the screen.', '☁️'),
        ],
      }),
      section({
        id: 'final-boss',
        number: '3',
        kicker: 'Test Review',
        title: SHARED_LEARNING_PATH_TITLES.finalBoss,
        subtitle: 'Complete Grade 2’s writing or reading Test Review.',
        actionLabel: 'Face the Final Boss',
        theme: 'violet',
        available: finalBossAvailable,
        ...(!finalBossAvailable ? { unavailableReason: 'The Final Boss opens when a word set reaches Test Review.' } : {}),
        cohort: reviewCohort,
        activities: [
          launchActivity('final-boss-writing', 'Tier 1 · Writing', 'Writing Test', 'Complete the existing Grade 2 writing Test Review.', '🐉', input.testReviewTarget ? { kind: 'writing', target: input.testReviewTarget } : null, 'No writing Test Review cohort is active.'),
          launchActivity('final-boss-reading', 'Tier 2 · Reading', 'Reading Test', 'Record and compare every visible reading target.', '🎧', readingReview ? { kind: 'reading', pathway: readingReview } : null, 'No reading Test Review cohort is active.'),
        ],
      }),
      section({
        id: 'spirit-realm',
        number: '4',
        kicker: 'Mastery review',
        title: SHARED_LEARNING_PATH_TITLES.spiritRealm,
        subtitle: 'Keep older writing and reading words strong.',
        actionLabel: SHARED_LEARNING_PATH_TITLES.spiritRealm,
        theme: 'green',
        available: spiritRealmAvailable,
        ...(!spiritRealmAvailable ? { unavailableReason: 'The Spirit Realm opens after words reach mastery.' } : {}),
        cohort: masteryCohort,
        activities: [
          launchActivity('spirit-realm-writing', 'Tier 1 · Writing mastery', 'Writing mastery warmup', `${input.warmupWordCount} unique mastery target${input.warmupWordCount === 1 ? '' : 's'} available.`, '🌙', input.warmupWordCount > 0 ? { kind: 'warmup' } : null, 'No writing mastery targets are available.'),
          launchActivity('spirit-realm-reading', 'Tier 2 · Reading mastery', 'Reading mastery', `${readingMastery ? tier2ReadingPathwayTargets(readingMastery).length : 0} reading mastery targets available.`, '🎧', readingMastery ? { kind: 'reading', pathway: readingMastery } : null, 'No reading mastery targets are available.'),
        ],
      }),
    ],
  }
}
