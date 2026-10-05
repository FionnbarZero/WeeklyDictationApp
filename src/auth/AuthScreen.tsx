import { Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { accountSignupEnabled } from '../config.ts'
import { authErrorMessage, sendPasswordResetEmail, signIn, signUp } from '../firebaseClient.ts'

export function AuthScreen() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'reset'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const selectMode = (next: typeof mode) => {
    setMode(next)
    setMessage(null)
    setError(null)
  }

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
        if (!accountSignupEnabled) throw new Error('New account creation is disabled for this deployment.')
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
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="success-banner" role="status">
              {message}
            </div>
          )}
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
          {mode !== 'sign-in' && <button onClick={() => selectMode('sign-in')}>Sign in</button>}
          {accountSignupEnabled && mode !== 'sign-up' && (
            <button onClick={() => selectMode('sign-up')}>Create account</button>
          )}
          {mode !== 'reset' && <button onClick={() => selectMode('reset')}>Forgot password?</button>}
        </div>
      </div>
    </div>
  )
}
