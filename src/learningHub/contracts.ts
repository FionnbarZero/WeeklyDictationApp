export type LearningHubTheme = 'gold' | 'blue' | 'violet' | 'green'

export type LearningHubWordGroup = {
  label: string
  words: string[]
}

export type LearningHubCohort = {
  id: string
  label: string
  countLabel: string
  groups: LearningHubWordGroup[]
  preservedGroups?: LearningHubWordGroup[]
}

export type LearningHubAction<Launch> =
  | { kind: 'launch'; label: string; launch: Launch }
  | { kind: 'link'; label: string; url: string; accessibleLabel: string }
  | { kind: 'disabled'; label: string; reason: string }

export type LearningHubActivity<Launch> = {
  id: string
  eyebrow: string
  title: string
  description: string
  icon: string
  note?: string
  action: LearningHubAction<Launch>
}

export type LearningHubSection<Launch> = {
  id: string
  number: string
  kicker: string
  title: string
  subtitle: string
  detailTitle?: string
  detailSubtitle?: string
  actionLabel: string
  theme: LearningHubTheme
  available: boolean
  unavailableReason?: string
  cohortPickerLabel?: string
  cohortSummaryLabel?: string
  cohorts: LearningHubCohort[]
  activities: LearningHubActivity<Launch>[]
}

export type LearningHubLaunchContext = {
  sectionId: string
  cohortId: string | null
}

export type LearningHubViewModel<Launch> = {
  brandMark: string
  brandLabel: string
  profileLabel: string
  eyebrow: string
  title: string
  titleAccent: string
  introduction: string
  heroTitle: string
  heroAccent: string
  heroDescription: string
  heroMark: string
  sectionEyebrow: string
  sectionTitle: string
  sectionHint: string
  sections: LearningHubSection<Launch>[]
}
