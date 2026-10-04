import type { WeeklyDatasetCandidate } from '../curriculum/model.ts'
import type {
  LearningHubActivity,
  LearningHubCohort,
  LearningHubSection,
  LearningHubViewModel,
} from '../learningHub/contracts.ts'
import { SHARED_LEARNING_PATH_TITLES } from '../learningHub/activityNames.ts'
import { KINDERGARTEN_UNIT_ONE_LAB_FIXTURE, type KindergartenUnitReviewLab } from './unitReview.ts'

export type KindergartenHubActivityKind =
  | 'dojo-writing'
  | 'dojo-reading'
  | 'ninja-listening'
  | 'ninja-memory'
  | 'ninja-sky-writing'
  | 'final-boss'
  | 'final-boss-reading'
  | 'spirit-realm'
  | 'spirit-realm-reading'

export type KindergartenHubLaunch = {
  kind: KindergartenHubActivityKind
  label: string
}

function launchActivity(
  kind: KindergartenHubActivityKind,
  eyebrow: string,
  title: string,
  description: string,
  icon: string,
): LearningHubActivity<KindergartenHubLaunch> {
  return {
    id: kind,
    eyebrow,
    title,
    description,
    icon,
    action: { kind: 'launch', label: title, launch: { kind, label: title } },
  }
}

function currentWeekCohort(candidate: WeeklyDatasetCandidate): LearningHubCohort {
  return {
    id: candidate.datasetId || candidate.source.sourceUnitId,
    label: candidate.rawDate || candidate.dateRangeLabel || 'Current week',
    countLabel: `${candidate.tier1.length} writing · ${candidate.tier2.length} reading`,
    groups: [
      { label: 'Writing characters', words: candidate.tier1.map((word) => word.text) },
      { label: 'High-frequency reading', words: candidate.tier2.map((word) => word.text) },
    ],
  }
}

function unitCohort(review: KindergartenUnitReviewLab): LearningHubCohort {
  return {
    id: review.dataset.id,
    label: `${review.label} · ${review.sourceWeekCount} weeks`,
    countLabel: `${review.tier1Words.length} writing · ${review.tier2Words.length} reading`,
    groups: [
      { label: 'Tier 1 · Writing', words: review.tier1Words },
      { label: 'Tier 2 · Reading', words: review.tier2Words },
    ],
  }
}

function section(
  values: Omit<LearningHubSection<KindergartenHubLaunch>, 'available' | 'unavailableReason'>,
  available = true,
  unavailableReason = 'This path will open when the Unit 1 mastery words are ready.',
): LearningHubSection<KindergartenHubLaunch> {
  return {
    ...values,
    available,
    ...(!available ? { unavailableReason } : {}),
  }
}

