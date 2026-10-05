import type { LearningHubActivity, LearningHubSection, LearningHubViewModel } from '../learningHub/contracts.ts'
import type {
  Grade5ActivityLaunchRequest,
  Grade5HubActivity,
  Grade5HubSection,
  Grade5LearningHubModel,
} from './learningHub.ts'
import { grade5LabWritingRequestIsConnected } from './writingPractice.ts'
import { grade5LabReadingRequestIsConnected } from './readingPractice.ts'
import type { LearningModulePack } from '../ninjaSkills/contracts.ts'

export type Grade5HubLaunch =
  | { kind: 'activity'; label: string; requests: Grade5ActivityLaunchRequest[] }
  | { kind: 'learning-module'; label: string; pack: LearningModulePack }

const visuals: Record<
  Grade5HubSection['id'],
  {
    number: string
    kicker: string
    actionLabel: string
    theme: LearningHubSection<Grade5HubLaunch>['theme']
  }
> = {
  homework: { number: '1', kicker: 'This week', actionLabel: 'Enter the Dojo', theme: 'gold' },
  'test-review-1': { number: '2', kicker: 'Test practice 1', actionLabel: 'Practice my skills', theme: 'blue' },
  'test-review-2': { number: '3', kicker: 'Test practice 2', actionLabel: 'Face the Final Boss', theme: 'violet' },
  review: { number: '4', kicker: 'Older words', actionLabel: 'Enter the Spirit Realm', theme: 'green' },
}

function eyebrow(activity: Grade5HubActivity) {
  if (activity.book) return 'Read together'
  if (activity.id.includes('reading')) return 'Tier 2 · Reading'
  if (activity.id.includes('writing')) return 'Tier 1 · Writing'
  if (activity.id.includes('reenter')) return 'Need more help?'
  if (activity.id.includes('reteach')) return 'Future training'
  return 'Mastery practice'
}

function activityView(activity: Grade5HubActivity): LearningHubActivity<Grade5HubLaunch> {
  const connected = activity.launchRequests.filter(
    (request) => grade5LabWritingRequestIsConnected(request) || grade5LabReadingRequestIsConnected(request),
  )
  const icon = activity.book
    ? '📖'
    : activity.id.includes('reading')
      ? '🗣️'
      : activity.id.includes('writing')
        ? '✍️'
        : '🌱'
  const note = connected.length
    ? activity.launchRequests.length > connected.length
      ? 'The connected writing or reading pathway is ready; future re-teaching remains separate.'
      : 'Ready to practice in this development lab.'
    : activity.unavailableReason ||
      (activity.availability === 'not-connected' ? 'This learning engine is not connected yet.' : undefined)
  const action: LearningHubActivity<Grade5HubLaunch>['action'] = activity.book
    ? {
        kind: 'link',
        label: 'Open the Book',
        url: activity.book.url,
        accessibleLabel: `${activity.label}: ${activity.book.title} (opens in a new tab)`,
      }
    : activity.learningModule
      ? {
          kind: 'launch',
          label: `Start ${activity.label}`,
          launch: { kind: 'learning-module', label: activity.label, pack: activity.learningModule },
        }
      : connected.length
        ? {
            kind: 'launch',
            label: activity.label,
            launch: { kind: 'activity', label: activity.label, requests: activity.launchRequests },
          }
        : {
            kind: 'disabled',
            label: activity.availability === 'unavailable' ? 'Not Available Yet' : 'Coming Soon',
            reason: note || 'This activity is unavailable.',
          }
  return {
    id: activity.id,
    eyebrow: eyebrow(activity),
    title: activity.label,
    description: activity.description,
    icon,
    note,
    action,
  }
}

function sectionView(section: Grade5HubSection): LearningHubSection<Grade5HubLaunch> {
  const visual = visuals[section.id]
  return {
    id: section.id,
    ...visual,
    title: section.title,
    subtitle: section.subtitle,
    available: section.available,
    ...(section.unavailableReason ? { unavailableReason: section.unavailableReason } : {}),
    cohorts: section.cohorts.map((cohort) => ({
      id: cohort.cohortId,
      label: cohort.dateRangeLabel,
      countLabel: `${cohort.tier1Words.length} writing · ${cohort.tier2Words.length} reading`,
      groups: [
        { label: 'Tier 1 · Writing', words: cohort.tier1Words },
        { label: 'Tier 2 · Reading', words: cohort.tier2Words },
      ],
      preservedGroups: cohort.tier3Words.length ? [{ label: 'Tier 3 · Preserved', words: cohort.tier3Words }] : [],
    })),
    activities: section.activities.map(activityView),
  }
}

export function grade5LearningHubView(model: Grade5LearningHubModel): LearningHubViewModel<Grade5HubLaunch> {
  return {
    brandMark: '五',
    brandLabel: 'Weekly Dictation',
    profileLabel: 'Grade 5',
    eyebrow: 'Grade 5 training',
    title: 'Ready for your next',
    titleAccent: 'challenge?',
    introduction: 'Choose one path. Your writing and reading words will stay with the right week.',
    heroTitle: 'Train. Practice.',
    heroAccent: 'Grow stronger.',
    heroDescription: 'Start with this week’s Dojo, prepare for either test, or strengthen words you already know.',
    heroMark: '字',
    sectionEyebrow: 'Choose your path',
    sectionTitle: 'Where do you want to go?',
    sectionHint: 'One challenge at a time',
    sections: model.sections.map(sectionView),
  }
}
