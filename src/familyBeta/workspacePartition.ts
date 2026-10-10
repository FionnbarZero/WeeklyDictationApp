import type { AppState } from '../domain.ts'

/**
 * Characterization boundary for Grade 2's bundled workspace. These lists are
 * deliberately descriptive: callers must not merge the two partitions yet.
 * The mutable side still contains nested history (notably Warmup visits), so
 * the next migration must split those records before automatic arbitration.
 */
export const WORKSPACE_HISTORY_FIELDS = [
  'datasets',
  'results',
  'scores',
  'warmupSessions',
  'completedSessions',
  'legacyRecords',
  'monthlyRotationScores',
  'distractorTargetObservations',
  'datasetImportReferences',
] as const satisfies readonly (keyof AppState)[]

export const WORKSPACE_CHECKPOINT_FIELDS = [
  'childWordStates',
  'rotationCycles',
  'acquisitionProgressions',
  'acquisitionProgressEnvelopes',
  'acquisitionTransitionReceipts',
  'acquisitionPendingCheckpoints',
  'acquisitionProgressQuarantine',
  'adaptiveWarmup',
  'warmupVisitsV1',
  'warmupAttemptsV1',
  'warmupTransitionReceiptsV1',
  'warmupGraphPointsV1',
  'warmupPendingTransitionsV1',
  'warmupMasteryRevisionsV1',
  'warmupCloudQuarantineV1',
] as const satisfies readonly (keyof AppState)[]

export const WORKSPACE_METADATA_FIELDS = ['version'] as const satisfies readonly (keyof AppState)[]

/** Stable reconstruction order keeps the Storage adapter compatible with the
 * shared workspace's optimistic write comparison after partitioning. */
export const WORKSPACE_STATE_FIELDS = [
  'version',
  'datasets',
  'results',
  'scores',
  'warmupSessions',
  'completedSessions',
  'legacyRecords',
  'childWordStates',
  'monthlyRotationScores',
  'rotationCycles',
  'acquisitionProgressions',
  'acquisitionProgressEnvelopes',
  'acquisitionTransitionReceipts',
  'acquisitionPendingCheckpoints',
  'acquisitionProgressQuarantine',
  'adaptiveWarmup',
  'warmupVisitsV1',
  'warmupAttemptsV1',
  'warmupTransitionReceiptsV1',
  'warmupGraphPointsV1',
  'warmupPendingTransitionsV1',
  'warmupMasteryRevisionsV1',
  'warmupCloudQuarantineV1',
  'distractorTargetObservations',
  'datasetImportReferences',
] as const satisfies readonly (keyof AppState)[]

export type WorkspacePartition = {
  metadata: Pick<AppState, 'version'>
  history: Pick<AppState, (typeof WORKSPACE_HISTORY_FIELDS)[number]>
  checkpoint: Pick<AppState, (typeof WORKSPACE_CHECKPOINT_FIELDS)[number]>
}

function pick<T extends readonly (keyof AppState)[]>(state: AppState, fields: T) {
  return Object.fromEntries(fields.map((field) => [field, state[field]])) as Pick<AppState, T[number]>
}

/** Pure characterization only; no merge or winner selection is performed. */
export function partitionWorkspaceState(state: AppState): WorkspacePartition {
  return {
    metadata: pick(state, WORKSPACE_METADATA_FIELDS),
    history: pick(state, WORKSPACE_HISTORY_FIELDS),
    checkpoint: pick(state, WORKSPACE_CHECKPOINT_FIELDS),
  }
}
