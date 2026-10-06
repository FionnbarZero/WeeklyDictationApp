import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppErrorBoundary } from './AppErrorBoundary'
import { resolveManualTestClock } from './manualTestClock'
import { initializeStagingObservability } from './stagingObservability'
import './styles.css'
import './learningHub/learningHub.css'

if (window.parent === window) {
  void import('./familyBeta/installProblemReporter.tsx').then((m) => m.installProblemReporter('Grade 2'))
}

const manualTestClock = resolveManualTestClock(window.location.search, import.meta.env.DEV)
const previewDate =
  import.meta.env.VITE_RECONCILIATION_PREVIEW === 'true'
    ? new URLSearchParams(window.location.search).get('week')
    : null

void initializeStagingObservability().catch((error) => {
  console.error('Staging observability failed to initialize.', error)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App
        now={
          previewDate && /^\d{4}-\d{2}-\d{2}$/.test(previewDate)
            ? () => new Date(`${previewDate}T12:00:00-07:00`)
            : manualTestClock?.now
        }
        manualTestDateLabel={manualTestClock?.label}
      />
    </AppErrorBoundary>
  </StrictMode>,
)
