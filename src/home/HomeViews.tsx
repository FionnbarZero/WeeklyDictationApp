import { ArrowLeft, Check, ChevronDown, Clock3 } from 'lucide-react'
import { lazy, Suspense, type ReactNode } from 'react'
import {
  latestScore,
  localDateKey,
  requireDatasetLifecycle,
  resolveDatasetLifecycles,
  sortDatasetsNewestFirst,
  type Dataset,
  type DatasetLifecycle,
  type DatasetScore,
  type LifecyclePhase,
  type PracticeTarget,
} from '../domain.ts'
import { grade2LearningHubView, type Grade2LearningHubLaunch } from '../grade2/learningHub.ts'
import type { LearningHubProps } from '../learningHub/LearningHub.tsx'
import { familyPreview } from '../familyBeta/runtime.ts'
import type { WritingPracticeProfile } from '../practice/profiles/model.ts'
import type { ProfileChild } from '../profiles/ProfileModal.tsx'
import type { Tier2ReadingLifecycle, Tier2ReadingPathway } from '../tier2/contracts.ts'
import { tier2ReadingPathwayTargets } from '../tier2/pathway.ts'

// Keep each import in its own lazy callback so the built preview preloads the
// correct CSS dependency set as well as JavaScript for the selected branch.
const LearningHub = familyPreview
  ? lazy(() => import('../familyBeta/PreviewLearningHub.tsx').then(module => ({ default: module.PreviewLearningHub<Grade2LearningHubLaunch> })))
  : lazy(() => import('../learningHub/LearningHub.tsx').then(module => ({ default: module.LearningHub<Grade2LearningHubLaunch> })))

function lifecycleLabel(lifecycle: DatasetLifecycle) {
  return lifecycle === 'acquisition'
    ? 'Acquisition'
    : lifecycle === 'test-review'
      ? 'Test Review'
      : lifecycle === 'future'
        ? 'Future'
        : lifecycle === 'no-instruction'
          ? 'Writing Workshop'
          : 'Mastered'
}

function phaseLabel(phase: LifecyclePhase) {
  return phase === 'test-review' ? 'Test Review' : phase === 'warmup' ? 'Warmup' : 'Acquisition'
}

function readingPathwayLabel(pathway: Tier2ReadingPathway) {
  if (pathway.kind === 'acquisition') return 'Learn to Read'
  if (pathway.kind === 'mastery') return 'Reading Mastery'
  return pathway.cycle && pathway.cycle > 1 ? `Reading Test Review ${pathway.cycle}` : 'Reading Test Review'
}

