import { acquisitionPromptTimer, startAcquisition } from '../acquisition/engine.ts'
import type { AcquisitionCheckpoint, AcquisitionPersistenceContext, AcquisitionProgressEnvelope, AcquisitionStrategyUpgrade } from '../acquisition/persistence/contracts.ts'
import { acquisitionProgressionId, acquisitionStrategyFingerprint } from '../acquisition/persistence/identity.ts'
import { createAcquisitionProgressEnvelope, migrateAcquisitionProgress } from '../acquisition/persistence/migration.ts'
import { applyAcquisitionCheckpoint, buildAcquisitionCheckpoint, buildAcquisitionResumeCheckpoint } from '../acquisition/persistence/reducer.ts'
import { grade2AcquisitionStrategy, grade2AcquisitionStrategyV3 } from '../acquisition/strategies/grade2.ts'
import { APP_VERSION } from '../config.ts'
import { schoolYearToken } from '../curriculum/identity.ts'
import type {
  AcquisitionProgressQuarantineRecord,
  AppState,
  Dataset,
  DistractorTargetObservation,
  RevealMethod,
  SessionAnswer,
  Word,
  WordResult,
} from '../domain.ts'
import { requirePracticeProfileForGrade } from '../practice/profiles/registry.ts'
import type { PendingAcquisitionCommit } from '../persistence/acquisitionPendingJournal.ts'

export const ACQUISITION_ACTIVITY_MODULE = 'mandarin-tier1-writing'

export const createAcquisitionAnswerCheckpoint = buildAcquisitionCheckpoint
export const createAcquisitionResumeCheckpoint = buildAcquisitionResumeCheckpoint

const grade2V3ToV4Upgrade: AcquisitionStrategyUpgrade<Word> = {
  id: 'grade2-acquisition-v3-to-v4-writing-time',
  fromStrategyId: grade2AcquisitionStrategyV3.id,
  fromStrategyVersion: grade2AcquisitionStrategyV3.version,
  fromStrategyFingerprint: acquisitionStrategyFingerprint(grade2AcquisitionStrategyV3),
  toStrategyId: grade2AcquisitionStrategy.id,
  toStrategyVersion: grade2AcquisitionStrategy.version,
  upgrade: (flow, _targetSet, strategy) => ({
    ...flow,
    strategyId: strategy.id,
    strategyVersion: strategy.version,
    prompt: flow.prompt ? {
      ...flow.prompt,
      timerSeconds: acquisitionPromptTimer(
        strategy,
        flow.phase,
        flow.prompt.kind,
        flow.expandedTargetAttempts,
      ),
      revealed: false,
    } : null,
  }),
}

function acquisitionPersistenceContextWithStrategy(
  childId: string,
  dataset: Dataset,
  grade: string,
  strategy: AcquisitionPersistenceContext<Word>['strategy'],
  strategyUpgrades: AcquisitionPersistenceContext<Word>['strategyUpgrades'] = [],
): AcquisitionPersistenceContext<Word> {
  return {
    identity: {
      childId,
      datasetId: dataset.id,
      grade,
      schoolYear: schoolYearToken(dataset.schoolYear),
      activityModule: ACQUISITION_ACTIVITY_MODULE,
      tier: 'tier-1',
    },
    lifecycleStage: { kind: 'acquisition' },
    applicationVersion: APP_VERSION,
    targetSet: { id: dataset.id, targets: dataset.words },
    strategy,
    strategyUpgrades,
  }
}

export function acquisitionPersistenceContext(
  childId: string,
  dataset: Dataset,
  grade = dataset.grade,
): AcquisitionPersistenceContext<Word> {
  const profile = requirePracticeProfileForGrade(grade)
  return acquisitionPersistenceContextWithStrategy(
    childId,
    dataset,
    grade,
    profile.acquisition,
    grade === 'Grade 2' ? [grade2V3ToV4Upgrade] : [],
  )
}

