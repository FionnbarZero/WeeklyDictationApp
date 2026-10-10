import type { AppState } from '../domain.ts'

type Progression = AppState['acquisitionProgressions'][number]
type Envelope = NonNullable<AppState['acquisitionProgressEnvelopes']>[number]
type Receipt = NonNullable<AppState['acquisitionTransitionReceipts']>[number]
type PendingCheckpoint = NonNullable<AppState['acquisitionPendingCheckpoints']>[number]

export type ActivityCheckpointPartition = {
  activityId: string
  progressions: readonly Progression[]
  envelopes: readonly Envelope[]
  transitionReceipts: readonly Receipt[]
  pendingCheckpoints: readonly PendingCheckpoint[]
}

export type ActivityCheckpointPartitionResult =
  | { status: 'ready'; activities: readonly ActivityCheckpointPartition[] }
  | { status: 'blocked'; reason: string }

const identity = (
  value: Pick<Progression, 'childId' | 'datasetId' | 'grade'> | Pick<Envelope, 'childId' | 'datasetId' | 'grade'>,
) => `${value.childId}\u0000${value.datasetId}\u0000${value.grade}`

function uniqueById<T extends { id: string }>(values: readonly T[], label: string) {
  const result = new Map<string, T>()
  for (const value of values) {
    if (result.has(value.id)) throw new Error(`${label} contains duplicate activity ${value.id}.`)
    result.set(value.id, value)
  }
  return result
}

/**
 * Characterizes one mutable checkpoint per acquisition activity. This is
 * intentionally read-only: it does not merge competing copies or select a
 * winner. Unknown references block the future migration instead of silently
 * dropping a transition that could contain a reviewed answer.
 */
export function partitionActivityCheckpoints(state: AppState): ActivityCheckpointPartitionResult {
  try {
    const progressions = uniqueById(state.acquisitionProgressions, 'Acquisition progressions')
    const envelopes = uniqueById(state.acquisitionProgressEnvelopes || [], 'Acquisition envelopes')
    const activityIds = new Set([...progressions.keys(), ...envelopes.keys()])
    for (const [id, progression] of progressions) {
      const envelope = envelopes.get(id)
      if (envelope && identity(progression) !== identity(envelope))
        return { status: 'blocked', reason: `Activity ${id} has mismatched progression identity.` }
    }
    const transitionReceipts = state.acquisitionTransitionReceipts || []
    const pendingCheckpoints = state.acquisitionPendingCheckpoints || []
    if (transitionReceipts.some((receipt) => !activityIds.has(receipt.progressionId)))
      return { status: 'blocked', reason: 'A transition receipt references an unknown activity.' }
    if (pendingCheckpoints.some((checkpoint) => !activityIds.has(checkpoint.progressionId)))
      return { status: 'blocked', reason: 'A pending checkpoint references an unknown activity.' }
    const activities = [...activityIds].sort().map((activityId) => ({
      activityId,
      progressions: progressions.has(activityId) ? [progressions.get(activityId)!] : [],
      envelopes: envelopes.has(activityId) ? [envelopes.get(activityId)!] : [],
      transitionReceipts: transitionReceipts.filter((receipt) => receipt.progressionId === activityId),
      pendingCheckpoints: pendingCheckpoints.filter((checkpoint) => checkpoint.progressionId === activityId),
    }))
    return { status: 'ready', activities }
  } catch (error) {
    return { status: 'blocked', reason: error instanceof Error ? error.message : 'Activity checkpoints are invalid.' }
  }
}
