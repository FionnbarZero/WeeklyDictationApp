import { ArrowLeft, BarChart3, History } from 'lucide-react'
import {
  sortDatasetsNewestFirst,
  type Dataset,
  type DatasetScore,
  type LifecyclePhase,
  type MonthlyRotationScore,
} from '../domain.ts'
import type { WarmupGraphPoint } from '../warmup/visits/contracts.ts'
import type { Tier2ReadingProgressRecord } from '../readingPractice/contracts.ts'
import { LegacyMasteryHistory } from './LegacyMasteryHistory.tsx'
import { WarmupProgressGraph } from './WarmupProgressGraph.tsx'

export type HistoryChild = {
  id: string
  name: string
  color: string
  initials: string
}

export type HistoryViewProps = {
  child: HistoryChild
  datasets: Dataset[]
  scores: DatasetScore[]
  legacyCount: number
  legacyMasteryScores: MonthlyRotationScore[]
  warmupGraphPoints: WarmupGraphPoint[]
  readingProgress: Tier2ReadingProgressRecord[]
  onBack: () => void
}

function phaseLabel(phase: LifecyclePhase) {
  return phase === 'test-review' ? 'Test Review' : phase === 'warmup' ? 'Warmup' : 'Acquisition'
}

export function HistoryView({
  child,
  datasets,
  scores,
  legacyCount,
  legacyMasteryScores,
  warmupGraphPoints,
  readingProgress,
  onBack,
}: HistoryViewProps) {
  const ordered = sortDatasetsNewestFirst(datasets)
  return (
    <div className="page history-page">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={16} /> Back to practice
      </button>
      <div className="history-heading">
        <div>
          <p className="eyebrow">Progress for {child.name}</p>
          <h1>
            Small steps,
            <br />
            <em>real progress.</em>
          </h1>
        </div>
        <div className={`avatar avatar-${child.color} avatar-large`}>{child.initials}</div>
      </div>
      {legacyCount > 0 && (
        <div className="history-note">
          <History size={17} />
          <span>
            {legacyCount} legacy result{legacyCount === 1 ? '' : 's'} preserved without an invented date range.
          </span>
        </div>
      )}
      <LegacyMasteryHistory scores={legacyMasteryScores} />
      <WarmupProgressGraph points={warmupGraphPoints} />
      <ReadingProgressHistory progress={readingProgress} />
      {ordered.map((dataset) => (
        <DatasetGraph
          key={dataset.id}
          dataset={dataset}
          scores={scores.filter((score) => score.childId === child.id && score.datasetId === dataset.id)}
        />
      ))}
    </div>
  )
}

function readingPathwayLabel(progress: Tier2ReadingProgressRecord) {
  if (progress.pathwayKind === 'test-review') return `Test Review ${progress.reviewCycle || ''}`.trim()
  return progress.pathwayKind === 'acquisition' ? 'Acquisition' : 'Mastery'
}

function ReadingProgressHistory({ progress }: { progress: Tier2ReadingProgressRecord[] }) {
  const completed = progress
    .filter((record) => record.status === 'completed' && record.summary)
    .sort((left, right) => (right.completedAt || '').localeCompare(left.completedAt || ''))
  if (completed.length === 0) return null
  return (
    <section className="dataset-graph progress-card" aria-labelledby="reading-progress-title">
      <div className="progress-card-heading">
        <div>
          <span className="eyebrow">Tier 2 reading · progress saved</span>
          <h2 id="reading-progress-title">Reading practice</h2>
        </div>
        <BarChart3 size={22} aria-hidden="true" />
      </div>
      <div className="score-list">
        {completed.map((record) => {
          const summary = record.summary!
          const percent = summary.attempted === 0 ? 0 : Math.round((summary.correct / summary.attempted) * 100)
          const date = new Date(record.completedAt || record.updatedAt).toLocaleDateString()
          return (
            <div className="score-row" key={record.id}>
              <div className="score-dot dot-acquisition" aria-hidden="true" />
              <div className="score-row-copy">
                <strong>{date}</strong>
                <span>
                  {readingPathwayLabel(record)} · {summary.correct}/{summary.attempted} correct
                </span>
              </div>
              <div
                className="score-bar"
                role="progressbar"
                aria-label={`${readingPathwayLabel(record)} score`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <span style={{ width: `${percent}%` }} />
              </div>
              <strong className="score-number">{percent}%</strong>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function DatasetGraph({ dataset, scores }: { dataset: Dataset; scores: DatasetScore[] }) {
  const orderedScores = [...scores].sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))
  return (
    <section className="dataset-graph progress-card">
      <div className="progress-card-heading">
        <div>
          <span className="eyebrow">
            {dataset.dateRange} · {dataset.grade}
          </span>
          <h2>{dataset.description}</h2>
        </div>
        <BarChart3 size={22} />
      </div>
      {orderedScores.length === 0 ? (
        <p className="empty-graph">No scores recorded yet.</p>
      ) : (
        <div className="score-list">
          {orderedScores.map((score) => (
            <div className="score-row" key={score.id}>
              <div className={`score-dot dot-${score.phase}`} />
              <div className="score-row-copy">
                <strong>{score.sessionDate}</strong>
                <span>
                  {phaseLabel(score.phase)} · {score.correct}/{score.wordCount} correct
                </span>
              </div>
              <div
                className="score-bar"
                role="progressbar"
                aria-label={`${dataset.dateRange} ${phaseLabel(score.phase)} score`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={score.percent}
              >
                <span style={{ width: `${score.percent}%` }} />
              </div>
              <strong className="score-number">{score.percent}%</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default HistoryView