type PreparedAcquisition = {
  status: 'ready'
  state: AppState
  envelope: AcquisitionProgressEnvelope<Word>
  context: AcquisitionPersistenceContext<Word>
} | {
  status: 'blocked'
  state: AppState
  reason: string
}

function replaceEnvelope(state: AppState, envelope: AcquisitionProgressEnvelope<Word>) {
  const current = state.acquisitionProgressEnvelopes || []
  return current.some((item) => item && item.id === envelope.id)
    ? current.map((item) => item && item.id === envelope.id ? envelope : item)
    : [...current, envelope]
}

function quarantineRecord(
  state: AppState,
  childId: string,
  datasetId: string,
  reason: string,
  raw: unknown,
  quarantinedAt: string,
) {
  const id = `acq-quarantine-${childId}-${datasetId}`
  const record: AcquisitionProgressQuarantineRecord = { id, childId, datasetId, reason, quarantinedAt, raw }
  const existing = state.acquisitionProgressQuarantine || []
  return existing.some((item) => item.id === id)
    ? existing.map((item) => item.id === id ? record : item)
    : [...existing, record]
}

/**
 * Resolve one child/dataset progression at the moment Acquisition is opened.
 * A malformed saved record is preserved and blocks a silent restart.
 */
export function prepareAcquisitionProgress(
  state: AppState,
  childId: string,
  dataset: Dataset,
  timestamp: string,
  random: () => number = Math.random,
): PreparedAcquisition {
  const context = acquisitionPersistenceContext(childId, dataset)
  const progressionId = acquisitionProgressionId(context.identity)
  const existingQuarantine = (state.acquisitionProgressQuarantine || []).find((item) => item.childId === childId && item.datasetId === dataset.id)
  if (existingQuarantine) return { status: 'blocked', state, reason: existingQuarantine.reason }
  const currentMatches = (state.acquisitionProgressEnvelopes || []).filter((item) => item && (
    item.id === progressionId
      || (item.childId === childId && item.datasetId === dataset.id)
  ))
  const legacyMatches = state.acquisitionProgressions.filter((item) => item.childId === childId && item.datasetId === dataset.id)
  if (currentMatches.length > 1 || (currentMatches.length === 0 && legacyMatches.length > 1)) {
    const raw = currentMatches.length > 1 ? currentMatches : legacyMatches
    const reason = 'Conflicting saved Acquisition records reuse the same child and dataset identity.'
    return {
      status: 'blocked',
      state: { ...state, acquisitionProgressQuarantine: quarantineRecord(state, childId, dataset.id, reason, raw, timestamp) },
      reason,
    }
  }
  const raw = currentMatches[0] || legacyMatches[0]
  if (raw) {
    const migrated = migrateAcquisitionProgress(raw, context)
    if (migrated.status === 'quarantined') {
      return {
        status: 'blocked',
        state: { ...state, acquisitionProgressQuarantine: quarantineRecord(state, childId, dataset.id, migrated.reason, migrated.raw, timestamp) },
        reason: migrated.reason,
      }
    }
    const envelope = migrated.envelope
    return {
      status: 'ready',
      context,
      envelope,
      state: { ...state, acquisitionProgressEnvelopes: replaceEnvelope(state, envelope) },
    }
  }
  const flow = startAcquisition(context.targetSet, context.strategy, random)
  const envelope = createAcquisitionProgressEnvelope(context, flow, timestamp)
  return {
    status: 'ready',
    context,
    envelope,
    state: { ...state, acquisitionProgressEnvelopes: replaceEnvelope(state, envelope) },
  }
}

export function acquisitionEnvelopeFor(state: AppState, childId: string, dataset: Dataset) {
  const id = acquisitionProgressionId(acquisitionPersistenceContext(childId, dataset).identity)
  return (state.acquisitionProgressEnvelopes || []).find((item) => item.id === id) || null
}

