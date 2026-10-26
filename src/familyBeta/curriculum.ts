import { GRADE2_DECK_ID, GRADE5_DECK_ID, KINDERGARTEN_SHEETS_ID } from '../config.ts'
import { candidatesFromPresentation } from '../curriculum/adapters/googleSlides.ts'
import { extractGrade5Presentation } from '../curriculum/adapters/grade5GoogleSlides.ts'
import { datasetFromCanonicalCandidate } from '../curriculum/datasetProjection.ts'
import type { CurriculumSourcePayload, WeeklyDatasetCandidate } from '../curriculum/model.ts'
import { extractGrade5Assessment } from '../grade5PresentationPreview/assessmentSource.ts'
import { grade5PresentationPreview } from '../grade5PresentationPreview/policy.ts'
import { GRADE5_ASSESSMENT_SOURCE_ID } from '../grade5PresentationPreview/sourceIdentity.ts'
import { inspectKindergartenWorkbook } from '../kindergartenSheetsImporter.ts'
import { grade2DeckProfile } from '../slidesImporter.ts'
import { automaticCurriculumEndpoint, automaticCurriculumPreview } from './automaticCurriculum.ts'
import { grade2WetlandReviewPreview, recoverGrade2Wetland } from './grade2WetlandReview.ts'
import type { BetaGrade } from './model.ts'

export const sourceIds: Record<BetaGrade, string> = {
  Kindergarten: KINDERGARTEN_SHEETS_ID,
  'Grade 2': GRADE2_DECK_ID,
  'Grade 5': GRADE5_DECK_ID,
}
export const gradeSlugs: Record<BetaGrade, string> = {
  Kindergarten: 'kindergarten',
  'Grade 2': 'grade2',
  'Grade 5': 'grade5',
}
export type CurriculumSnapshot = {
  schema: 1
  grade: BetaGrade
  retrievedAt: string
  sourceModifiedAt: string
  sourceId: string
  contentSha256: string
  payload: CurriculumSourcePayload
  reviewedRecovery?: {
    id: 'grade2-wetland-oct26-v1'
    originalContentSha256: string
    sourceSlideId: string
    sourceModifiedAt: string
    reviewedAt: string
  }
}

export function inspectSnapshot(snapshot: CurriculumSnapshot) {
  const assessment =
    grade5PresentationPreview &&
    snapshot.grade === 'Grade 5' &&
    snapshot.sourceId === GRADE5_ASSESSMENT_SOURCE_ID &&
    snapshot.payload?.sourceType === 'owner-assessment'
  if (
    snapshot.schema !== 1 ||
    !sourceIds[snapshot.grade] ||
    (!assessment && snapshot.sourceId !== sourceIds[snapshot.grade]) ||
    !Number.isFinite(Date.parse(snapshot.retrievedAt)) ||
    !/^[a-f0-9]{64}$/.test(snapshot.contentSha256)
  )
    throw new Error('The curriculum source identity is invalid.')
  let candidates: WeeklyDatasetCandidate[]
  let warnings: string[] = []
  const p = snapshot.payload
  if (grade5PresentationPreview && assessment && p.sourceType === 'owner-assessment') {
    const extraction = extractGrade5Assessment(p)
    candidates = extraction.classification.selectedCandidates
    warnings = extraction.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message)
  } else if (snapshot.grade === 'Kindergarten') {
    if (p.sourceType !== 'google-sheets' || p.spreadsheetId !== snapshot.sourceId)
      throw new Error('Wrong Kindergarten source.')
    candidates = inspectKindergartenWorkbook(p)
  } else {
    if (p.sourceType !== 'google-slides' || p.presentationId !== snapshot.sourceId)
      throw new Error('Wrong Slides source.')
    if (snapshot.grade === 'Grade 5') {
      const extraction = extractGrade5Presentation(p)
      candidates = extraction.classification.selectedCandidates
      warnings = extraction.issues
        .filter((i) => i.severity === 'error' || i.code === 'unchanged_cohort')
        .map((i) => i.message)
    } else candidates = candidatesFromPresentation(p, grade2DeckProfile)
  }
  const valid = candidates.filter((c) => c.status === 'valid')
  if (!valid.length) throw new Error('The source has no valid lessons. The previous curriculum is retained.')
  const malformed = candidates.filter((c) => c.status === 'malformed')
  if (malformed.length) warnings.push(`${malformed.length} empty or incomplete source weeks are excluded.`)
  return { candidates, datasets: valid.map((c) => datasetFromCanonicalCandidate(c)), warnings }
}

