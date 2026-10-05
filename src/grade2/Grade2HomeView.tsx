import { ArrowLeft, Check, Clock3 } from 'lucide-react'
import {
  latestScore,
  localDateKey,
  requireDatasetLifecycle,
  sortDatasetsNewestFirst,
  type Dataset,
  type DatasetLifecycle,
  type DatasetScore,
  type LifecyclePhase,
  type PracticeTarget,
  type resolveDatasetLifecycles,
} from '../domain.ts'
import { LearningHub } from '../learningHub/LearningHub.tsx'
import type { Tier2ReadingLifecycle, Tier2ReadingPathway } from '../tier2/contracts.ts'
import { grade2LearningHubView, type Grade2LearningHubLaunch } from './learningHub.ts'

type Grade2HomeChild = {
  id: string
  name: string
}

type Grade2HomeViewProps = {
  child: Grade2HomeChild
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
  onStartWarmup: () => void
  onStartReading: (pathway: Tier2ReadingPathway) => void
  onHistory: () => void
}

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
        <div className="tiny-progress">
          <span style={{ width: `${score?.percent || 0}%` }} />
        </div>
      </div>
    </article>
  )
}

export function Grade2HomeView({
  child,
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
  onStartWarmup,
  onStartReading,
  onHistory,
}: Grade2HomeViewProps) {
  const today = scores.filter(
    (score) => score.childId === child.id && score.sessionDate === localDateKey(currentDate),
  ).length
  const orderedDatasets = sortDatasetsNewestFirst(datasets)
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
    else if (request.kind === 'reading') onStartReading(request.pathway)
    else onStartWarmup()
  }

  return (
    <div className="page grade2-learning-hub">
      {completedSummary && (
        <div className="success-banner">
          <span className="success-icon">
            <Check size={17} />
          </span>
          <span>
            <strong>Practice complete.</strong> {completedSummary}
          </span>
          <button onClick={onHistory}>
            See progress <ArrowLeft size={14} />
          </button>
        </div>
      )}
      <LearningHub model={model} onLaunch={launch} showTopbar={false} />
      <section className="section-heading grade2-record-heading">
        <div>
          <p className="eyebrow">Ninja Record</p>
          <h2>Every week stays on record</h2>
        </div>
        <button className="text-button" onClick={onHistory}>
          View progress <ArrowLeft size={15} />
        </button>
      </section>
      <div className="set-grid">
        {orderedDatasets.map((dataset, index) => (
          <SetCard
            key={dataset.id}
            dataset={dataset}
            lifecycle={requireDatasetLifecycle(lifecycleResolution, dataset.id)}
            score={latestScore(scores, child.id, dataset.id)}
            tone={index % 2 === 0 ? 'yellow' : 'lavender'}
          />
        ))}
      </div>
      <section className="today-strip">
        <div className="strip-icon">
          <Clock3 size={18} />
        </div>
        <div>
          <strong>
            {today
              ? `${today} dataset score${today === 1 ? '' : 's'} recorded today`
              : 'No dataset scores recorded today'}
          </strong>
          <span>
            Acquisition scores appear when “Done for today” is selected; Final Boss scores require the complete Test
            Review.
          </span>
        </div>
        <div className="strip-arrow">→</div>
      </section>
    </div>
  )
}

export default Grade2HomeView
