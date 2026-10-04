import type { ChildWorkspaceReadPort, ChildWorkspaceRecords, ChildWorkspaceScope } from './contracts.ts'
import { throwIfWorkspaceSynchronizationAborted } from './cancellation.ts'

export async function readChildWorkspace(
  scope: ChildWorkspaceScope,
  reads: ChildWorkspaceReadPort,
  signal: AbortSignal,
): Promise<ChildWorkspaceRecords> {
  throwIfWorkspaceSynchronizationAborted(signal)
  const [
    rawDatasets,
    datasetWords,
    sessions,
    rawAttempts,
    scores,
    adaptiveState,
    acquisitionProgressions,
    distractorTargetObservations,
    visits,
    queueEntries,
    mastery,
    receipts,
    warmupAttempts,
    graphPoints,
    rotations,
  ] = await Promise.all([
    reads.listDatasets(signal),
    reads.listDatasetWords(signal),
    reads.listSessions(scope, signal),
    reads.listAttempts(scope, signal),
    reads.listScores(scope, signal),
    reads.readAdaptiveState(scope, signal),
    reads.listAcquisitionProgressions(scope, signal),
    reads.listDistractorTargetObservations(scope, signal),
    reads.listWarmupVisits(scope, signal),
    reads.listWarmupQueueEntries(scope, signal),
    reads.listWarmupMastery(scope, signal),
    reads.listWarmupReceipts(scope, signal),
    reads.listWarmupAttempts(scope, signal),
    reads.listWarmupGraphPoints(scope, signal),
    reads.listWarmupRotations(scope, signal),
  ])
  throwIfWorkspaceSynchronizationAborted(signal)

  const readableSessions = sessions.filter((session) => session.status !== 'abandoned')
  const readableSessionIds = new Set(readableSessions.map((session) => session.id))
  const attempts = rawAttempts.filter((attempt) => readableSessionIds.has(attempt.sessionId))
  const wordsByDataset = new Map<string, typeof datasetWords>()
  for (const word of datasetWords) {
    const words = wordsByDataset.get(word.datasetId) || []
    words.push(word)
    wordsByDataset.set(word.datasetId, words)
  }
  const datasets = rawDatasets.map((dataset) =>
    dataset.words?.length ? dataset : { ...dataset, words: wordsByDataset.get(dataset.id) || [] },
  )
  throwIfWorkspaceSynchronizationAborted(signal)

  return {
    datasets,
    sessions: readableSessions,
    attempts,
    scores,
    adaptiveState,
    acquisitionProgressions,
    distractorTargetObservations,
    warmup: {
      visits,
      queueEntries,
      mastery,
      receipts,
      attempts: warmupAttempts,
      graphPoints,
      rotations,
    },
  }
}
