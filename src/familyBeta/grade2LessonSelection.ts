import { originalDatasetId, sourceGrade2Datasets } from '../curriculum/grade2Revisions.ts'
import type { AppState, Dataset } from '../domain.ts'

/** Only ordinary writing uses AppState checkpoints. Reading retains its own pinned store. */
export function grade2WritingDatasets(
  state: AppState,
  incoming: readonly Dataset[],
  childId: string,
  retired: (envelope: NonNullable<AppState['acquisitionProgressEnvelopes']>[number]) => boolean = () => false,
) {
  return sourceGrade2Datasets(state, incoming).map((latest) => {
    const editions = state.datasets.filter((dataset) => originalDatasetId(dataset) === originalDatasetId(latest))
    const unfinished = editions.filter((dataset) => {
      const envelope = state.acquisitionProgressEnvelopes?.find(
        (item) => item.childId === childId && item.datasetId === dataset.id && !retired(item),
      )
      if (!envelope) return false
      if (!envelope.flow.teachingComplete) return true
      // A completed teaching loop with an unsubmitted score visit remains pinned.
      const facts = [
        ...state.results
          .filter((item) => item.childId === childId && item.datasetId === dataset.id && item.phase === 'acquisition')
          .map((item) => ({ sessionId: item.sessionId, at: item.completedAt })),
        ...state.distractorTargetObservations
          .filter((item) => item.childId === childId && item.datasetId === dataset.id)
          .map((item) => ({ sessionId: item.sessionId, at: item.reviewedAt })),
      ].sort((a, b) => b.at.localeCompare(a.at))
      return (
        facts.length > 0 &&
        !state.completedSessions.some(
          (item) => item.childId === childId && item.id === facts[0].sessionId && item.complete,
        )
      )
    })
    if (unfinished.length > 1)
      throw new Error('Multiple unfinished editions need reconciliation. All lessons were preserved.')
    return unfinished[0] || latest
  })
}
