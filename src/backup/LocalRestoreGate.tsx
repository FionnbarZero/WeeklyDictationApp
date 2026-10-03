import { ShieldCheck } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { recoverInterruptedLocalRestore } from '../persistence/localRestoreJournal.ts'

export function LocalRestoreGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'checking' | 'ready' | 'blocked'>('checking')
  useEffect(() => {
    try {
      recoverInterruptedLocalRestore(window.localStorage)
      setStatus('ready')
    } catch {
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
          <p>The restore journal could not be recovered automatically. No new restore was started.</p>
        </div>
      </div>
    )
  return children
}
