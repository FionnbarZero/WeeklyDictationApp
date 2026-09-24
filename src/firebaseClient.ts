import { firebaseConfig, firebaseConfigReady } from './config.ts'

type StoredAuth = {
  idToken: string
  refreshToken?: string
  expiresAt: number
  user: AuthUser
}

export type AuthUser = { uid: string; email: string }
export type AuthState = { status: 'loading' | 'signed-out' | 'signed-in' | 'unconfigured'; user: AuthUser | null; error: string | null }

const AUTH_STORAGE_KEY = 'weekly-dictation-auth-v1'
const authEvent = 'weekly-dictation-auth-changed'

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Firebase REST error:\s*/i, '').replace(/_/g, ' ').replace(/\b[A-Z_]+\b/g, (value) => value.toLowerCase())
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
  else window.localStorage.removeItem(AUTH_STORAGE_KEY)
  window.dispatchEvent(new Event(authEvent))
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`Firebase REST error: ${body?.error?.message || response.statusText}`)
  return body as T
}

function authUrl(method: string) { return `https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${encodeURIComponent(firebaseConfig.apiKey)}` }

async function authenticate(method: 'signUp' | 'signInWithPassword', email: string, password: string) {
  if (!firebaseConfigReady) throw new Error('Firebase configuration is missing.')
  const body = await request<{ localId: string; email: string; idToken: string; refreshToken: string; expiresIn: string }>(authUrl(method), { method: 'POST', body: JSON.stringify({ email, password, returnSecureToken: true }) })
  const auth: StoredAuth = { idToken: body.idToken, refreshToken: body.refreshToken, expiresAt: Date.now() + Number(body.expiresIn || 3600) * 1000, user: { uid: body.localId, email: body.email } }
  writeStoredAuth(auth)
  return auth.user
}

export async function signUp(email: string, password: string) { return authenticate('signUp', email, password) }
export async function signIn(email: string, password: string) { return authenticate('signInWithPassword', email, password) }
export async function sendPasswordResetEmail(email: string) {
  if (!firebaseConfigReady) throw new Error('Firebase configuration is missing.')
  await request(authUrl('sendOobCode'), { method: 'POST', body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }) })
}
export function signOut() { writeStoredAuth(null) }

export async function getIdToken() {
  const stored = readStoredAuth()
  if (!stored) throw new Error('You must sign in before accessing cloud data.')
  if (stored.expiresAt > Date.now() + 60_000 || !stored.refreshToken) return stored.idToken
  const body = await request<{ id_token: string; refresh_token: string; expires_in: string }>(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(firebaseConfig.apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(stored.refreshToken)}` })
  const refreshed = { ...stored, idToken: body.id_token, refreshToken: body.refresh_token, expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000 }
  writeStoredAuth(refreshed)
  return refreshed.idToken
}

export function currentUser() { return readStoredAuth()?.user || null }
export function subscribeAuth(callback: (state: AuthState) => void) {
  if (!firebaseConfigReady) { callback({ status: 'unconfigured', user: null, error: null }); return () => undefined }
  const emit = () => callback({ status: currentUser() ? 'signed-in' : 'signed-out', user: currentUser(), error: null })
  emit()
  window.addEventListener(authEvent, emit)
  window.addEventListener('storage', emit)
  return () => { window.removeEventListener(authEvent, emit); window.removeEventListener('storage', emit) }
}

export function authErrorMessage(error: unknown) { return friendlyError(error) }