export function HomeView({
  child,
  profile,
  datasets,
  scores,
  acquisitionTarget,
  testReviewTarget,
  readingLifecycle,
  warmupWords,
  completedSummary,
  currentDate,
  lifecycleResolution,
  onStart,
  onStartStrokeOrder,
  onStartWarmup,
  onStartReading,
  onHistory,
  onProfiles,
}: {
  child: ProfileChild
  profile: WritingPracticeProfile
  datasets: Dataset[]
  scores: DatasetScore[]
  acquisitionTarget: PracticeTarget | null
  testReviewTarget: PracticeTarget | null
  readingLifecycle: Tier2ReadingLifecycle | null
  warmupWords: number
  completedSummary: string | null
  currentDate: Date
  lifecycleResolution: ReturnType<typeof resolveDatasetLifecycles>
  onStart: (target: PracticeTarget) => void
  onStartStrokeOrder: (target: PracticeTarget) => void
  onStartWarmup: () => void
  onStartReading: (pathway: Tier2ReadingPathway) => void
  onHistory: () => void
  onProfiles: () => void
}) {
  const today = scores.filter(
    (score) => score.childId === child.id && score.sessionDate === localDateKey(currentDate),
  ).length
  const displayDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(
    currentDate,
  )
  const orderedDatasets = sortDatasetsNewestFirst(datasets)
  const presentation = profile.presentation
  const warmupOptional = profile.preActivityWarmupRequirement === 'optional'
  if (child.grade === 'Grade 2') {
    const model = grade2LearningHubView({
      childName: child.name,
      datasets,
      masteredDatasets: lifecycleResolution.mastered,
      acquisitionTarget,
      testReviewTarget,
      readingLifecycle,
      warmupWordCount: warmupWords,
    })
    const launch = (request: Grade2LearningHubLaunch) => {
      if (request.kind === 'writing') onStart(request.target)
      else if (request.kind === 'stroke-order') onStartStrokeOrder(request.target)
      else if (request.kind === 'reading') onStartReading(request.pathway)
      else onStartWarmup()
    }
    return (
      <div className="page grade2-learning-hub">
        {completedSummary && <CompletionBanner summary={completedSummary} onHistory={onHistory} />}
        <Suspense
          fallback={
            <div className="loading-surface" role="status">
              Loading learning activities…
            </div>
          }
        >
          <LearningHub model={model} onLaunch={launch} showTopbar={false} hideUnavailable={familyPreview} />
        </Suspense>
        <DatasetRecord
          datasets={orderedDatasets}
          scores={scores}
          child={child}
          lifecycleResolution={lifecycleResolution}
          onHistory={onHistory}
          grade2
        />
        <TodayStrip count={today} grade2 />
      </div>
    )
  }
  return (
    <div className="page home-page">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">{presentation?.homeEyebrow || displayDate}</p>
          <h1>
            {presentation?.homeHeading || 'Ready when you are'}, <em>{child.name}.</em>
          </h1>
          <p className="subhead">
            {presentation?.homeDescription ||
              `Choose your activity. Warmup is offered first and ${warmupOptional ? 'may be skipped' : 'is required'}.`}
          </p>
        </div>
        <ProfileButton child={child} onProfiles={onProfiles} />
      </section>
      {completedSummary && <CompletionBanner summary={completedSummary} onHistory={onHistory} />}
      <section className="practice-lane-grid" aria-label="Available practice activities">
        <article className="practice-lane lane-warmup">
          <div className="status-pill">
            <span className="status-dot" /> Independently available
          </div>
          <h2>Adaptive Warmup</h2>
          <p>
            {warmupWords > 0
              ? `${warmupWords} unique mastery target${warmupWords === 1 ? '' : 's'} selected. ${warmupOptional ? 'A pre-activity Warmup may also be skipped.' : 'Pre-activity Warmup is required.'}`
              : 'No prior mastery targets are available yet.'}
          </p>
          {warmupWords > 0 && (
            <button className="primary-button" onClick={onStartWarmup}>
              Start mastery Warmup <ArrowLeft size={17} />
            </button>
          )}
        </article>
        {acquisitionTarget && <PracticeLaneCard target={acquisitionTarget} profile={profile} onStart={onStart} />}
        {testReviewTarget && (
          <PracticeLaneCard
            target={testReviewTarget}
            profile={profile}
            onStart={onStart}
            resumeAcquisitionTarget={acquisitionTarget}
          />
        )}
      </section>
      {readingLifecycle && <Tier2ReadingPathways lifecycle={readingLifecycle} onStart={onStartReading} />}
      <DatasetRecord
        datasets={orderedDatasets}
        scores={scores}
        child={child}
        lifecycleResolution={lifecycleResolution}
        onHistory={onHistory}
      />
      <TodayStrip count={today} />
    </div>
  )
}

function CompletionBanner({ summary, onHistory }: { summary: string; onHistory: () => void }) {
  return (
    <div className="success-banner">
      <span className="success-icon">
        <Check size={17} />
      </span>
      <span>
        <strong>Practice complete.</strong> {summary}
      </span>
      <button onClick={onHistory}>
        See progress <ArrowLeft size={14} />
      </button>
    </div>
  )
}

function ProfileButton({ child, onProfiles }: { child: ProfileChild; onProfiles: () => void }) {
  return (
    <button className="mini-profile" onClick={onProfiles}>
      <span className={`avatar avatar-${child.color}`}>{child.initials}</span>
      <span>{child.grade}</span>
      <ChevronDown size={15} />
    </button>
  )
}

function DatasetRecord({
  datasets,
  scores,
  child,
  lifecycleResolution,
  onHistory,
  grade2 = false,
}: {
  datasets: Dataset[]
  scores: DatasetScore[]
  child: ProfileChild
  lifecycleResolution: ReturnType<typeof resolveDatasetLifecycles>
  onHistory: () => void
  grade2?: boolean
}) {
  return (
    <>
      <section className={`section-heading${grade2 ? ' grade2-record-heading' : ''}`}>
        <div>
          <p className="eyebrow">{grade2 ? 'Ninja Record' : 'Weekly datasets'}</p>
          <h2>Every week stays on record</h2>
        </div>
        <button className="text-button" onClick={onHistory}>
          View progress <ArrowLeft size={15} />
        </button>
      </section>
      <div className="set-grid">
        {datasets.map((dataset, index) => (
          <SetCard
            key={dataset.id}
            dataset={dataset}
            lifecycle={requireDatasetLifecycle(lifecycleResolution, dataset.id)}
            score={latestScore(scores, child.id, dataset.id)}
            tone={index % 2 === 0 ? 'yellow' : 'lavender'}
          />
        ))}
      </div>
    </>
  )
}

