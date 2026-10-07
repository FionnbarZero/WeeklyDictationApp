import { AuthRequestError, createTokenProvider, type StoredAuth } from './auth/tokenRefresh.ts'
import { accountSignupEnabled, firebaseConfig, firebaseConfigReady } from './config.ts'
import { firebaseAppCheckHeaders } from './firebaseSdkRuntime.ts'
import { offlineFamilyKey } from './familyBeta/offlineFamily.ts'

export type AuthUser = { uid: string; email: string }
export type AuthState = {
  status: 'loading' | 'signed-out' | 'signed-in' | 'unconfigured'
  user: AuthUser | null
  error: string | null
}

const AUTH_STORAGE_KEY = 'weekly-dictation-auth-v1'
const authEvent = 'weekly-dictation-auth-changed'

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/^Firebase REST error:\s*/i, '')
    .replace(/_/g, ' ')
    .replace(/\b[A-Z_]+\b/g, (value) => value.toLowerCase())
}

function readStoredAuth(): StoredAuth | null {
  if (typeof window === 'undefined') return null
  try {
    const value = JSON.parse(window.localStorage.getItem(AUTH_STORAGE_KEY) || 'null') as StoredAuth | null
    return value && value.idToken && value.user?.uid ? value : null
  } catch {
    return null
  }
}

function writeStoredAuth(value: StoredAuth | null) {
  if (typeof window === 'undefined') return
  if (value) window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(value))
  else {
    const previous = readStoredAuth()
    if (previous) window.localStorage.removeItem(offlineFamilyKey(previous.user.uid))
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
  }
  window.dispatchEvent(new Event(authEvent))
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', headers.get('Content-Type') || 'application/json')
  for (const [name, value] of Object.entries(await firebaseAppCheckHeaders())) headers.set(name, value)
  const response = await fetch(url, {
    ...init,
    headers,
    signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new AuthRequestError(response.status, body?.error?.message || response.statusText)
  return body as T
}

function authUrl(method: string) {
  return `https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${encodeURIComponent(firebaseConfig.apiKey)}`
}

async function authenticate(method: 'signUp' | 'signInWithPassword', email: string, password: string) {
  if (!firebaseConfigReady) throw new Error('Firebase configuration is missing.')
  const body = await request<{
    localId: string
    email: string
    idToken: string
    refreshToken: string
    expiresIn: string
  }>(authUrl(method), { method: 'POST', body: JSON.stringify({ email, password, returnSecureToken: true }) })
  const auth: StoredAuth = {
    idToken: body.idToken,
    refreshToken: body.refreshToken,
    expiresAt: Date.now() + Number(body.expiresIn || 3600) * 1000,
    user: { uid: body.localId, email: body.email },
  }
  writeStoredAuth(auth)
  return auth.user
}

export async function signUp(email: string, password: string) {
  if (!accountSignupEnabled) throw new Error('New account creation is disabled for this deployment.')
  return authenticate('signUp', email, password)
}
export async function signIn(email: string, password: string) {
  return authenticate('signInWithPassword', email, password)
}
export async function sendPasswordResetEmail(email: string) {
  if (!firebaseConfigReady) throw new Error('Firebase configuration is missing.')
  await request(authUrl('sendOobCode'), {
    method: 'POST',
    body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
  })
}
export function signOut() {
  writeStoredAuth(null)
}

export const getIdToken = createTokenProvider({
  read: readStoredAuth,
  write: writeStoredAuth,
  renew: (token) =>
    request(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(firebaseConfig.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(token)}`,
    }),
})

export function currentUser() {
  return readStoredAuth()?.user || null
}
export function subscribeAuth(callback: (state: AuthState) => void) {
  if (!firebaseConfigReady) {
    callback({ status: 'unconfigured', user: null, error: null })
    return () => undefined
  }
  const emit = () => callback({ status: currentUser() ? 'signed-in' : 'signed-out', user: currentUser(), error: null })
  emit()
  window.addEventListener(authEvent, emit)
  window.addEventListener('storage', emit)
  return () => {
    window.removeEventListener(authEvent, emit)
    window.removeEventListener('storage', emit)
  }
}

export function authErrorMessage(error: unknown) {
  return friendlyError(error)
}
