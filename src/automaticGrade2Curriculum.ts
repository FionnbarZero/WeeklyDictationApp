import { createInitialState, type AppState } from './domain.ts'
import {
  GRADE2_CURRICULUM_SOURCE_PATH,
  parseGrade2CurriculumSnapshot,
  type Grade2CurriculumSnapshot,
} from './curriculum/grade2CurriculumSnapshot.ts'
import { hydrateLocalStateFromReadOnlySource } from './localHydration.ts'

const MAX_CURRICULUM_SNAPSHOT_BYTES = 1_000_000

export type AutomaticGrade2Curriculum = {
  snapshot: Grade2CurriculumSnapshot
  datasetCount: number
}

export function hydrateAutomaticGrade2Curriculum(state: AppState, snapshot: Grade2CurriculumSnapshot) {
  const hydration = hydrateLocalStateFromReadOnlySource(state, snapshot.presentation)
  if (hydration.batch.outcomes.some((outcome) => outcome.status === 'error' || outcome.status === 'conflict')) {
    throw new Error(
      'The Google Slides curriculum conflicts with existing browser lessons. Existing lessons and progress were preserved.',
    )
  }
  return hydration.state
}

async function sha256(value: string) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function fetchAutomaticGrade2Curriculum(
  options: { fetchImpl?: typeof fetch; baseUrl?: string; signal?: AbortSignal } = {},
): Promise<AutomaticGrade2Curriculum> {
  if (
    import.meta.env?.VITE_RECONCILIATION_PREVIEW === 'true' &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('family-preview') === '1'
  ) {
    const { fetchCurriculum } = await import('./familyBeta/curriculum.ts')
    const loaded = await fetchCurriculum('Grade 2', options.signal)
    const snapshot: Grade2CurriculumSnapshot = {
      schema: 'weekly-dictation-grade2-curriculum-snapshot-v1',
      source: {
        type: 'google-slides',
        documentId: '10gpdTFqwBhWf9pD9HzF8AkD9Zyg7nBUSeTCGXuS8ky4',
        documentUrl: `https://docs.google.com/presentation/d/${loaded.snapshot.sourceId}`,
        retrievedAt: loaded.snapshot.retrievedAt,
        contentSha256: '',
      },
      presentation: loaded.snapshot.payload as Grade2CurriculumSnapshot['presentation'],
    }
    snapshot.source.contentSha256 = await sha256(JSON.stringify(snapshot.presentation))
    return { snapshot, datasetCount: loaded.datasets.length }
  }
  const fetchImpl = options.fetchImpl || fetch
  const baseUrl = options.baseUrl ?? import.meta.env.BASE_URL
  const response = await fetchImpl(`${baseUrl}${GRADE2_CURRICULUM_SOURCE_PATH}`, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal: options.signal,
  })
  if (!response.ok) throw new Error(`The curriculum source returned HTTP ${response.status}.`)
  const raw = await response.text()
  if (new TextEncoder().encode(raw).byteLength > MAX_CURRICULUM_SNAPSHOT_BYTES) {
    throw new Error('The curriculum source exceeded the one-megabyte safety limit.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('The curriculum source did not return valid JSON.')
  }
  const snapshot = parseGrade2CurriculumSnapshot(parsed)
  if ((await sha256(JSON.stringify(snapshot.presentation))) !== snapshot.source.contentSha256) {
    throw new Error('The curriculum source content checksum did not match its reviewed metadata.')
  }
  const validation = hydrateLocalStateFromReadOnlySource(createInitialState(), snapshot.presentation)
  const unsafeOutcome = validation.batch.outcomes.some(
    (outcome) => outcome.status === 'error' || outcome.status === 'conflict',
  )
  if (
    validation.batch.status !== 'ok' ||
    unsafeOutcome ||
    validation.batch.summary.datasetCount !== snapshot.presentation.slides?.length
  ) {
    throw new Error('The Google Slides curriculum snapshot failed canonical dataset validation.')
  }
  return { snapshot, datasetCount: validation.batch.summary.datasetCount }
}
