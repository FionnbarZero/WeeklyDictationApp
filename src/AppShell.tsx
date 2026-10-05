import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react'
import { ShieldCheck, Sparkles } from 'lucide-react'
import {
  authErrorMessage,
  sendPasswordResetEmail,
  signIn,
  signUp,
  subscribeAuth,
  type AuthState,
} from './firebaseClient.ts'
import { firebaseConfigReady } from './runtimeConfig.ts'

type AppClock = () => Date

const AuthenticatedApp = lazy(() => import('./App.tsx'))
const LocalRestoreGate = lazy(() =>
  import('./backup/LocalRestoreGate.tsx').then((module) => ({ default: module.LocalRestoreGate })),
)

export function AppShell({
  now = () => new Date(),
  manualTestDateLabel,
}: {
  now?: AppClock
  manualTestDateLabel?: string
}) {
  const [auth, setAuth] = useState<AuthState>(() =>
    firebaseConfigReady
      ? { status: 'loading', user: null, error: null }
      : { status: 'unconfigured', user: null, error: null },
  )

  useEffect(() => subscribeAuth(setAuth), [])

  const content =
    auth.status === 'loading' ? (
      <div className="auth-shell">
        <div className="auth-card">
          <Sparkles size={28} />
          <h1>Loading Weekly Dictation</h1>
          <p>Checking your secure family session…</p>
        </div>
      </div>
    ) : firebaseConfigReady && auth.status === 'signed-out' ? (
      <AuthScreen />
    ) : firebaseConfigReady ? (
      <Suspense fallback={<WorkspaceLoading />}>
        <AuthenticatedApp auth={auth} now={now} />
      </Suspense>
    ) : (
      <Suspense fallback={<WorkspaceLoading local />}>
        <LocalRestoreGate>
          <AuthenticatedApp auth={auth} now={now} />
        </LocalRestoreGate>
      </Suspense>
    )

  return (
    <>
      {manualTestDateLabel && (
        <div className="manual-test-date-banner" role="status">
          {manualTestDateLabel}
          <span>Development only</span>
        </div>
      )}
      {content}
    </>
  )
}

function WorkspaceLoading({ local = false }: { local?: boolean }) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <ShieldCheck size={28} />
        <h1>{local ? 'Checking browser progress' : 'Loading your workspace'}</h1>
      </div>
    </div>
  )
}

function AuthScreen() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'reset'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      if (mode === 'reset') {
        await sendPasswordResetEmail(email)
        setMessage('Password reset instructions sent if the account exists.')
      } else if (mode === 'sign-up') {
        await signUp(email, password)
        setMessage('Account created. Your private family is ready.')
      } else {
        await signIn(email, password)
      }
    } catch (caught) {
      setError(authErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand auth-brand">
          <span className="brand-mark">
            <Sparkles size={17} />
          </span>
          <span>
            weekly<span className="brand-accent">dictation</span>
          </span>
        </div>
        <p className="eyebrow">Private family practice</p>
        <h1>
          {mode === 'sign-up'
            ? 'Create your parent account'
            : mode === 'reset'
              ? 'Reset your password'
              : 'Welcome back'}
        </h1>
        <p className="auth-copy">Sign in to keep children, sessions, and progress safely separated by family.</p>
        <form onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
          </label>
          {mode !== 'reset' && (
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              />
            </label>
          )}
          {error && <div className="error-banner">{error}</div>}
          {message && <div className="success-banner">{message}</div>}
          <button className="primary-button auth-submit" disabled={busy}>
            {busy
              ? 'Working…'
              : mode === 'reset'
                ? 'Send reset email'
                : mode === 'sign-up'
                  ? 'Create account'
                  : 'Sign in'}
          </button>
        </form>
        <div className="auth-links">
          {mode !== 'sign-in' && (
            <button
              onClick={() => {
                setMode('sign-in')
                setMessage(null)
                setError(null)
              }}
            >
              Sign in
            </button>
          )}
          {mode !== 'sign-up' && (
            <button
              onClick={() => {
                setMode('sign-up')
                setMessage(null)
                setError(null)
              }}
            >
              Create account
            </button>
          )}
          {mode !== 'reset' && (
            <button
              onClick={() => {
                setMode('reset')
                setMessage(null)
                setError(null)
              }}
            >
              Forgot password?
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default AppShell