export function sessionAnswerForCheckpoint(checkpoint: AcquisitionCheckpoint<Word>): SessionAnswer | undefined {
  const assessment = checkpoint.assessment
  return assessment ? {
    word: assessment.target,
    correct: assessment.correct,
    revealMethod: assessment.revealMethod as RevealMethod,
    acquisitionKind: assessment.kind,
    promptId: assessment.promptId,
    countsTowardWeeklyScore: assessment.countsTowardWeeklyScore,
    dtPoolType: assessment.dtPoolType,
  } : undefined
}

function resultForCheckpoint(
  state: AppState,
  envelope: AcquisitionProgressEnvelope<Word>,
  checkpoint: AcquisitionCheckpoint<Word>,
): WordResult | null {
  const fact = checkpoint.scoredAttempt
  if (!fact) return null
  const dataset = state.datasets.find((item) => item.id === envelope.datasetId)
  return {
    id: fact.id,
    childId: envelope.childId,
    datasetId: envelope.datasetId,
    datasetDateRange: dataset?.dateRange || 'Unknown date range',
    wordId: fact.targetOccurrenceId,
    grade: envelope.grade,
    phase: 'acquisition',
    sessionId: fact.sessionId,
    sessionDate: fact.reviewedAt.slice(0, 10),
    completedAt: fact.reviewedAt,
    correct: fact.correct,
    revealMethod: fact.revealMethod as RevealMethod,
    scored: true,
    completeSourceDatasetReviewed: checkpoint.nextFlow.teachingComplete,
  }
}

function observationForCheckpoint(
  envelope: AcquisitionProgressEnvelope<Word>,
  checkpoint: AcquisitionCheckpoint<Word>,
): DistractorTargetObservation | null {
  const fact = checkpoint.dtObservation
  if (!fact) return null
  return {
    id: fact.id,
    childId: envelope.childId,
    sessionId: fact.sessionId,
    datasetId: envelope.datasetId,
    wordId: fact.targetOccurrenceId,
    text: fact.text,
    poolType: fact.poolType,
    correct: fact.correct,
    revealMethod: fact.revealMethod as RevealMethod,
    reviewedAt: fact.reviewedAt,
  }
}

export type ApplyCheckpointToAppStateResult = {
  status: 'applied' | 'idempotent' | 'conflict'
  state: AppState
  envelope: AcquisitionProgressEnvelope<Word>
  reason?: string
}

/** Apply one complete checkpoint to local application state as one reducer operation. */
export function applyAcquisitionCheckpointToAppState(
  state: AppState,
  checkpoint: AcquisitionCheckpoint<Word>,
  context: AcquisitionPersistenceContext<Word>,
  queueForCloud = false,
): ApplyCheckpointToAppStateResult {
  const envelope = (state.acquisitionProgressEnvelopes || []).find((item) => item.id === checkpoint.progressionId)
  if (!envelope) throw new Error('The Acquisition progression was not loaded before its checkpoint was applied.')
  const receipt = (state.acquisitionTransitionReceipts || []).find((item) => item.transitionId === checkpoint.transitionId)
  const applied = applyAcquisitionCheckpoint(envelope, checkpoint, context, receipt)
  if (applied.status === 'conflict') return { status: 'conflict', reason: applied.reason, state, envelope }
  if (applied.status === 'idempotent') return { status: 'idempotent', state, envelope: applied.envelope }

  const result = resultForCheckpoint(state, applied.envelope, checkpoint)
  const observation = observationForCheckpoint(applied.envelope, checkpoint)
  const receipts = state.acquisitionTransitionReceipts || []
  const pending = state.acquisitionPendingCheckpoints || []
  const nextState: AppState = {
    ...state,
    acquisitionProgressEnvelopes: replaceEnvelope(state, applied.envelope),
    acquisitionTransitionReceipts: applied.envelope.lastAppliedTransition && !receipts.some((item) => item.transitionId === checkpoint.transitionId)
      ? [...receipts, applied.envelope.lastAppliedTransition]
      : receipts,
    acquisitionPendingCheckpoints: queueForCloud && !pending.some((item) => item.transitionId === checkpoint.transitionId)
      ? [...pending, checkpoint]
      : pending,
    results: result && !state.results.some((item) => item.id === result.id) ? [...state.results, result] : state.results,
    distractorTargetObservations: observation && !state.distractorTargetObservations.some((item) => item.id === observation.id)
      ? [...state.distractorTargetObservations, observation]
      : state.distractorTargetObservations,
  }
  return { status: 'applied', state: nextState, envelope: applied.envelope }
}

