import { acquisitionProgressionId } from '../acquisition/persistence/identity.ts'
import { COPY_MEMORY_WRITING_POLICY, createWritingLesson } from '../application/writingAcquisition/lesson.ts'
import { originalDatasetId, sourceGrade2Datasets } from '../curriculum/grade2Revisions.ts'
import { withoutStrokeOrderLabels } from '../curriculum/instructionLabels.ts'
import { type AppState, type Dataset, loadState } from '../domain.ts'
import { isCanonicalDataset } from '../slidesImporter.ts'
import { envelopeIdentity, isAcquisitionRetired, retireAcquisition } from './acquisitionRetirement.ts'
import { grade2WritingDatasets } from './grade2LessonSelection.ts'
import { readPracticeWorkspaceState } from './practiceWorkspaceStorage.ts'

type Store = Pick<Storage, 'getItem' | 'setItem'>
export function correctedWritingAttempts(
  state: AppState,
  incoming: readonly Dataset[],
  childId: string,
  storage: Store,
) {
  const latest = sourceGrade2Datasets(state, incoming)
  const selected = grade2WritingDatasets(state, incoming, childId, (e) => isAcquisitionRetired(storage, e))
  return selected.flatMap((old) => {
    const correctedWords = withoutStrokeOrderLabels(old.words.map((w) => w.text))
    if (correctedWords.length === old.words.length) return []
    const replacement = latest.find((d) => originalDatasetId(d) === originalDatasetId(old) && d.id !== old.id)
    const envelope = state.acquisitionProgressEnvelopes?.find(
      (e) => e.childId === childId && e.datasetId === old.id && !isAcquisitionRetired(storage, e),
    )
    if (!replacement || !envelope) return []
    // A targeted label correction is not authority to replace other vocabulary.
    if (
      replacement.startDate !== old.startDate ||
      replacement.endDate !== old.endDate ||
      JSON.stringify(correctedWords) !== JSON.stringify(replacement.words.map((w) => w.text))
    )
      return []
    if (!isCanonicalDataset(replacement)) return []
    createWritingLesson(replacement, COPY_MEMORY_WRITING_POLICY)
    return [{ old, replacement, envelope }]
  })
}

export function startCorrectedWritingAttempt(
  storage: Store,
  state: AppState,
  incoming: readonly Dataset[],
  childId: string,
  progressionId: string,
) {
  const proposal = correctedWritingAttempts(state, incoming, childId, storage).find(
    (p) => p.envelope.id === progressionId,
  )
  if (
    !proposal ||
    proposal.envelope.grade !== 'Grade 2' ||
    proposal.envelope.tier !== 'tier-1' ||
    acquisitionProgressionId(envelopeIdentity(proposal.envelope)) !== progressionId
  )
    throw new Error('This correction is no longer available. All saved work was preserved.')
  const raw = readPracticeWorkspaceState(storage, childId)
  if (!raw) throw new Error('Saved work could not be verified. Nothing was changed.')
  const current = loadState(raw)
  const fresh = correctedWritingAttempts(current, incoming, childId, storage).find(
    (p) => p.envelope.id === progressionId,
  )
  if (
    !fresh ||
    JSON.stringify(fresh) !== JSON.stringify(proposal) ||
    readPracticeWorkspaceState(storage, childId) !== raw
  )
    throw new Error('The lesson changed in another window. Reopen Writing and try again; all work was preserved.')
  // Add one immutable marker; never rewrite/delete checkpoints, answers or scores.
  retireAcquisition(storage, proposal.envelope)
}
