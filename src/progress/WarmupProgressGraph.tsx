import { BarChart3 } from 'lucide-react'
import type { WarmupGraphPoint } from '../warmup/visits/contracts.ts'

export function WarmupProgressGraph({ points }: { points: readonly WarmupGraphPoint[] }) {
  const ordered = [...points].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id))
  const width = 640
  const height = 220
  const left = 44
  const right = 18
  const top = 18
  const bottom = 38
  const usableWidth = width - left - right
  const usableHeight = height - top - bottom
  const coordinates = ordered.map((point, index) => ({
    point,
    x: ordered.length === 1 ? left + usableWidth / 2 : left + (index / (ordered.length - 1)) * usableWidth,
    y: top + ((100 - point.percent) / 100) * usableHeight,
  }))
  return <section className="progress-card warmup-progress-card" aria-labelledby="warmup-progress-title">
    <div className="progress-card-heading"><div><span className="eyebrow">Adaptive Warmup</span><h2 id="warmup-progress-title">Mastery progress by visit</h2></div><BarChart3 size={22} /></div>
    {ordered.length === 0 ? <p className="empty-graph">Complete at least one Warmup answer to begin this graph.</p> : <>
      <svg className="warmup-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Warmup accuracy across ${ordered.length} visit${ordered.length === 1 ? '' : 's'}`}>
        {[0, 25, 50, 75, 100].map((value) => { const y = top + ((100 - value) / 100) * usableHeight; return <g key={value}><line x1={left} x2={width - right} y1={y} y2={y} className="warmup-grid-line" /><text x={left - 8} y={y + 4} textAnchor="end" className="warmup-axis-label">{value}%</text></g> })}
        {coordinates.length > 1 && <polyline className="warmup-line" points={coordinates.map(({ x, y }) => `${x},${y}`).join(' ')} />}
        {coordinates.map(({ point, x, y }, index) => <g key={point.id}><circle className={`warmup-point warmup-point-${point.status}`} cx={x} cy={y} r="6"><title>{`${point.localDate}: ${point.percent}% (${point.correctCount}/${point.attemptedCount}), ${point.status}`}</title></circle><text x={x} y={height - 12} textAnchor="middle" className="warmup-axis-label">{ordered.length <= 8 || index === 0 || index === ordered.length - 1 ? point.localDate.slice(5) : ''}</text></g>)}
      </svg>
      <div className="warmup-graph-summary"><span>{ordered.length} visit{ordered.length === 1 ? '' : 's'}</span><span>● Completed</span><span className="partial-key">● Partial</span><span>Percent uses attempted answers</span></div>
    </>}
  </section>
}
