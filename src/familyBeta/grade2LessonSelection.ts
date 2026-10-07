import { acquisitionFactId } from '../acquisition/persistence/identity.ts'
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
          .map((item) => ({ id: item.id, sessionId: item.sessionId })),
        ...state.distractorTargetObservations
          .filter((item) => item.childId === childId && item.datasetId === dataset.id)
          .map((item) => ({ id: item.id, sessionId: item.sessionId })),
      ]
      const unsubmitted = (fact: (typeof facts)[number]) =>
        !state.completedSessions.some((item) => item.childId === childId && item.id === fact.sessionId && item.complete)
      // Receipt revisions order this exact generation without trusting a device
      // clock, or accidentally selecting retained facts from a discarded generation.
      const receipts = (state.acquisitionTransitionReceipts || [])
        .filter((item) => item.progressionId === envelope.id && item.operation === 'answer')
        .sort((a, b) => b.appliedRevision - a.appliedRevision)
      const indexed = new Map(facts.map((fact) => [fact.id, fact]))
      for (const receipt of receipts) {
        const fact =
          indexed.get(acquisitionFactId(receipt.transitionId, 'attempt')) ||
          indexed.get(acquisitionFactId(receipt.transitionId, 'dt-observation'))
        if (fact) return unsubmitted(fact)
      }
      // Older records without verifiable ordering keep any unsubmitted visit pinned.
      return facts.some(unsubmitted)
    })
    if (unfinished.length > 1)
      throw new Error('Multiple unfinished editions need reconciliation. All lessons were preserved.')
    return unfinished[0] || latest
  })
}
