import { prepareAcquisitionProgress } from '../application/acquisitionPersistence.ts'
import { retainGrade2Editions } from '../curriculum/grade2Revisions.ts'
import { APP_STATE_KEY, createInitialState } from '../domain.ts'
import { hydrateLocalStateFromReadOnlySource } from '../localHydration.ts'
import { validateCurriculum } from './curriculum.ts'
import { practiceWorkspaceStorage } from './practiceWorkspaceStorage.ts'

export const repairExampleProfile = {
  id: 'w1-label-example',
  nickname: 'Correction example',
  grade: 'Grade 2' as const,
  active: true,
}

/** Opt-in isolated test learner only. Never reseed, replace or reset existing work. */
export async function prepareRepairExample(storage: Storage) {
  const child = repairExampleProfile.id
  if (Object.keys(storage).some((key) => key.startsWith(`family-beta-activity:${child}:`))) return
  const response = await fetch('/curriculum/beta/grade2.json')
  if (!response.ok) throw new Error('The repair example curriculum is unavailable.')
  const raw = await response.text()
  await validateCurriculum(raw, 'Grade 2')
  const incoming = hydrateLocalStateFromReadOnlySource(createInitialState(), JSON.parse(raw).payload).state.datasets
  const corrected = incoming.find((d) => d.startDate === '2026-10-13')
  if (!corrected || corrected.words.map((w) => w.text).join('、') !== '走、最、哪里、家、住')
    throw new Error('This curriculum does not match the retained repair example. No records were changed.')
  const words = ['strokeorder', ...corrected.words.map((w) => w.text)].map((text, i) => ({
    ...corrected.words[0],
    id: `${corrected.id}-${i + 1}`,
    text,
  }))
  const old = { ...corrected, words, vocabulary: { ...corrected.vocabulary!, tier1: words } }
  const prepared = prepareAcquisitionProgress(
    createInitialState([old, ...incoming.filter((d) => d.id !== old.id)]),
    child,
    old,
    '2026-10-14T10:00:00.000Z',
    () => 0,
    true,
  )
  if (prepared.status !== 'ready') throw new Error('The synthetic repair example could not be prepared.')
  if (Object.keys(storage).some((key) => key.startsWith(`family-beta-activity:${child}:`))) return
  practiceWorkspaceStorage(storage, child).setItem(
    APP_STATE_KEY,
    JSON.stringify(retainGrade2Editions(prepared.state, incoming)),
  )
}
