import { ArrowLeft, BarChart3, History } from 'lucide-react'
import {
  sortDatasetsNewestFirst,
  type Dataset,
  type DatasetScore,
  type LifecyclePhase,
  type MonthlyRotationScore,
} from '../domain.ts'
import type { WarmupGraphPoint } from '../warmup/visits/contracts.ts'
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
              <div className="score-bar">
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
