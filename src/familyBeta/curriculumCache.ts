import { type CurriculumSnapshot, validateCurriculum } from './curriculum.ts'
import type { BetaGrade } from './model.ts'

type Store = Pick<Storage, 'getItem' | 'setItem'>
const key = (grade: BetaGrade, automatic = false) =>
  `family-beta-validated-${automatic ? 'automatic-' : ''}curriculum-v1:${grade}`

/** Public teacher material only; never a child checkpoint or sync winner. */
export function retainValidatedCurriculum(storage: Store, snapshot: CurriculumSnapshot, automatic = false) {
  const raw = JSON.stringify(snapshot)
  if (storage.getItem(key(snapshot.grade, automatic)) !== raw) storage.setItem(key(snapshot.grade, automatic), raw)
  if (storage.getItem(key(snapshot.grade, automatic)) !== raw)
    throw new Error(
      'The teacher lesson could not be retained for offline reopening. Keep this browser’s data and retry.',
    )
}

export async function readRetainedCurriculum(
  storage: Store,
  grade: BetaGrade,
  signal?: AbortSignal,
  automatic = false,
) {
  const raw = storage.getItem(key(grade, automatic))
  if (!raw)
    throw new Error(
      automatic
        ? 'No previously validated teacher lesson is available in this browser. Reconnect or retry the teacher update.'
        : 'No validated teacher lesson is available offline yet. Reconnect to load this grade.',
    )
  // Recheck source identity, grade, checksum and dates; do not trust local bytes
  // or infer a new lesson from old practice records. Preserve a bad cache intact.
  const loaded = await validateCurriculum(raw, grade)
  signal?.throwIfAborted()
  return {
    ...loaded,
    offline: true as const,
    warnings: [
      ...loaded.warnings,
      automatic
        ? 'Teacher updates are temporarily unavailable. Using the last validated teacher lesson on this device; new targets cannot be checked yet.'
        : 'Offline curriculum: using the last validated teacher lesson on this device. New teacher targets cannot be checked until you reconnect.',
    ],
  }
}

/** Public source cache only. Lock and revalidate inside the lock so an older
 * response from another tab cannot replace a newer validated teacher source. */
export async function retainAutomaticCurriculum(storage: Store, snapshot: CurriculumSnapshot, signal?: AbortSignal) {
  if (typeof navigator === 'undefined' || !navigator.locks)
    throw new Error('This browser cannot safely retain automatic curriculum updates. Saved work is unchanged.')
  await navigator.locks.request(`ninja-automatic-curriculum:${snapshot.grade}`, async () => {
    signal?.throwIfAborted()
    const previous = storage.getItem(key(snapshot.grade, true))
    if (previous) {
      const old = await validateCurriculum(previous, snapshot.grade)
      const next = await validateCurriculum(JSON.stringify(snapshot), snapshot.grade)
      signal?.throwIfAborted()
      if (Date.parse(snapshot.retrievedAt) < Date.parse(old.snapshot.retrievedAt))
        throw new Error('An older curriculum response was ignored. The newer validated lessons are retained.')
      const ids = new Set(next.datasets.map((dataset) => dataset.id))
      if (old.datasets.some((dataset) => !ids.has(dataset.id)))
        throw new Error('The update omits an existing valid week. The previous curriculum is retained.')
    }
    signal?.throwIfAborted()
    retainValidatedCurriculum(storage, snapshot, true)
  })
}