function TodayStrip({ count, grade2 = false }: { count: number; grade2?: boolean }) {
  return (
    <section className="today-strip">
      <div className="strip-icon">
        <Clock3 size={18} />
      </div>
      <div>
        <strong>
          {count
            ? `${count} dataset score${count === 1 ? '' : 's'} recorded today`
            : 'No dataset scores recorded today'}
        </strong>
        <span>
          Acquisition scores appear when “Done for today” is selected; {grade2 ? 'Final Boss' : 'Test Review'} scores
          require the complete {grade2 ? 'Test Review' : 'review'}.
        </span>
      </div>
      <div className="strip-arrow">→</div>
    </section>
  )
}

function PracticeLaneCard({
  target,
  profile,
  onStart,
  resumeAcquisitionTarget,
}: {
  target: PracticeTarget
  profile: WritingPracticeProfile
  onStart: (target: PracticeTarget) => void
  resumeAcquisitionTarget?: PracticeTarget | null
}) {
  const groupedDatasets = target.reviewDatasets || [target.dataset]
  const wordCount = groupedDatasets.reduce((total, dataset) => total + dataset.words.length, 0)
  const label =
    target.phase === 'acquisition'
      ? profile.presentation?.acquisitionLabel || phaseLabel(target.phase)
      : profile.presentation?.testReviewLabel || phaseLabel(target.phase)
  const startLabel =
    target.phase === 'acquisition'
      ? profile.presentation?.acquisitionAction || 'Start Acquisition'
      : profile.presentation?.testReviewAction || 'Start Test Review'
  const detail = target.reviewDatasets
    ? `${groupedDatasets.length} teaching weeks · ${wordCount} writing target${wordCount === 1 ? '' : 's'}`
    : `${target.dataset.dateRange} · ${wordCount} word${wordCount === 1 ? '' : 's'}`
  return (
    <article className={`practice-lane lane-${target.phase}`}>
      <div className="status-pill">
        <span className="status-dot" /> {label}
      </div>
      <h2>{label}</h2>
      <p>{detail} · Warmup offered first</p>
      <button
        className="primary-button"
        aria-label={`${startLabel} for ${target.dataset.dateRange}`}
        onClick={() => onStart(target)}
      >
        {startLabel} <ArrowLeft size={17} />
      </button>
      {resumeAcquisitionTarget && (
        <button className="replay-button" onClick={() => onStart(resumeAcquisitionTarget)}>
          Return to {profile.presentation?.acquisitionLabel?.toLowerCase() || 'acquisition'}
        </button>
      )}
    </article>
  )
}

