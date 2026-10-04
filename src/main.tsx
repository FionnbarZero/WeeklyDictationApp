import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppErrorBoundary } from './AppErrorBoundary'
import { resolveManualTestClock } from './manualTestClock'
import { initializeStagingObservability } from './stagingObservability'
import './styles.css'
import './learningHub/learningHub.css'
import './accessibility/typography.css'

const manualTestClock = resolveManualTestClock(window.location.search, import.meta.env.DEV)

void initializeStagingObservability().catch((error) => {
  console.error('Staging observability failed to initialize.', error)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App now={manualTestClock?.now} manualTestDateLabel={manualTestClock?.label} />
    </AppErrorBoundary>
  </StrictMode>,
)
