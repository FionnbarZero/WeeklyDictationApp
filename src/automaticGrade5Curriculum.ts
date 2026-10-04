import { extractGrade5Presentation, type Grade5SourceExtraction } from './curriculum/adapters/grade5GoogleSlides.ts'
import {
  GRADE5_CURRICULUM_SOURCE_PATH,
  parseGrade5CurriculumSnapshot,
  type Grade5CurriculumSnapshot,
} from './curriculum/grade5CurriculumSnapshot.ts'

const MAX_CURRICULUM_SNAPSHOT_BYTES = 5_000_000

export type AutomaticGrade5Curriculum = {
  snapshot: Grade5CurriculumSnapshot
  extraction: Grade5SourceExtraction
}

async function sha256(value: string) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function validateGrade5CurriculumExtraction(snapshot: Grade5CurriculumSnapshot) {
  const extraction = extractGrade5Presentation(snapshot.presentation)
  const hasErrors = extraction.issues.some((issue) => issue.severity === 'error')
  if (
    hasErrors ||
    extraction.classification.selectedCandidates.length === 0 ||
    extraction.progressionEvidence.length === 0
  ) {
    throw new Error('The Grade 5 curriculum snapshot failed canonical lifecycle validation.')
  }
  return extraction
}

export async function fetchAutomaticGrade5Curriculum(
  options: { fetchImpl?: typeof fetch; baseUrl?: string; signal?: AbortSignal } = {},
): Promise<AutomaticGrade5Curriculum> {
  const fetchImpl = options.fetchImpl || fetch
  const baseUrl = options.baseUrl ?? import.meta.env.BASE_URL
  const response = await fetchImpl(`${baseUrl}${GRADE5_CURRICULUM_SOURCE_PATH}`, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal: options.signal,
  })
  if (!response.ok) throw new Error(`The Grade 5 curriculum source returned HTTP ${response.status}.`)
  const raw = await response.text()
  if (new TextEncoder().encode(raw).byteLength > MAX_CURRICULUM_SNAPSHOT_BYTES) {
    throw new Error('The Grade 5 curriculum source exceeded the five-megabyte safety limit.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('The Grade 5 curriculum source did not return valid JSON.')
  }
  const snapshot = parseGrade5CurriculumSnapshot(parsed)
  if ((await sha256(JSON.stringify(snapshot.presentation))) !== snapshot.source.contentSha256) {
    throw new Error('The Grade 5 curriculum source checksum did not match its reviewed metadata.')
  }
  return { snapshot, extraction: validateGrade5CurriculumExtraction(snapshot) }
}
