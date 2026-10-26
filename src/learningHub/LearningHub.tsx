import { useEffect, useRef, useState } from 'react'
import { regressionPreview } from '../regressionPreview/policy.ts'
import type {
  LearningHubActivity,
  LearningHubLaunchContext,
  LearningHubSection,
  LearningHubViewModel,
  LearningHubWordGroup,
} from './contracts.ts'
import { retiredStandaloneCard, standaloneGamesRetired } from './standaloneGameRetirement.ts'

// Document-local navigation only. Each family frame owns one grade/lesson;
// remembering its menu does not save answers or restart an activity.
const returnSections = new Map<string, string | null>()

export type LearningHubProps<Launch> = {
  model: LearningHubViewModel<Launch>
  onLaunch: (launch: Launch, context: LearningHubLaunchContext) => void | Promise<void>
  showTopbar?: boolean
  hideUnavailable?: boolean
  protectPendingLaunch?: boolean
}

function WordGroup({ group }: { group: LearningHubWordGroup }) {
  return (
    <div className="learning-hub-word-group">
      <p className="learning-hub-word-label">{group.label}</p>
      <div className="learning-hub-word-list">
        {group.words.length ? (
          group.words.map((word, index) => <span key={`${word}-${index}`}>{word}</span>)
        ) : (
          <small>No words listed</small>
        )}
      </div>
    </div>
  )
}

