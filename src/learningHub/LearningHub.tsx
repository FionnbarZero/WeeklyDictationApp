import { useEffect, useState } from 'react'
import type {
  LearningHubActivity,
  LearningHubSection,
  LearningHubViewModel,
  LearningHubWordGroup,
} from './contracts.ts'

export type LearningHubProps<Launch> = {
  model: LearningHubViewModel<Launch>
  onLaunch: (launch: Launch) => void
  showTopbar?: boolean
  initialSelectedSectionId?: string | null
}

function WordGroup({ group }: { group: LearningHubWordGroup }) {
  return <div className="learning-hub-word-group">
    <p className="learning-hub-word-label">{group.label}</p>
    <div className="learning-hub-word-list">
      {group.words.length
        ? group.words.map((word, index) => <span key={`${word}-${index}`}>{word}</span>)
        : <small>No words listed</small>}
    </div>
  </div>
}

function ActivityCard<Launch>({
  activity,
  index,
  theme,
  onLaunch,
}: {
  activity: LearningHubActivity<Launch>
  index: number
  theme: LearningHubSection<Launch>['theme']
  onLaunch: (launch: Launch) => void
}) {
  const action = activity.action
  return <article className={`learning-hub-activity learning-hub-theme-${theme}`}>
    <span className="learning-hub-activity-number">{index + 1}</span>
    <span className="learning-hub-activity-icon" aria-hidden="true">{activity.icon}</span>
    <p className="learning-hub-eyebrow">{activity.eyebrow}</p>
    <h3>{activity.title}</h3>
    <p>{activity.description}</p>
    {activity.note && <small className="learning-hub-activity-note">{activity.note}</small>}
    {action.kind === 'link'
      ? <a className="learning-hub-action" href={action.url} target="_blank" rel="noopener noreferrer" aria-label={action.accessibleLabel}>{action.label}</a>
      : <button
          className="learning-hub-action"
          type="button"
          disabled={action.kind === 'disabled'}
          title={action.kind === 'disabled' ? action.reason : undefined}
          onClick={() => action.kind === 'launch' && onLaunch(action.launch)}
        >{action.label}</button>}
  </article>
}

function SectionDetail<Launch>({
  section,
  onBack,
  onLaunch,
}: {
  section: LearningHubSection<Launch>
  onBack: () => void
  onLaunch: (launch: Launch) => void
}) {
  return <section className={`learning-hub-detail learning-hub-theme-${section.theme}`}>
    <button className="learning-hub-back" type="button" onClick={onBack}>← Back to all challenges</button>
    <header className="learning-hub-detail-heading">
      <div>
        <p className="learning-hub-eyebrow">{section.kicker}</p>
        <h1>{section.detailTitle || section.title}</h1>
        <p>{section.detailSubtitle || section.subtitle}</p>
      </div>
      <span className="learning-hub-section-mark">{section.number}</span>
    </header>

    <div className="learning-hub-cohorts">
      {section.cohorts.length ? section.cohorts.map((cohort) => <article className="learning-hub-cohort" key={cohort.id}>
        <div className="learning-hub-cohort-heading">
          <div><p className="learning-hub-eyebrow">{cohort.label}</p><h2>Words in this challenge</h2></div>
          <span>{cohort.countLabel}</span>
        </div>
        <div className="learning-hub-word-groups">{cohort.groups.map((group) => <WordGroup key={group.label} group={group} />)}</div>
        <details className="learning-hub-source-details">
          <summary>Source details</summary>
          <p>Cohort: {cohort.id}</p>
          {cohort.preservedGroups?.map((group) => <WordGroup key={group.label} group={group} />)}
        </details>
      </article>) : <p className="learning-hub-unavailable">{section.unavailableReason || 'No cohort is available.'}</p>}
    </div>

    <div className="learning-hub-activity-heading">
      <p className="learning-hub-eyebrow">Choose an activity</p>
      <h2>How do you want to train?</h2>
    </div>
    <div className="learning-hub-activity-grid">
      {section.activities.map((activity, index) =>
        <ActivityCard key={activity.id} activity={activity} index={index} theme={section.theme} onLaunch={onLaunch} />)}
    </div>
  </section>
}

export function LearningHub<Launch>({
  model,
  onLaunch,
  showTopbar = true,
  initialSelectedSectionId = null,
}: LearningHubProps<Launch>) {
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(initialSelectedSectionId)
  const selected = model.sections.find((section) => section.id === selectedSectionId)

  useEffect(() => {
    if (selectedSectionId && !model.sections.some((section) => section.id === selectedSectionId)) {
      setSelectedSectionId(null)
    }
  }, [model.sections, selectedSectionId])

  if (selected) {
    return <SectionDetail section={selected} onBack={() => setSelectedSectionId(null)} onLaunch={onLaunch} />
  }

  return <>
    {showTopbar && <header className="learning-hub-topbar">
      <div className="learning-hub-brand"><span>{model.brandMark}</span>{model.brandLabel}</div>
      <span className="learning-hub-profile">{model.profileLabel}</span>
    </header>}
    <section className="learning-hub-welcome">
      <div>
        <p className="learning-hub-eyebrow">{model.eyebrow}</p>
        <h1>{model.title}<br /><em>{model.titleAccent}</em></h1>
        <p>{model.introduction}</p>
      </div>
      <div className="learning-hub-seal" aria-hidden="true">{model.heroMark}</div>
    </section>
    <section className="learning-hub-hero">
      <div>
        <p className="learning-hub-eyebrow">Your learning path</p>
        <h2>{model.heroTitle}<br /><span>{model.heroAccent}</span></h2>
        <p>{model.heroDescription}</p>
      </div>
      <div className="learning-hub-hero-mark" aria-hidden="true">{model.heroMark}</div>
    </section>
    <header className="learning-hub-section-heading">
      <div><p className="learning-hub-eyebrow">{model.sectionEyebrow}</p><h2>{model.sectionTitle}</h2></div>
      <span>{model.sectionHint}</span>
    </header>
    <section className="learning-hub-section-grid">
      {model.sections.map((section) => <button
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
        <small>{section.cohorts[0]?.label || section.unavailableReason || 'Waiting for this challenge'}</small>
        <b>{section.available ? `${section.actionLabel} →` : 'Not available yet'}</b>
      </button>)}
    </section>
  </>
}
