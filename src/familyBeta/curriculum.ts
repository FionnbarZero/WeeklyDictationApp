import { candidatesFromPresentation } from '../curriculum/adapters/googleSlides.ts'
import { extractGrade5Presentation } from '../curriculum/adapters/grade5GoogleSlides.ts'
import { datasetFromCanonicalCandidate } from '../curriculum/datasetProjection.ts'
import type { CurriculumSourcePayload, WeeklyDatasetCandidate } from '../curriculum/model.ts'
import { grade2DeckProfile } from '../slidesImporter.ts'
import { inspectKindergartenWorkbook } from '../kindergartenSheetsImporter.ts'
import { GRADE2_DECK_ID, GRADE5_DECK_ID, KINDERGARTEN_SHEETS_ID } from '../config.ts'
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
}

export function inspectSnapshot(snapshot: CurriculumSnapshot) {
  if (
    snapshot.schema !== 1 ||
    !sourceIds[snapshot.grade] ||
    snapshot.sourceId !== sourceIds[snapshot.grade] ||
    !Number.isFinite(Date.parse(snapshot.retrievedAt)) ||
    !/^[a-f0-9]{64}$/.test(snapshot.contentSha256)
  )
    throw new Error('The curriculum source identity is invalid.')
  let candidates: WeeklyDatasetCandidate[]
  let warnings: string[] = []
  const p = snapshot.payload
  if (snapshot.grade === 'Kindergarten') {
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
  const frame = typeof window === 'undefined' ? null : window.frameElement as HTMLIFrameElement | null
  if (env.VITE_RECONCILIATION_PREVIEW === 'true' && frame?.dataset.familySlot && frame.dataset.familySource) {
    const loaded = await validateCurriculum(frame.dataset.familySource, grade)
    signal?.throwIfAborted()
    return loaded
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine)
    throw new Error('The device is offline. Reopen an original lesson from Saved lessons.')
  const base = env.VITE_CURRICULUM_URL || `${env.BASE_URL || '/'}curriculum/beta`
  const response = await fetch(`${base}/${gradeSlugs[grade]}.json`, { cache: 'no-store', signal })
  if (!response.ok) throw new Error(`Curriculum update failed (${response.status}).`)
  const loaded = await validateCurriculum(await response.text(), grade)
  if (response.headers.get('X-Curriculum-Warning'))
    loaded.warnings.push('Automatic refresh is unavailable. The last validated teacher snapshot is being served.')
  return loaded
}