function ActivityCard<Launch>({
  activity,
  pending = false,
  index,
  theme,
  launchContext,
  onLaunch,
}: {
  activity: LearningHubActivity<Launch>
  pending?: boolean
  index: number
  theme: LearningHubSection<Launch>['theme']
  launchContext: LearningHubLaunchContext
  onLaunch: (launch: Launch, context: LearningHubLaunchContext) => void | Promise<void>
}) {
  const action = activity.action
  return (
    <article className={`learning-hub-activity learning-hub-theme-${theme}`}>
      <span className="learning-hub-activity-number">{index + 1}</span>
      <span className="learning-hub-activity-icon" aria-hidden="true">
        {activity.icon}
      </span>
      <p className="learning-hub-eyebrow">{activity.eyebrow}</p>
      <h3>{activity.title}</h3>
      <p>{activity.description}</p>
      {activity.note && <small className="learning-hub-activity-note">{activity.note}</small>}
      {action.kind === 'link' ? (
        <a
          className="learning-hub-action"
          href={action.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={action.accessibleLabel}
        >
          {action.label}
        </a>
      ) : (
        <button
          className="learning-hub-action"
          data-reentry={activity.id === 'boss-reenter' ? 'true' : undefined}
          type="button"
          disabled={pending || action.kind === 'disabled'}
          title={action.kind === 'disabled' ? action.reason : undefined}
          onClick={() => {
            if (action.kind !== 'launch') return
            const root = document.documentElement
            root.dataset.reportSection = launchContext.sectionId
            root.dataset.reportModule = activity.id
            root.dataset.reportActivity = activity.title
            root.dataset.reportPhase = 'activity-launch'
            onLaunch(action.launch, launchContext)
          }}
        >
          {action.label}
        </button>
      )}
    </article>
  )
}

function SectionDetail<Launch>({
  section,
  onBack,
  onLaunch,
  protectPendingLaunch,
}: {
  section: LearningHubSection<Launch>
  onBack: () => void
  protectPendingLaunch: boolean
  onLaunch: (launch: Launch, context: LearningHubLaunchContext) => void | Promise<void>
}) {
  const [launchPending, setLaunchPending] = useState(false)
  const [launchError, setLaunchError] = useState('')
  const launching = useRef(false)
  const launchActivity = (launch: Launch, context: LearningHubLaunchContext) => {
    if (!protectPendingLaunch) return onLaunch(launch, context)
    if (launching.current) return
    launching.current = true
    setLaunchPending(true)
    setLaunchError('')
    // Keep ownership in the menu's React state through the complete async
    // launch, including saved-lesson recovery. Its release commits together
    // with the resulting activity or error UI, never before that transition.
    return (async () => {
      try {
        await onLaunch(launch, context)
      } catch (error) {
        setLaunchError(error instanceof Error ? error.message : 'This activity could not open. Please try again.')
      } finally {
        launching.current = false
        setLaunchPending(false)
      }
    })()
  }
  const defaultCohortId = section.cohorts.some((cohort) => cohort.id === section.defaultCohortId)
    ? section.defaultCohortId!
    : section.cohorts[0]?.id || ''
  const [selectedCohortId, setSelectedCohortId] = useState(defaultCohortId)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const selectedGroup = section.activityGroups?.find((group) => group.id === selectedGroupId)
  const groupedIds = new Set(section.activityGroups?.flatMap((group) => group.activityIds))
  const ungroupedActivities = section.showUngroupedActivities
    ? section.activities.filter((activity) => !groupedIds.has(activity.id))
    : []
  const groupLabel = section.activityGroupLabel || 'Final Boss'
  const visibleActivities = selectedGroup
    ? section.activities.filter((activity) => selectedGroup.activityIds.includes(activity.id))
    : section.activities
  const selectedCohort = section.cohorts.find((cohort) => cohort.id === selectedCohortId) || section.cohorts[0]
  const visibleCohorts = section.cohortPickerLabel && selectedCohort ? [selectedCohort] : section.cohorts
  const launchContext: LearningHubLaunchContext = {
    sectionId: section.id,
    cohortId: section.cohortPickerLabel ? selectedCohort?.id || null : section.cohorts[0]?.id || null,
  }

  useEffect(() => {
    if (selectedCohortId && !section.cohorts.some((cohort) => cohort.id === selectedCohortId)) {
      setSelectedCohortId(defaultCohortId)
    }
  }, [defaultCohortId, section.cohorts, selectedCohortId])

  useEffect(() => {
    setSelectedCohortId(defaultCohortId)
  }, [defaultCohortId])

  return (
    <section
      className={`learning-hub-detail learning-hub-theme-${section.theme}`}
      data-report-activity={`Learning hub: ${section.id}`}
      data-report-section={section.id}
      data-report-phase="activity-menu"
      data-activity-launch-pending={launchPending ? 'true' : undefined}
      aria-busy={launchPending || undefined}
    >
      <button className="learning-hub-back" type="button" onClick={onBack} disabled={launchPending}>
        ← Back to all challenges
      </button>
      {launchError && <p role="alert">{launchError}</p>}
      <header className="learning-hub-detail-heading">
        <div>
          <p className="learning-hub-eyebrow">{section.kicker}</p>
          <h1>{section.detailTitle || section.title}</h1>
          <p>{section.detailSubtitle || section.subtitle}</p>
        </div>
        <span className="learning-hub-section-mark">{section.number}</span>
      </header>

      {section.cohortPickerLabel && section.cohorts.length > 0 && (
        <label className="learning-hub-cohort-picker">
          <span>{section.cohortPickerLabel}</span>
          <select
            disabled={launchPending}
            value={selectedCohort?.id || ''}
            onChange={(event) => setSelectedCohortId(event.target.value)}
          >
            {section.cohorts.map((cohort) => (
              <option key={cohort.id} value={cohort.id}>
                {cohort.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="learning-hub-cohorts">
        {visibleCohorts.length ? (
          visibleCohorts.map((cohort) => (
            <article className="learning-hub-cohort" key={cohort.id}>
              <div className="learning-hub-cohort-heading">
                <div>
                  <p className="learning-hub-eyebrow">{cohort.label}</p>
                  <h2>Words in this challenge</h2>
                </div>
                <span>{cohort.countLabel}</span>
              </div>
              <div className="learning-hub-word-groups">
                {cohort.groups.map((group) => (
                  <WordGroup key={group.label} group={group} />
                ))}
              </div>
              <details className="learning-hub-source-details">
                <summary>Source details</summary>
                <p>Cohort: {cohort.id}</p>
                {cohort.preservedGroups?.map((group) => (
                  <WordGroup key={group.label} group={group} />
                ))}
              </details>
            </article>
          ))
        ) : (
          <p className="learning-hub-unavailable">{section.unavailableReason || 'No cohort is available.'}</p>
        )}
      </div>

      <div className="learning-hub-activity-heading">
        {selectedGroup && (
          <button
            className="learning-hub-back"
            type="button"
            onClick={() => setSelectedGroupId(null)}
            disabled={launchPending}
          >
            ← Back to {groupLabel}
          </button>
        )}
        <p className="learning-hub-eyebrow">Choose an activity</p>
        <h2>{selectedGroup?.title || 'How do you want to train?'}</h2>
      </div>
      {section.activityGroups && !selectedGroup ? (
        <div className="learning-hub-activity-grid learning-hub-group-grid">
          {ungroupedActivities.map((activity, index) => (
            <ActivityCard
              key={activity.id}
              activity={activity}
              index={index}
              theme={section.theme}
              launchContext={launchContext}
              pending={launchPending}
              onLaunch={launchActivity}
            />
          ))}
          {section.activityGroups.map((group, index) => (
            <ActivityCard
              key={group.id}
              activity={{
                id: group.id,
                title: group.title,
                description: group.description,
                icon: group.icon,
                eyebrow: groupLabel,
                action: { kind: 'launch', label: group.title, launch: group.id },
              }}
              index={ungroupedActivities.length + index}
              theme={section.theme}
              launchContext={launchContext}
              pending={launchPending}
              onLaunch={setSelectedGroupId}
            />
          ))}
        </div>
      ) : (
        <div className="learning-hub-activity-grid">
          {visibleActivities.map((activity, index) => (
            <ActivityCard
              key={activity.id}
              activity={activity}
              index={index}
              theme={section.theme}
              launchContext={launchContext}
              pending={launchPending}
              onLaunch={launchActivity}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export function LearningHub<Launch>({
  model: originalModel,
  onLaunch,
  hideUnavailable = false,
  protectPendingLaunch = false,
}: LearningHubProps<Launch>) {
  const availableModel = hideUnavailable
    ? {
        ...originalModel,
        sections: originalModel.sections
          .map((section) => ({
            ...section,
            activities: section.activities.filter((activity) => activity.action.kind !== 'disabled'),
          }))
          .filter((section) => section.activities.length > 0),
      }
    : originalModel
  const model = standaloneGamesRetired
    ? {
        ...availableModel,
        sections: availableModel.sections.map((section) => ({
          ...section,
          activities: section.activities.filter((activity) => !retiredStandaloneCard(activity.id)),
        })),
      }
    : availableModel
  const [selectedSectionId, setSection] = useState<string | null>(() =>
    regressionPreview ? returnSections.get(model.profileLabel) || null : null,
  )
  const setSelectedSectionId = (id: string | null) => {
    if (regressionPreview) returnSections.set(model.profileLabel, id)
    setSection(id)
  }
  const selected = model.sections.find((section) => section.id === selectedSectionId)

  useEffect(() => {
    const root = document.documentElement
    for (const key of ['activity', 'module', 'phase']) root.removeAttribute(`data-report-${key}`)
    if (selectedSectionId) root.setAttribute('data-report-section', selectedSectionId)
    else root.removeAttribute('data-report-section')
  }, [selectedSectionId])

  useEffect(() => {
    if (selectedSectionId && !model.sections.some((section) => section.id === selectedSectionId)) {
      setSelectedSectionId(null)
    }
  }, [model.sections, selectedSectionId])

  if (selected) {
    return (
      <SectionDetail
        section={selected}
        onBack={() => setSelectedSectionId(null)}
        onLaunch={onLaunch}
        protectPendingLaunch={protectPendingLaunch}
      />
    )
  }

  return (
    <>
      <header className="learning-hub-topbar">
        <span className="learning-hub-profile" role="heading" aria-level={1}>
          {model.profileLabel}
        </span>
      </header>
      <section
        className="learning-hub-section-grid"
        aria-label={`${model.profileLabel} activities`}
        data-report-activity="Learning hub"
      >
        {model.sections.map((section) => (
          <button
            className={`learning-hub-section-card learning-hub-theme-${section.theme}`}
            type="button"
            key={section.id}
            disabled={!section.available}
            title={!section.available ? section.unavailableReason : undefined}
            onClick={() => setSelectedSectionId(section.id)}
          >
            <span className="learning-hub-section-number">{section.number}</span>
            <span className="learning-hub-eyebrow">{section.kicker}</span>
            <strong>{section.title}</strong>
            <span>{section.subtitle}</span>
            <small>
              {section.cohortSummaryLabel ||
                section.cohorts[0]?.label ||
                section.unavailableReason ||
                'Waiting for this challenge'}
            </small>
            <b>{section.available ? `${section.actionLabel} →` : 'Not available yet'}</b>
          </button>
        ))}
      </section>
    </>
  )
}
