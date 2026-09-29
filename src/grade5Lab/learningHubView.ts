import type {
  LearningHubActivity,
  LearningHubSection,
  LearningHubViewModel,
} from '../learningHub/contracts.ts'
import type {
  Grade5ActivityLaunchRequest,
  Grade5HubActivity,
  Grade5HubSection,
  Grade5LearningHubModel,
} from './learningHub.ts'
import { grade5LabWritingRequestIsConnected } from './writingPractice.ts'

export type Grade5HubLaunch = {
  label: string
  requests: Grade5ActivityLaunchRequest[]
}

const visuals: Record<Grade5HubSection['id'], {
  number: string
  kicker: string
  actionLabel: string
  theme: LearningHubSection<Grade5HubLaunch>['theme']
}> = {
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
  const connected = activity.launchRequests.filter(grade5LabWritingRequestIsConnected)
  const icon = activity.book ? '📖' : activity.id.includes('reading') ? '🗣️' : activity.id.includes('writing') ? '✍️' : '🌱'
  const note = connected.length
    ? activity.launchRequests.length > connected.length
      ? 'Tier 1 writing is ready; Tier 2 reading is still being built.'
      : 'Ready to practice in this development lab.'
    : activity.unavailableReason || (activity.availability === 'not-connected' ? 'This learning engine is not connected yet.' : undefined)
  const action: LearningHubActivity<Grade5HubLaunch>['action'] = activity.book
    ? {
        kind: 'link',
        label: 'Open the Book',
        url: activity.book.url,
        accessibleLabel: `${activity.label}: ${activity.book.title} (opens in a new tab)`,
      }
    : connected.length
      ? { kind: 'launch', label: activity.label, launch: { label: activity.label, requests: activity.launchRequests } }
      : { kind: 'disabled', label: activity.availability === 'unavailable' ? 'Not Available Yet' : 'Coming Soon', reason: note || 'This activity is unavailable.' }
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
