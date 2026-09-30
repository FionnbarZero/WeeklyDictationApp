import { History } from 'lucide-react'
import type { MonthlyRotationScore } from '../domain.ts'

function monthLabel(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return month
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)))
}

export function LegacyMasteryHistory({ scores }: { scores: readonly MonthlyRotationScore[] }) {
  if (scores.length === 0) return null
  const ordered = [...scores].sort((left, right) => right.month.localeCompare(left.month) || left.id.localeCompare(right.id))
  return <section className="progress-card legacy-mastery-card" aria-labelledby="legacy-mastery-title">
    <div className="progress-card-heading"><div><span className="eyebrow">Preserved history</span><h2 id="legacy-mastery-title">Earlier Mastery history</h2></div><History size={22} /></div>
    <p className="legacy-mastery-note">These monthly Mastery Rotation totals were recorded by the earlier Warmup system. They remain separate from the new visit-by-visit graph.</p>
    <div className="legacy-mastery-list">
      {ordered.map((score) => <div className="legacy-mastery-row" key={score.id}>
        <span className="legacy-mastery-dot" aria-hidden="true" />
        <div className="score-row-copy"><strong>{monthLabel(score.month)}</strong><span>{score.correct}/{score.total} correct · {score.status === 'finalized' ? 'Finalized month' : 'Month in progress'}</span></div>
        <div className="score-bar"><span style={{ width: `${score.percent}%` }} /></div>
        <strong className="score-number">{score.percent}%</strong>
      </div>)}
    </div>
  </section>
}
