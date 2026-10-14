import {
  GRADE2_CURRICULUM_SOURCE_PATH,
  type Grade2CurriculumSnapshot,
  parseGrade2CurriculumSnapshot,
} from './curriculum/grade2CurriculumSnapshot.ts'
import { retainGrade2Editions } from './curriculum/grade2Revisions.ts'
import { type AppState, createInitialState } from './domain.ts'
import { hydrateLocalStateFromReadOnlySource } from './localHydration.ts'

export { grade2WritingDatasets } from './familyBeta/grade2LessonSelection.ts'

const MAX_CURRICULUM_SNAPSHOT_BYTES = 1_000_000

export type AutomaticGrade2Curriculum = {
  snapshot: Grade2CurriculumSnapshot
  datasetCount: number
}

export function hydrateAutomaticGrade2Curriculum(
  state: AppState,
  snapshot: Grade2CurriculumSnapshot,
  retainCorrections = false,
  options: { allowIncompleteWeeks?: boolean } = {},
) {
  const hydration = hydrateLocalStateFromReadOnlySource(
    retainCorrections ? createInitialState() : state,
    snapshot.presentation,
  )
  // The live family source may include a teacher's unfinished future slide.
  // Its validated subset can load, but source collisions are never ignored.
  // Reviewed standalone snapshots retain their existing strict contract.
  if (
    hydration.batch.outcomes.some(
      (outcome) => outcome.status === 'conflict' || (outcome.status === 'error' && !options.allowIncompleteWeeks),
    )
  ) {
    throw new Error(
      'The Google Slides curriculum conflicts with existing browser lessons. Existing lessons and progress were preserved.',
    )
  }
  if (
    options.allowIncompleteWeeks &&
    !hydration.batch.outcomes.some((outcome) => outcome.candidateStatus === 'valid' && outcome.dataset)
  )
    throw new Error(
      'The Google Slides source has no valid weekly lessons. Existing lessons and progress were preserved.',
    )
  return retainCorrections ? retainGrade2Editions(state, hydration.state.datasets) : hydration.state
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