export function kindergartenLearningHubView(
  candidate: WeeklyDatasetCandidate,
  review: KindergartenUnitReviewLab | null,
): LearningHubViewModel<KindergartenHubLaunch> {
  const week = currentWeekCohort(candidate)
  const unit = review ? unitCohort(review) : null
  const isReviewWeek = candidate.status === 'no-instruction' && candidate.noInstructionReason === 'unit-review'
  const hasCurrentVocabulary = candidate.status === 'valid' && candidate.tier1.length > 0
  const afterUnitReview = Boolean(candidate.normalizedStartDate
    && candidate.normalizedStartDate > KINDERGARTEN_UNIT_ONE_LAB_FIXTURE.reviewEndDate)
  const currentWeekUnavailableReason = isReviewWeek
    ? 'The spreadsheet marks this as Unit 1 review week. Use the Final Boss for the cumulative review and assessment.'
    : 'The spreadsheet does not list a usable Kindergarten vocabulary cohort for this week.'
  const sections: LearningHubSection<KindergartenHubLaunch>[] = [
    section({
      id: 'current-week',
      number: '1',
      kicker: isReviewWeek ? 'Current week · Unit 1 review' : 'Current week',
      title: SHARED_LEARNING_PATH_TITLES.dojo,
      subtitle: isReviewWeek
        ? 'This week is reserved for the cumulative Unit 1 review and assessment.'
        : 'Learn this week’s writing characters and high-frequency reading words.',
      detailTitle: 'Welcome to the Dojo',
      detailSubtitle: 'First learn the writing characters. Then look, listen, and say the reading words aloud.',
      actionLabel: 'Enter the Dojo',
      theme: 'gold',
      cohorts: [week],
      activities: [
        launchActivity('dojo-writing', 'Tier 1 · Writing', 'Writing characters', 'Listen, copy, write, and check each character with supported repetition.', '✍️'),
        launchActivity('dojo-reading', 'Tier 2 · Reading', 'High-frequency words', 'See each word, hear it in Mandarin, and say it aloud.', '🎧'),
      ],
    }, hasCurrentVocabulary, currentWeekUnavailableReason),
    section({
      id: 'ninja-skills',
      number: '2',
      kicker: 'Play and practice',
      title: SHARED_LEARNING_PATH_TITLES.ninjaSkills,
      subtitle: 'Build reading and writing power through three quick games.',
      actionLabel: 'Choose a game',
      theme: 'blue',
      cohorts: [week],
      activities: [
        launchActivity('ninja-listening', 'Listening game', 'Listening Lily Pads', 'Hear a word, then help the ninja land on the matching lily pad.', '🐸'),
        launchActivity('ninja-memory', 'Reading game', 'Memory Lanterns', 'Turn over lanterns and match pairs of the same word.', '🏮'),
        launchActivity('ninja-sky-writing', 'Writing game', 'Sky Writing', 'Hear a character, write it in the air or on paper, then check your work.', '☁️'),
      ],
    }, hasCurrentVocabulary, currentWeekUnavailableReason),
    section({
      id: 'final-boss',
      number: '3',
      kicker: 'Cumulative Unit 1 review',
      title: SHARED_LEARNING_PATH_TITLES.finalBoss,
      subtitle: 'Prepare for your test with every writing character from the unit.',
      actionLabel: 'Face the Final Boss',
      theme: 'violet',
      cohorts: unit ? [unit] : [],
      activities: [
        launchActivity('final-boss', 'Tier 1 · Writing', 'Writing Test', 'Complete the cumulative Unit 1 writing review, then check every answer.', '🐉'),
        launchActivity('final-boss-reading', 'Tier 2 · Reading', 'Reading Test', 'Record and compare every high-frequency reading word from Unit 1.', '🎧'),
      ],
    }, Boolean(unit) && !afterUnitReview, afterUnitReview
      ? 'The Unit 1 review and assessment ended on October 4. Those words now live in the Spirit Realm.'
      : 'The cumulative Unit 1 review is not ready yet.'),
    section({
      id: 'spirit-realm',
      number: '4',
      kicker: 'Mastery review',
      title: SHARED_LEARNING_PATH_TITLES.spiritRealm,
      subtitle: 'Keep older writing and reading words strong with an adaptive warmup.',
      actionLabel: 'Enter the Spirit Realm',
      theme: 'green',
      cohorts: unit ? [unit] : [],
      activities: [
        launchActivity('spirit-realm', 'Tier 1 · Writing mastery', 'Writing mastery warmup', 'Practice six writing mastery words. Words that need help return sooner next time.', '🌙'),
        launchActivity('spirit-realm-reading', 'Tier 2 · Reading mastery', 'Reading mastery', 'Record and compare the high-frequency words that completed Unit 1.', '🎧'),
      ],
    }, Boolean(unit) && afterUnitReview, 'Unit 1 enters mastery after its review week and assessment end on October 4.'),
  ]

  return {
    brandMark: '小',
    brandLabel: 'Weekly Dictation',
    profileLabel: 'Kindergarten',
    eyebrow: 'Kindergarten adventures',
    title: 'Ready for your next',
    titleAccent: 'adventure?',
    introduction: 'Choose one path. Every game helps your Mandarin reading and writing grow.',
    heroTitle: 'Learn. Play.',
    heroAccent: 'Grow stronger.',
    heroDescription: isReviewWeek
      ? 'This is the Unit 1 review week. Face the Final Boss for the cumulative review and assessment.'
      : 'Visit this week’s Dojo, play a Ninja Skills game, prepare for the Final Boss, or revisit mastery words in the Spirit Realm.',
    heroMark: '忍',
    sectionEyebrow: 'Choose your path',
    sectionTitle: 'Where do you want to go?',
    sectionHint: 'One small challenge at a time',
    sections,
  }
}
