import type { PresentationLike, SlideLike } from '../src/slidesImporter.ts'

type FetchLike = typeof fetch

export type GooglePresentationResource = {
  presentationId?: string
  slides?: Array<{ objectId?: string; pageElements?: unknown[]; speakerNotes?: string }>
}

export type GoogleOAuthConfig = {
  clientId: string
  clientSecret: string
  refreshToken: string
}

function jsonError(body: unknown, fallback: string) {
  if (body && typeof body === 'object' && 'error_description' in body && typeof body.error_description === 'string') return body.error_description
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'object' && body.error && 'message' in body.error && typeof body.error.message === 'string') return body.error.message
  return fallback
}

export function presentationLikeFromGoogleResponse(resource: GooglePresentationResource): PresentationLike {
  return {
    presentationId: resource.presentationId,
    slides: (resource.slides || []).map((slide): SlideLike => ({ objectId: slide.objectId, pageElements: slide.pageElements, speakerNotes: slide.speakerNotes })),
  }
}

export async function googleAccessToken(config: GoogleOAuthConfig, fetchImpl: FetchLike = fetch) {
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: config.refreshToken, grant_type: 'refresh_token' }),
  })
  const body = await response.json().catch(() => ({})) as { access_token?: string }
  if (!response.ok || !body.access_token) throw new Error(`Google authorization failed: ${jsonError(body, response.statusText)}`)
  return body.access_token
}

export async function fetchGooglePresentation(presentationId: string, accessToken: string, fetchImpl: FetchLike = fetch): Promise<PresentationLike> {
  const response = await fetchImpl(`https://slides.googleapis.com/v1/presentations/${encodeURIComponent(presentationId)}`, { headers: { Authorization: `Bearer ${accessToken}` } })
  const body = await response.json().catch(() => ({})) as GooglePresentationResource
  if (!response.ok) throw new Error(`Google Slides read failed: ${jsonError(body, response.statusText)}`)
  return presentationLikeFromGoogleResponse(body)
}
