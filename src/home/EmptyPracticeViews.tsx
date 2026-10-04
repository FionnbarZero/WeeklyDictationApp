import { ArrowLeft, ChevronDown } from 'lucide-react'
import type { Dataset } from '../domain.ts'
import type { ChildProfile } from '../persistence/cloudRecords.ts'

type EmptyPracticeChild = ChildProfile & { name: string; color: string; initials: string }

export function UnsupportedPracticeView({
  child,
  datasets,
  onHistory,
  onProfiles,
}: {
  child: EmptyPracticeChild
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
        <button className="mini-profile" onClick={onProfiles}>
          <span className={`avatar avatar-${child.color}`}>{child.initials}</span>
          <span>{child.grade}</span>
          <ChevronDown size={15} />
        </button>
      </section>
      <section className="hero-card">
        <div className="hero-copy">
          <div className="status-pill">
            <span className="status-dot" /> Practice unavailable
          </div>
          <h2>
            Your history
            <br />
            <span>is preserved</span>
          </h2>
          <p>
            {datasets.length} weekly dataset{datasets.length === 1 ? '' : 's'} remain on record.
          </p>
          <button className="primary-button" onClick={onHistory}>
            View progress <ArrowLeft size={17} />
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
  child: EmptyPracticeChild
  datasets: Dataset[]
  warmupWords: number
  localMode: boolean
  onStartWarmup: () => void
  onHistory: () => void
  onProfiles: () => void
}) {
  const setupMessage = localMode
    ? 'Weekly vocabulary is loaded automatically from the reviewed Google Slides snapshot. Check the source status above or try again if the update failed.'
    : 'There is no active weekly dataset scheduled right now.'
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
        <button className="mini-profile" onClick={onProfiles}>
          <span className={`avatar avatar-${child.color}`}>{child.initials}</span>
          <span>{child.grade}</span>
          <ChevronDown size={15} />
        </button>
      </section>
      <section className="hero-card">
        <div className="hero-copy">
          <div className="status-pill">
            <span className="status-dot" />{' '}
            {warmupWords > 0 ? 'Mastery Warmup' : localMode ? 'Setup required' : 'No active dataset'}
          </div>
          <h2>
            {warmupWords > 0 ? (
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
            )}
          </h2>
          <p>
            {warmupWords > 0
              ? `${warmupWords} mastery target${warmupWords === 1 ? '' : 's'} available`
              : localMode
                ? 'The app checks its reviewed Google Slides snapshot automatically. No upload is required.'
                : `${datasets.length} weekly dataset${datasets.length === 1 ? '' : 's'} remain on record.`}
          </p>
          {warmupWords > 0 && (
            <button className="primary-button" onClick={onStartWarmup}>
              Start mastery warmup <ArrowLeft size={17} />
            </button>
          )}
          {warmupWords === 0 && (
            <button className="primary-button" onClick={onHistory}>
              View progress <ArrowLeft size={17} />
            </button>
          )}
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
    </div>
  )
}
