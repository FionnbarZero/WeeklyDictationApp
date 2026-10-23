import { useState } from 'react'
import type { AppState, Dataset } from '../domain.ts'
import { correctedWritingAttempts, startCorrectedWritingAttempt } from './correctedWritingAttempt.ts'

export default function CorrectedWritingNotice({
  state,
  incoming,
  childId,
  dateKey,
}: {
  state: AppState
  incoming: Dataset[]
  childId: string
  dateKey: string
}) {
  const [error, setError] = useState('')
  // Ordinary Writing opens the active scheduled week, not a historical week.
  const activeSource = incoming
    .filter((d) => d.startDate <= dateKey)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .slice(0, 1)
  let proposals: ReturnType<typeof correctedWritingAttempts> = []
  let unavailable = ''
  try {
    proposals = correctedWritingAttempts(state, activeSource, childId, localStorage)
  } catch {
    unavailable = 'The corrected lesson is not ready. All saved work is preserved; please report this problem.'
  }
  if (!proposals.length && !unavailable && !error) return null
  return (
    <section
      className="error-banner"
      data-report-activity="Corrected writing lesson"
      data-report-phase="curriculum-repair"
      data-report-module="writing"
      data-report-section="enter-the-dojo"
    >
      {proposals.map((p) => (
        <div key={p.envelope.id}>
          <strong>A corrected Writing lesson is ready · {p.old.dateRange}</strong>
          {childId === 'w1-label-example' && (
            <p>This is a synthetic saved-lesson example. Your normal test learner is unchanged.</p>
          )}
          <p>
            The old lesson included “stroke order” as a word. Start a separate corrected attempt with{' '}
            {p.replacement.words.map((w) => w.text).join('、')}. Your previous work and scores will stay saved.
          </p>
          <button
            className="primary-button"
            style={{ minHeight: 44 }}
            type="button"
            onClick={() => {
              try {
                startCorrectedWritingAttempt(localStorage, state, activeSource, childId, p.envelope.id)
                window.location.reload()
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : 'The correction could not be confirmed. Your work is preserved.',
                )
              }
            }}
          >
            Use corrected lesson · keep old work
          </button>
        </div>
      ))}
      {(unavailable || error) && <p role="alert">{error || unavailable}</p>}
    </section>
  )
}
