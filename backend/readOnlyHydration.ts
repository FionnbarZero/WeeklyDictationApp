import { fetchGooglePresentation, googleAccessToken, type GoogleOAuthConfig } from './googleSlides.ts'
import { hydrateLocalStateFromReadOnlySource } from '../src/localHydration.ts'
import { profileForDeckId } from '../src/slidesImporter.ts'
import type { AppState, LocalHydrationResult } from '../src/domain.ts'

export type ReadOnlyHydrationConfig = {
  deckId: string
  googleOAuth: GoogleOAuthConfig
}

export type ReadOnlyHydrationDependencies = {
  googleAccessToken: typeof googleAccessToken
  fetchGooglePresentation: typeof fetchGooglePresentation
}

const defaults: ReadOnlyHydrationDependencies = { googleAccessToken, fetchGooglePresentation }

// This operation is intentionally Node/backend-only. It obtains a read-only
// PresentationLike payload and then uses the same canonical hydration path as
// trusted local JSON. It has no Firestore dependency and performs no writes.
export async function hydrateFromGoogleSlidesReadOnly(
  state: AppState,
  config: ReadOnlyHydrationConfig,
  dependencies: ReadOnlyHydrationDependencies = defaults,
): Promise<LocalHydrationResult> {
  const profile = profileForDeckId(config.deckId)
  if (!profile) throw new Error('The requested deck is not registered as an active parser profile.')
  const accessToken = await dependencies.googleAccessToken(config.googleOAuth)
  const presentation = await dependencies.fetchGooglePresentation(config.deckId, accessToken)
  return hydrateLocalStateFromReadOnlySource(state, presentation, profile)
}
