import { useEffect, useRef, useState } from 'react'
import { RESULT_PAGE_SIZE, type ResultPage } from './cloud.ts'
import { type BetaProfile, type BetaResult, dailyTotals } from './model.ts'
import { attemptSeries, distinctAttempts, olderLocalAttempts } from './resultHistory.ts'

type Props = {
  child: BetaProfile
  results: readonly BetaResult[]
  nextPageToken: string
  loadPage?: (token: string, signal: AbortSignal) => Promise<ResultPage>
  readLocalResults: () => readonly BetaResult[]
}
const timestamp = (at: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(at))

/** One visible page. Background sync refreshes latest, never replaces a page being read. */
export function ResultHistory({ child, results, nextPageToken, loadPage, readLocalResults }: Props) {
  const [older, setOlder] = useState<
    (ResultPage & { number: number; loadPage?: Props['loadPage']; hasOlderLocal: boolean }) | null
  >(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  const allLocal = distinctAttempts(results, child.id).reverse()
  const current = older?.results || allLocal.slice(0, RESULT_PAGE_SIZE)
  const cursor = older ? older.nextPageToken : nextPageToken
  const pageLoader = older ? older.loadPage : loadPage
  const hasOlderLocal = older ? older.hasOlderLocal : !pageLoader && allLocal.length > RESULT_PAGE_SIZE

  async function next() {
    if (busy) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError('')
    try {
      const number = (older?.number || 1) + 1
      const localPage = pageLoader
        ? null
        : olderLocalAttempts(readLocalResults(), child.id, current[current.length - 1])
      const page = pageLoader
        ? await pageLoader(cursor, controller.signal)
        : { results: localPage!.results, nextPageToken: '' }
      // Validate before replacing the visible page; late child/account responses are ignored.
      distinctAttempts(page.results, child.id)
      if (!controller.signal.aborted)
        setOlder({ ...page, number, loadPage: pageLoader, hasOlderLocal: localPage?.hasOlderLocal || false })
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          `${e instanceof Error ? e.message : 'History could not load.'} The current page and saved records are unchanged. Retry Older attempts.`,
        )
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }
  function latest() {
    request.current?.abort()
    setBusy(false)
    setError('')
    setOlder(null)
  }
  return (
    <section className="beta-panel">
      <h1>{child.nickname}’s progress</h1>
      <p>Every completed attempt has its own point. Times and daily boundaries use Pacific time.</p>
      {!pageLoader && (
        <p>Showing records saved on this device. More history may be available when online saving reconnects.</p>
      )}
      <p role="status">
        {older ? `Older attempts · page ${older.number}` : 'Latest attempts'} · {current.length} shown. Charts and
        totals cover only this page, not all history.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="beta-history-controls">
        {(cursor || hasOlderLocal) && (
          <button onClick={() => void next()} disabled={busy}>
            {busy ? 'Loading older attempts…' : 'Older attempts'}
          </button>
        )}
        {older && <button onClick={latest}>Latest attempts</button>}
      </div>
      {!current.length && <p>{older || cursor ? 'No completed scores on this page.' : 'No completed scores yet.'}</p>}
      {attemptSeries(current, child.id).map((series) => (
        <section key={series.key} className="beta-attempt-series">
          <h2>{series.label}</h2>
          <svg
            viewBox="0 0 640 180"
            role="img"
            aria-label={`${series.label}: ${series.attempts.length} completed attempts, oldest to newest. Exact scores below.`}
          >
            <line x1="35" y1="150" x2="615" y2="150" stroke="currentColor" />
            <text x="0" y="20" fontSize="12">
              100%
            </text>
            <text x="6" y="152" fontSize="12">
              0%
            </text>
            <polyline
              fill="none"
              stroke="#177ab3"
              strokeWidth="2"
              points={series.attempts
                .map(
                  (r, i) =>
                    `${35 + (i * 580) / Math.max(1, series.attempts.length - 1)},${150 - (130 * r.correct) / r.attempted}`,
                )
                .join(' ')}
            />
            {series.attempts.map((r, i) => (
              <circle
                key={r.id}
                data-result-point={r.id}
                cx={35 + (i * 580) / Math.max(1, series.attempts.length - 1)}
                cy={150 - (130 * r.correct) / r.attempted}
                r="4"
                fill="#177ab3"
              >
                <title>
                  {timestamp(r.completedAt)} · {r.correct}/{r.attempted}
                </title>
              </circle>
            ))}
          </svg>
          <ol>
            {series.attempts.map((r) => (
              <li key={r.id}>
                <time dateTime={r.completedAt}>{timestamp(r.completedAt)}</time> · {r.correct}/{r.attempted}
              </li>
            ))}
          </ol>
        </section>
      ))}
      {current.length > 0 && (
        <>
          <h2>Daily totals for this page</h2>
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Summed score</th>
                <th>Sessions</th>
              </tr>
            </thead>
            <tbody>
              {dailyTotals(current, child.id).map((d) => (
                <tr key={d.day}>
                  <td>{d.day}</td>
                  <td>
                    {d.correct} / {d.attempted}
                  </td>
                  <td>{d.sessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
