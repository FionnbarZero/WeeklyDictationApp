import { type ReactNode, useEffect, useState } from 'react'
import { AuthScreen } from '../auth/AuthScreen.tsx'
import { firebaseConfigReady } from '../config.ts'
import { type AuthState, signOut, subscribeAuth } from '../firebaseClient.ts'
import { isDeviceTestAccount, isDeviceTestIdentity } from './policy.ts'

/** Never mount the family reader for a real parent in this test-only website. */
export function DeviceAcceptance({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading', user: null, error: null })
  useEffect(() => subscribeAuth(setAuth), [])
  if (!firebaseConfigReady) return <p role="alert">This device test requires its configured family connection.</p>
  if (auth.status === 'loading') return <p role="status">Checking test account…</p>
  let testIdentity = false
  try {
    const stored = JSON.parse(localStorage.getItem('weekly-dictation-auth-v1') || 'null')
    testIdentity = Boolean(auth.user && isDeviceTestIdentity(stored?.idToken || '', auth.user))
  } catch {
    /* Invalid browser identity cannot mount a family reader. */
  }
  if (auth.user)
    return testIdentity ? (
      children
    ) : (
      <section className="beta-panel">
        <h1>Test accounts only</h1>
        <p>Your family records have not been opened. Sign out and use a separate device-test account.</p>
        <button onClick={() => signOut()}>Sign out of this test website</button>
      </section>
    )
  return (
    <>
      <section className="beta-panel" aria-label="Device test setup">
        <h1>Mandarin Ninja Academy</h1>
        <p>Integrated fixes 1 · Device and syncing test</p>
        <p>Use a separate test account on both devices. Do not enter real children’s names.</p>
        <p>
          Choose a test email such as <code>ninja-device-yourtestname@example.invalid</code> and your own password. Use
          Create account once, then Sign in with those same details on the other device. This test address does not
          receive email; keep the password privately.
        </p>
        <p>
          In Parent controls, add a test learner for each grade. Your previous preview progress stays at its original
          link.
        </p>
      </section>
      <AuthScreen
        validateEmail={(email) =>
          isDeviceTestAccount(email) ? null : 'Use a separate ninja-device-yourtestname@example.invalid test account.'
        }
      />
    </>
  )
}

export function DeviceSyncCheck({ status, refresh }: { status: string; refresh: () => void }) {
  return (
    <section className="beta-panel" aria-label="Device and syncing check">
      <strong>Device and syncing check</strong>
      <p role="status">{status || 'Waiting for family syncing.'}</p>
      <button type="button" onClick={refresh}>
        Check syncing
      </button>
      <p>
        Finish a teaching step or answer, Exit the activity, and check syncing. After confirmation, close this tab
        before continuing with the same test account and learner on your other device. Unfinished strokes and recordings
        are temporary and must be repeated.
      </p>
      <p>
        On iPad and iMac: check automatic sound and Hear, adult microphone playback, drawing without page movement,
        rotation or keyboard space, Report pause/return, and reopening your confirmed word and step. Use Report a
        problem for any failure, including the device and browser. These checks are not marked passed automatically.
      </p>
    </section>
  )
}