function Tier2ReadingPathways({
  lifecycle,
  onStart,
}: {
  lifecycle: Tier2ReadingLifecycle
  onStart: (pathway: Tier2ReadingPathway) => void
}) {
  const pathways = [
    ...(lifecycle.acquisition ? [lifecycle.acquisition] : []),
    ...lifecycle.testReviews,
    lifecycle.mastery,
  ].filter((pathway) => pathway.available && tier2ReadingPathwayTargets(pathway).length > 0)
  if (pathways.length === 0) return null
  return (
    <section className="tier2-teaching-card tier2-lifecycle-card" aria-label="Tier 2 reading pathways">
      <div className="tier2-copy">
        <p className="eyebrow">Tier 2 reading</p>
        <h2>Look, listen, record, and compare</h2>
        <p>
          Reading follows the same curriculum stages as writing while keeping its own targets and session-only results.
        </p>
      </div>
      <div className="tier2-pathway-list">
        {pathways.map((pathway) => {
          const targets = tier2ReadingPathwayTargets(pathway)
          const id = `${pathway.kind}-${pathway.cycle || 0}-${pathway.cohorts.map((cohort) => cohort.datasetId).join('-')}`
          return (
            <button className="tier2-pathway-button" type="button" key={id} onClick={() => onStart(pathway)}>
              <span>{readingPathwayLabel(pathway)}</span>
              <strong>
                {targets.length} target{targets.length === 1 ? '' : 's'}
              </strong>
              <small>{targets.map((target) => target.text).join('、')}</small>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function UnsupportedPracticeView({
  child,
  datasets,
  onHistory,
  onProfiles,
}: {
  child: ProfileChild
  datasets: Dataset[]
  onHistory: () => void
  onProfiles: () => void
}) {
  return (
    <div className="page home-page">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">Setup in progress</p>
          <h1>
            Hi, <em>{child.name}.</em>
          </h1>
          <p className="subhead">
            Practice for {child.grade} is not configured yet. Existing datasets and history remain available.
          </p>
        </div>
        <ProfileButton child={child} onProfiles={onProfiles} />
      </section>
      <EmptyHero
        status="Practice unavailable"
        heading={
          <>
            Your history
            <br />
            <span>is preserved</span>
          </>
        }
        detail={`${datasets.length} weekly dataset${datasets.length === 1 ? '' : 's'} remain on record.`}
        action="View progress"
        onAction={onHistory}
      />
    </div>
  )
}

export function NoDatasetView({
  child,
  datasets,
  warmupWords,
  localMode,
  onStartWarmup,
  onHistory,
  onProfiles,
}: {
  child: ProfileChild
  datasets: Dataset[]
  warmupWords: number
  localMode: boolean
  onStartWarmup: () => void
  onHistory: () => void
  onProfiles: () => void
}) {
  const setupMessage = localMode
    ? 'Teacher vocabulary loads automatically. If an update fails, use Try again above. No testing vocabulary is substituted.'
    : 'There is no active weekly dataset scheduled right now.'
  const status = warmupWords > 0 ? 'Mastery Warmup' : localMode ? 'Setup required' : 'No active dataset'
  const heading =
    warmupWords > 0 ? (
      <>
        Keep your
        <br />
        <span>mastery growing</span>
      </>
    ) : localMode ? (
      <>
        Load your
        <br />
        <span>weekly deck</span>
      </>
    ) : (
      <>
        Your next
        <br />
        <span>practice set</span>
      </>
    )
  const detail =
    warmupWords > 0
      ? `${warmupWords} mastery target${warmupWords === 1 ? '' : 's'} available`
      : localMode
        ? 'Waiting for validated teacher vocabulary. No placeholder or sample vocabulary is used.'
        : `${datasets.length} weekly dataset${datasets.length === 1 ? '' : 's'} remain on record.`
  return (
    <div className="page home-page">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">Ready when you are</p>
          <h1>
            Hi, <em>{child.name}.</em>
          </h1>
          <p className="subhead">
            {warmupWords > 0
              ? 'The current week has no primary word set. Your mastery warmup is still available.'
              : setupMessage}
          </p>
        </div>
        <ProfileButton child={child} onProfiles={onProfiles} />
      </section>
      <EmptyHero
        status={status}
        heading={heading}
        detail={detail}
        action={warmupWords > 0 ? 'Start mastery warmup' : 'View progress'}
        onAction={warmupWords > 0 ? onStartWarmup : onHistory}
      />
    </div>
  )
}

function EmptyHero({
  status,
  heading,
  detail,
  action,
  onAction,
}: {
  status: string
  heading: ReactNode
  detail: string
  action: string
  onAction: () => void
}) {
  return (
    <section className="hero-card">
      <div className="hero-copy">
        <div className="status-pill">
          <span className="status-dot" /> {status}
        </div>
        <h2>{heading}</h2>
        <p>{detail}</p>
        <button className="primary-button" onClick={onAction}>
          {action} <ArrowLeft size={17} />
        </button>
      </div>
      <div className="hero-illustration" aria-hidden="true">
        <div className="sun-shape" />
        <div className="paper-shape">
          <span>字</span>
          <span>词</span>
          <span>好</span>
        </div>
        <div className="pencil-shape" />
        <div className="sparkle sparkle-one">✦</div>
        <div className="sparkle sparkle-two">✦</div>
      </div>
    </section>
  )
}

function SetCard({
  dataset,
  lifecycle,
  score,
  tone,
}: {
  dataset: Dataset
  lifecycle: DatasetLifecycle
  score: DatasetScore | null
  tone: 'yellow' | 'lavender'
}) {
  return (
    <article className={`set-card set-${tone}`}>
      <div className="set-card-top">
        <span className="set-label">{lifecycleLabel(lifecycle)}</span>
        <span className="score-badge">{score ? `${score.percent}% · ${phaseLabel(score.phase)}` : 'Not scored'}</span>
      </div>
      <h3>{dataset.dateRange}</h3>
      <p className="set-date">
        {dataset.description} · {dataset.words.length} words
      </p>
      <div className="set-footer">
        <span>{dataset.grade}</span>
        <div
          className="tiny-progress"
          role="progressbar"
          aria-label={`${dataset.dateRange} score`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={score?.percent || 0}
        >
          <span style={{ width: `${score?.percent || 0}%` }} />
        </div>
      </div>
    </article>
  )
}
