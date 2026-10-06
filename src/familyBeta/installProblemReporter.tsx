import { createRoot } from 'react-dom/client'
import { ProblemReporter } from './ProblemReporter.tsx'

export function installProblemReporter(grade: string) {
  // The family wrapper owns the reporter for embedded activities. Standalone
  // grade pages need their own persistent root, independent of activity changes.
  if (window.parent !== window || document.getElementById('problem-reporter-root')) return
  const host = document.createElement('div')
  host.id = 'problem-reporter-root'
  document.body.prepend(host)
  createRoot(host).render(<ProblemReporter grade={grade} />)
}
