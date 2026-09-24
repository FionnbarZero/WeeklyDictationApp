import { hydrateLocalState, type AppState, type LocalHydrationResult } from './domain.ts'
import { grade2DeckProfile, type ParserProfile, type PresentationLike, type SlideLike } from './slidesImporter.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSlideLike(value: unknown): value is SlideLike {
  if (!isRecord(value)) return false
  return (value.objectId === undefined || typeof value.objectId === 'string') &&
    (value.pageObjectId === undefined || typeof value.pageObjectId === 'string') &&
    (value.pageElements === undefined || Array.isArray(value.pageElements)) &&
    (value.text === undefined || typeof value.text === 'string') &&
    (value.speakerNotes === undefined || typeof value.speakerNotes === 'string')
}

export function parsePresentationJson(raw: string): PresentationLike {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('The trusted presentation payload is not valid JSON.')
  }
  if (!isRecord(parsed) || (parsed.presentationId !== undefined && typeof parsed.presentationId !== 'string') || (parsed.slides !== undefined && (!Array.isArray(parsed.slides) || !parsed.slides.every(isSlideLike)))) {
    throw new Error('The trusted presentation payload is not a valid PresentationLike object.')
  }
  return { presentationId: parsed.presentationId as string | undefined, slides: parsed.slides as SlideLike[] | undefined }
}

export function hydrateLocalStateFromJson(state: AppState, raw: string, profile: ParserProfile = grade2DeckProfile): LocalHydrationResult {
  return hydrateLocalStateFromReadOnlySource(state, raw, profile)
}

export type ReadOnlyPresentationSource = string | PresentationLike

export function presentationFromReadOnlySource(source: ReadOnlyPresentationSource): PresentationLike {
  return typeof source === 'string' ? parsePresentationJson(source) : source
}

export function hydrateLocalStateFromReadOnlySource(state: AppState, source: ReadOnlyPresentationSource, profile: ParserProfile = grade2DeckProfile): LocalHydrationResult {
  return hydrateLocalState(state, presentationFromReadOnlySource(source), profile)
}