export function markAcquisitionCheckpointCommitted(state: AppState, transitionId: string) {
  return {
    ...state,
    acquisitionPendingCheckpoints: (state.acquisitionPendingCheckpoints || []).filter((item) => item.transitionId !== transitionId),
  }
}

export type AcquisitionCheckpointRecoveryResult = {
  status: 'recovered' | 'blocked'
  state: AppState
  recoveredTransitionIds: string[]
  reason?: string
}

/** Replay a durable browser journal in strict revision order. */
export function recoverAcquisitionCheckpoints(
  initialState: AppState,
  entries: readonly PendingAcquisitionCommit[],
): AcquisitionCheckpointRecoveryResult {
  let state = initialState
  const recoveredTransitionIds: string[] = []
  const ordered = [...entries].sort((left, right) => left.checkpoint.expectedRevision - right.checkpoint.expectedRevision || left.checkpoint.transitionId.localeCompare(right.checkpoint.transitionId))
  for (const entry of ordered) {
    const { checkpoint, baseEnvelope } = entry
    const dataset = state.datasets.find((item) => item.id === checkpoint.nextFlow.datasetId)
    if (!dataset) return { status: 'blocked', state, recoveredTransitionIds, reason: `Pending Acquisition transition ${checkpoint.transitionId} has no canonical dataset.` }
    let context: AcquisitionPersistenceContext<Word>
    try {
      const envelope = (state.acquisitionProgressEnvelopes || []).find((item) => item.id === checkpoint.progressionId)
      const recoveryEnvelope = envelope || baseEnvelope
      const isGrade2V3 = recoveryEnvelope.grade === 'Grade 2'
        && recoveryEnvelope.strategyId === grade2AcquisitionStrategyV3.id
        && recoveryEnvelope.strategyVersion === grade2AcquisitionStrategyV3.version
        && recoveryEnvelope.strategyFingerprint === acquisitionStrategyFingerprint(grade2AcquisitionStrategyV3)
      context = isGrade2V3
        ? acquisitionPersistenceContextWithStrategy(
            baseEnvelope.childId,
            dataset,
            baseEnvelope.grade,
            grade2AcquisitionStrategyV3,
          )
        : acquisitionPersistenceContext(baseEnvelope.childId, dataset, baseEnvelope.grade)
      if (!envelope) {
        const restored = migrateAcquisitionProgress(baseEnvelope, context)
        if (restored.status === 'quarantined') return { status: 'blocked', state, recoveredTransitionIds, reason: restored.reason }
        state = { ...state, acquisitionProgressEnvelopes: replaceEnvelope(state, restored.envelope) }
      }
    } catch (error) {
      return { status: 'blocked', state, recoveredTransitionIds, reason: error instanceof Error ? error.message : 'Pending Acquisition context could not be restored.' }
    }
    const applied = applyAcquisitionCheckpointToAppState(state, checkpoint, context, false)
    if (applied.status === 'conflict') return { status: 'blocked', state, recoveredTransitionIds, reason: applied.reason }
    state = markAcquisitionCheckpointCommitted(applied.state, checkpoint.transitionId)
    recoveredTransitionIds.push(checkpoint.transitionId)
  }
  return { status: 'recovered', state, recoveredTransitionIds }
}
