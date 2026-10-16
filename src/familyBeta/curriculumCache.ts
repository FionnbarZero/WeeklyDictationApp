import { validateCurriculum, type CurriculumSnapshot } from './curriculum.ts'
import type { BetaGrade } from './model.ts'

type Store = Pick<Storage, 'getItem' | 'setItem'>
const key = (grade: BetaGrade) => `family-beta-validated-curriculum-v1:${grade}`

/** Public teacher material only; never a child checkpoint or sync winner. */
export function retainValidatedCurriculum(storage: Store, snapshot: CurriculumSnapshot) {
  const raw = JSON.stringify(snapshot)
  if (storage.getItem(key(snapshot.grade)) !== raw) storage.setItem(key(snapshot.grade), raw)
  if (storage.getItem(key(snapshot.grade)) !== raw)
    throw new Error(
      'The teacher lesson could not be retained for offline reopening. Keep this browser’s data and retry.',
    )
}

export async function readRetainedCurriculum(storage: Store, grade: BetaGrade, signal?: AbortSignal) {
  const raw = storage.getItem(key(grade))
  if (!raw) throw new Error('No validated teacher lesson is available offline yet. Reconnect to load this grade.')
  // Recheck source identity, grade, checksum and dates; do not trust local bytes
  // or infer a new lesson from old practice records. Preserve a bad cache intact.
  const loaded = await validateCurriculum(raw, grade)
  signal?.throwIfAborted()
  return {
    ...loaded,
    offline: true as const,
    warnings: [
      ...loaded.warnings,
      'Offline curriculum: using the last validated teacher lesson on this device. New teacher targets cannot be checked until you reconnect.',
    ],
  }
}
