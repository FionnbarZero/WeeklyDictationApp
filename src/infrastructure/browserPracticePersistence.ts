import type { AcquisitionCheckpoint, AcquisitionProgressEnvelope } from '../acquisition/persistence/contracts.ts'
import type { AppState, DatasetScore, Word } from '../domain.ts'
import {
  abandonSession,
  cloudAdaptiveStateForSave,
  commitCloudAcquisitionCheckpoint,
  commitCloudWarmupTransition,
  completeCloudSession,
  createChild,
  ensureCloudWarmupSeed,
  finishCloudSession,
  saveCloudAttempt,
  skipCloudTestReview,
  startCloudSession,
  updateChild,
  updateCloudSession,
} from '../firestoreClient.ts'
import {
  appendPendingAcquisitionCheckpoint,
  removePendingAcquisitionCheckpoint,
} from '../persistence/acquisitionPendingJournal.ts'
import type { ChildProfile, CloudAttempt, CloudSession } from '../persistence/cloudRecords.ts'
import { appendPendingWarmupTransition, removePendingWarmupTransition } from '../persistence/warmup/pendingJournal.ts'
import type { CloudWarmupRotation } from '../persistence/warmup/cloudContracts.ts'
import type { VersionedChildMasteryState, WarmupTransition, WarmupVisit } from '../warmup/visits/contracts.ts'

export type CloudPracticeScope = {
  familyId: string
  childId: string
}

export type BrowserPracticePersistence = ReturnType<typeof createBrowserPracticePersistence>

const scopeIds = (scope: CloudPracticeScope) => [scope.familyId, scope.childId] as const

export function createBrowserPracticePersistence(storage: Storage) {
  return {
    local: {
      saveState: (state: AppState) => {
        try {
          storage.setItem('weekly-dictation-state-v2', JSON.stringify(state))
          return true
        } catch {
          return false
        }
      },
    },
    profiles: {
      createChild: (familyId: string, input: Pick<ChildProfile, 'nickname' | 'grade' | 'schoolYear'>) =>
        createChild(familyId, input),
      updateChild: (
        familyId: string,
        childId: string,
        patch: Partial<Pick<ChildProfile, 'nickname' | 'grade' | 'schoolYear' | 'active' | 'gradeEffectiveDate'>>,
      ) => updateChild(familyId, childId, patch),
    },
    acquisition: {
      journal: (checkpoint: AcquisitionCheckpoint<Word>, envelope: AcquisitionProgressEnvelope<Word>) =>
        appendPendingAcquisitionCheckpoint(storage, checkpoint, envelope),
      acknowledge: (transitionId: string) => removePendingAcquisitionCheckpoint(storage, transitionId),
      commit: (
        scope: CloudPracticeScope,
        envelope: AcquisitionProgressEnvelope<Word>,
        checkpoint: AcquisitionCheckpoint<Word>,
      ) => commitCloudAcquisitionCheckpoint(...scopeIds(scope), envelope, checkpoint),
    },
    warmup: {
      journal: (transition: WarmupTransition, baseVisit: WarmupVisit, baseMastery?: VersionedChildMasteryState) =>
        appendPendingWarmupTransition(storage, transition, baseVisit, baseMastery),
      acknowledge: (transitionId: string) => removePendingWarmupTransition(storage, transitionId),
      ensureSeed: (
        scope: CloudPracticeScope,
        visit: WarmupVisit,
        mastery: readonly VersionedChildMasteryState[],
        rotations: readonly CloudWarmupRotation[],
      ) => ensureCloudWarmupSeed(...scopeIds(scope), visit, mastery, rotations),
      commit: (scope: CloudPracticeScope, transition: WarmupTransition) =>
        commitCloudWarmupTransition(...scopeIds(scope), transition),
    },
    sessions: {
      start: (scope: CloudPracticeScope, input: Omit<CloudSession, 'familyId' | 'status' | 'applicationVersion'>) =>
        startCloudSession(...scopeIds(scope), input),
      update: (scope: CloudPracticeScope, session: CloudSession, patch: Partial<CloudSession>) =>
        updateCloudSession(...scopeIds(scope), session, patch),
      abandon: (scope: CloudPracticeScope, session: CloudSession) => abandonSession(...scopeIds(scope), session),
      saveAttempt: (scope: CloudPracticeScope, sessionId: string, attempt: CloudAttempt) =>
        saveCloudAttempt(...scopeIds(scope), sessionId, attempt),
      complete: (
        scope: CloudPracticeScope,
        session: CloudSession,
        attempts: CloudAttempt[],
        scores: DatasetScore[],
        state: AppState,
        completedAt: string,
      ) =>
        completeCloudSession(
          ...scopeIds(scope),
          session,
          attempts,
          scores,
          cloudAdaptiveStateForSave(state, scope.childId, completedAt),
          completedAt,
        ),
      finish: (
        scope: CloudPracticeScope,
        session: CloudSession,
        status: 'partial' | 'completed' | 'skipped',
        attempts: CloudAttempt[],
        scores: DatasetScore[],
        state: AppState,
        completedAt: string,
      ) =>
        finishCloudSession(
          ...scopeIds(scope),
          session,
          status,
          attempts,
          scores,
          cloudAdaptiveStateForSave(state, scope.childId, completedAt),
          completedAt,
        ),
      skipTestReview: (
        scope: CloudPracticeScope,
        session: CloudSession,
        warmupAttempts: CloudAttempt[],
        state: AppState,
        completedAt: string,
      ) =>
        skipCloudTestReview(
          ...scopeIds(scope),
          session,
          warmupAttempts,
          cloudAdaptiveStateForSave(state, scope.childId, completedAt),
          completedAt,
        ),
    },
  }
}