export async function validateCurriculum(raw: string, grade: BetaGrade) {
  if (new TextEncoder().encode(raw).byteLength > 2_000_000) throw new Error('Curriculum response is too large.')
  const snapshot = JSON.parse(raw) as CurriculumSnapshot
  if (!snapshot || snapshot.grade !== grade) throw new Error('The source returned the wrong grade.')
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(snapshot.payload)))
  const actual = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
  if (actual !== snapshot.contentSha256) throw new Error('Curriculum checksum does not match.')
  const inspected = inspectSnapshot(snapshot)
  return { snapshot, ...inspected }
}

export async function fetchCurriculum(grade: BetaGrade, signal?: AbortSignal) {
  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {}
  // An owned frame uses the exact source selected by its parent. New frames
  // still receive today's source; a saved-lesson frame gets its original one.
  const frame = typeof window === 'undefined' ? null : (window.frameElement as HTMLIFrameElement | null)
  if (env.VITE_RECONCILIATION_PREVIEW === 'true' && frame?.dataset.familySlot && frame.dataset.familySource) {
    const loaded = await validateCurriculum(frame.dataset.familySource, grade)
    signal?.throwIfAborted()
    return loaded
  }
  signal?.throwIfAborted()
  const retained = async () =>
    (await import('./curriculumCache.ts')).readRetainedCurriculum(
      localStorage,
      grade,
      signal,
      automaticCurriculumPreview,
    )
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return retained()
  const base = automaticCurriculumPreview
    ? automaticCurriculumEndpoint
    : env.VITE_CURRICULUM_URL || `${env.BASE_URL || '/'}curriculum/beta`
  const requestSignal = automaticCurriculumPreview
    ? AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(30_000)])
    : signal
  let response: Response
  try {
    response = await fetch(`${base}/${gradeSlugs[grade]}.json`, { cache: 'no-store', signal: requestSignal })
  } catch (error) {
    signal?.throwIfAborted()
    if (!(error instanceof TypeError) && !(automaticCurriculumPreview && requestSignal?.aborted)) throw error
    return retained()
  }
  if (automaticCurriculumPreview && (response.status === 429 || response.status >= 500)) return retained()
  if (!response.ok) throw new Error(`Curriculum update failed (${response.status}).`)
  let body: string
  try {
    body = await response.text()
  } catch (error) {
    // A network cut can occur after headers have arrived. Only transport
    // failures may use retained material; parsing/validation remain outside.
    signal?.throwIfAborted()
    if (!(error instanceof TypeError) && !(automaticCurriculumPreview && requestSignal?.aborted)) throw error
    return retained()
  }
  let loaded: Awaited<ReturnType<typeof validateCurriculum>>
  try {
    loaded = await validateCurriculum(body, grade)
    if (grade2WetlandReviewPreview && grade === 'Grade 2') {
      const recovered = await recoverGrade2Wetland(loaded.snapshot)
      if (recovered !== loaded.snapshot) loaded = await validateCurriculum(JSON.stringify(recovered), grade)
    }
    signal?.throwIfAborted()
    if (typeof localStorage !== 'undefined') {
      const cache = await import('./curriculumCache.ts')
      if (automaticCurriculumPreview) await cache.retainAutomaticCurriculum(localStorage, loaded.snapshot, signal)
      else cache.retainValidatedCurriculum(localStorage, loaded.snapshot)
    }
  } catch (error) {
    signal?.throwIfAborted()
    if (!automaticCurriculumPreview) throw error
    // Reject the new source, but a separately revalidated prior source can still
    // reopen saved work. Never cache rejected bytes or silently hide the failure.
    try {
      const previous = await retained()
      previous.warnings.push(
        `Automatic refresh rejected: ${error instanceof Error ? error.message : 'Invalid teacher source'}. Using the last validated teacher lesson.`,
      )
      return previous
    } catch {
      signal?.throwIfAborted()
      throw error
    }
  }
  if (response.headers.get('X-Curriculum-Warning'))
    loaded.warnings.push('Automatic refresh is unavailable. The last validated teacher snapshot is being served.')
  return loaded
}
