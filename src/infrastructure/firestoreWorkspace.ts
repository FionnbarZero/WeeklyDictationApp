import type {
  ChildWorkspaceCapabilities,
  ChildWorkspaceScope,
  FamilyWorkspacePort,
  LocalWorkspacePort,
} from '../application/workspace/index.ts'
import { APP_STATE_KEY, LEGACY_ATTEMPTS_KEY, resolveDatasetLifecycles } from '../domain.ts'
import type { AuthUser } from '../firebaseClient.ts'
import {
  abandonSession,
  cloudAcquisitionCheckpointAlreadyCommitted,
  cloudDataToAppState,
  cloudWarmupTransitionAlreadyCommitted,
  commitCloudAcquisitionCheckpoint,
  commitCloudWarmupTransition,
  ensureCloudWarmupSeed,
  ensureParentFamily,
  getCloudAdaptiveState,
  listAcquisitionProgressions,
  listChildAttempts,
  listChildren,
  listAllDatasetWords,
  listDatasets,
  listDistractorTargetObservations,
  listScores,
  listSessions,
  listWarmupAttempts,
  listWarmupGraphPoints,
  listWarmupMastery,
  listWarmupQueueEntries,
  listWarmupRotations,
  listWarmupTransitions,
  listWarmupVisits,
  updateCloudSession,
} from '../firestoreClient.ts'
import { lifecycleStrategyForGradeAndSchoolYear } from '../lifecycle/registry.ts'
import {
  readPendingAcquisitionJournal,
  removePendingAcquisitionCheckpoint,
} from '../persistence/acquisitionPendingJournal.ts'
import { readPendingWarmupJournal, removePendingWarmupTransition } from '../persistence/warmup/pendingJournal.ts'

const childIds = (scope: ChildWorkspaceScope) => [scope.familyId, scope.childId] as const

function readStorage(storage: Storage, key: string) {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

export function createFirestoreWorkspaceCapabilities(storage: Storage): {
  child: ChildWorkspaceCapabilities
  family: FamilyWorkspacePort<AuthUser>
  local: LocalWorkspacePort
} {
  return {
    local: {
      readApplicationState: () => readStorage(storage, APP_STATE_KEY),
      readLegacyAttempts: () => readStorage(storage, LEGACY_ATTEMPTS_KEY),
      writeApplicationState: (state) => {
        try {
          storage.setItem(APP_STATE_KEY, JSON.stringify(state))
          return true
        } catch {
          return false
        }
      },
      readPendingAcquisition: () => readPendingAcquisitionJournal(storage),
      acknowledgeAcquisition: (transitionId) => removePendingAcquisitionCheckpoint(storage, transitionId),
      readPendingWarmup: () => readPendingWarmupJournal(storage),
      acknowledgeWarmup: (transitionId) => removePendingWarmupTransition(storage, transitionId),
    },
    family: {
      ensureFamily: async (user, signal) => (await ensureParentFamily(user, signal)).family,
      listChildren: (familyId, signal) => listChildren(familyId, signal),
    },
    child: {
      reads: {
        listDatasets: (signal) => listDatasets(signal),
        listDatasetWords: (signal) => listAllDatasetWords(signal),
        listSessions: (scope, signal) => listSessions(...childIds(scope), signal),
        listAttempts: (scope, signal) => listChildAttempts(...childIds(scope), signal),
        listScores: (scope, signal) => listScores(...childIds(scope), signal),
        readAdaptiveState: (scope, signal) => getCloudAdaptiveState(...childIds(scope), signal),
        listAcquisitionProgressions: (scope, signal) => listAcquisitionProgressions(...childIds(scope), signal),
        listDistractorTargetObservations: (scope, signal) =>
          listDistractorTargetObservations(...childIds(scope), signal),
        listWarmupVisits: (scope, signal) => listWarmupVisits(...childIds(scope), signal),
        listWarmupQueueEntries: (scope, signal) => listWarmupQueueEntries(...childIds(scope), signal),
        listWarmupMastery: (scope, signal) => listWarmupMastery(...childIds(scope), signal),
        listWarmupReceipts: (scope, signal) => listWarmupTransitions(...childIds(scope), signal),
        listWarmupAttempts: (scope, signal) => listWarmupAttempts(...childIds(scope), signal),
        listWarmupGraphPoints: (scope, signal) => listWarmupGraphPoints(...childIds(scope), signal),
        listWarmupRotations: (scope, signal) => listWarmupRotations(...childIds(scope), signal),
      },
      assembly: {
        assembleCloudState: (records, scope) =>
          cloudDataToAppState(
            records.datasets,
            records.scores,
            records.sessions,
            records.attempts.filter((attempt) => attempt.completionStatus === 'complete'),
            scope.childId,
            scope.grade,
            records.adaptiveState,
            records.acquisitionProgressions,
            records.distractorTargetObservations,
            scope.schoolYear,
          ),
      },
      reconciliation: {
        markAcquisitionPartial: async (scope, session) => {
          await updateCloudSession(...childIds(scope), session, { status: 'partial' })
        },
        abandonTestReview: async (scope, session) => {
          await abandonSession(...childIds(scope), session)
        },
      },
      recovery: {
        readPendingAcquisition: () => readPendingAcquisitionJournal(storage),
        acquisitionAlreadyCommitted: (scope, checkpoint) =>
          cloudAcquisitionCheckpointAlreadyCommitted(...childIds(scope), checkpoint),
        commitAcquisitionCheckpoint: (scope, envelope, checkpoint) =>
          commitCloudAcquisitionCheckpoint(...childIds(scope), envelope, checkpoint),
        acknowledgeAcquisition: (transitionId) => removePendingAcquisitionCheckpoint(storage, transitionId),
        readPendingWarmup: () => readPendingWarmupJournal(storage),
        warmupTransitionAlreadyCommitted: (scope, transition) =>
          cloudWarmupTransitionAlreadyCommitted(...childIds(scope), transition),
        ensureWarmupSeed: (scope, visit, mastery, rotations) =>
          ensureCloudWarmupSeed(...childIds(scope), visit, mastery, rotations),
        commitWarmupTransition: (scope, transition) => commitCloudWarmupTransition(...childIds(scope), transition),
        acknowledgeWarmup: (transitionId) => removePendingWarmupTransition(storage, transitionId),
        resolveLifecycle: (scope, datasets, at) => {
          if (!lifecycleStrategyForGradeAndSchoolYear(scope.grade, scope.schoolYear)) return null
          return resolveDatasetLifecycles([...datasets], at)
        },
      },
    },
  }
}
