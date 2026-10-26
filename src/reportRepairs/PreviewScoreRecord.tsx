import { useEffect, useState } from 'react'
import { previewProfile, previewResults } from '../familyBeta/runtime.ts'
export function PreviewScoreRecord() {
  const [, refresh] = useState(0)
  useEffect(() => {
    const update = () => refresh((value) => value + 1)
    window.addEventListener('storage', update)
    return () => window.removeEventListener('storage', update)
  }, [])
  try {
    const profile = previewProfile()
    const records = previewResults()
      .filter((result) => result.childId === profile?.id && result.grade === profile.grade)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    return (
      <section className="report-score-record" aria-label="Saved Ninja Record">
        <h2>Ninja Record</h2>
        <p>Completed and submitted scores saved in this browser. Unfinished tests are not scored.</p>
        {records.length ? (
          <ul>
            {records.slice(0, 12).map((result) => (
              <li key={result.id}>
                <strong>{result.activity}</strong> · {result.correct}/{result.attempted}
              </li>
            ))}
          </ul>
        ) : (
          <p>No submitted scores yet.</p>
        )}
      </section>
    )
  } catch {
    return (
      <section role="alert">
        <p>Saved scores could not be read. Your records have not been erased.</p>
        <button onClick={() => refresh((value) => value + 1)}>Retry saved scores</button>
      </section>
    )
  }
}
