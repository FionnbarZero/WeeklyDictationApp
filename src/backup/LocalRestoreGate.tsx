import { ShieldCheck } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { recoverInterruptedLocalRestore } from '../persistence/localRestoreJournal.ts'

export function LocalRestoreGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'checking' | 'ready' | 'blocked'>('checking')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  useEffect(() => {
    try {
      recoverInterruptedLocalRestore(window.localStorage)
      setStatus('ready')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The recovery journal could not be read.')
      setStatus('blocked')
    }
  }, [])
  if (status === 'checking')
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <ShieldCheck size={28} />
          <h1>Checking browser progress</h1>
          <p>Finishing any interrupted restore safely…</p>
        </div>
      </div>
    )
  if (status === 'blocked')
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <ShieldCheck size={28} />
          <h1>Browser progress needs attention</h1>
          <p>
            The restore journal could not be recovered automatically. No new restore was started and the app will not
            overwrite the affected browser data.
          </p>
          <p>Keep this tab open, do not clear site data, and ask the application owner for recovery help.</p>
          {errorMessage && (
            <p className="error-banner" role="alert">
              {errorMessage}
            </p>
          )}
          <button className="primary-button" type="button" onClick={() => window.location.reload()}>
            Retry recovery
          </button>
        </div>
      </div>
    )
  return children
}
