export type StoredAuth = {
  idToken: string
  refreshToken?: string
  expiresAt: number
  user: { uid: string; email: string }
}

export class AuthRequestError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string) {
    super(`Firebase REST error: ${code}`)
    this.status = status
    this.code = code
  }
}

// Documented invalid-credential responses, not network failures, throttling,
// server errors or project configuration problems:
// https://firebase.google.com/docs/reference/rest/auth#section-refresh-token
function invalidCredential(error: unknown) {
  return (
    error instanceof AuthRequestError &&
    error.status >= 400 &&
    error.status < 500 &&
    ['TOKEN_EXPIRED', 'USER_DISABLED', 'USER_NOT_FOUND', 'INVALID_REFRESH_TOKEN'].includes(error.code)
  )
}

export function createTokenProvider(ports: {
  read: () => StoredAuth | null
  write: (auth: StoredAuth | null) => void
  renew: (token: string) => Promise<{ id_token: string; refresh_token: string; expires_in: string; user_id?: string }>
  now?: () => number
}) {
  const now = ports.now || Date.now
  const pending = new Map<string, Promise<string>>()
  return async function getToken(): Promise<string> {
    const stored = ports.read()
    if (!stored) throw new Error('You must sign in before accessing cloud data.')
    if (stored.expiresAt > now() + 60_000) return stored.idToken
    const identity = JSON.stringify(stored)
    const stillCurrent = () => JSON.stringify(ports.read()) === identity
    if (!stored.refreshToken) {
      if (stillCurrent()) ports.write(null)
      throw new Error('Your session expired. Sign in again to continue.')
    }
    const existing = pending.get(identity)
    if (existing) return existing
    const refresh = (async () => {
      try {
        const body = await Promise.resolve().then(() => ports.renew(stored.refreshToken!))
        if (!stillCurrent()) throw new Error('The signed-in account changed. Retry with the current account.')
        const lifetime = Number(body.expires_in)
        if (
          !body.id_token ||
          !body.refresh_token ||
          !Number.isFinite(lifetime) ||
          lifetime <= 0 ||
          (body.user_id !== undefined && body.user_id !== stored.user.uid)
        )
          throw new Error('Sign-in renewal could not be verified. Keep working locally and retry saving.')
        const refreshed = {
          ...stored,
          idToken: body.id_token,
          refreshToken: body.refresh_token,
          expiresAt: now() + lifetime * 1000,
        }
        ports.write(refreshed)
        return refreshed.idToken
      } catch (error) {
        // Offline work retains its last known family, but no expired token is
        // returned to authorize a cloud request. Explicit invalidation still locks.
        if (invalidCredential(error) && stillCurrent()) ports.write(null)
        throw error
      } finally {
        pending.delete(identity)
      }
    })()
    pending.set(identity, refresh)
    return refresh
  }
}
