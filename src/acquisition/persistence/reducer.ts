import type { AcquisitionResponse, AcquisitionTarget } from '../contracts.ts'
import { revealAcquisition, resumeAcquisition } from '../engine.ts'
import { transitionAcquisition } from '../transition.ts'
import {
  ACQUISITION_PERSISTENCE_CONTRACT_ID,
  type AcquisitionCheckpoint,
  type AcquisitionCheckpointApplyResult,
  type AcquisitionPersistenceContext,
  type AcquisitionProgressEnvelope,
  type AcquisitionTransitionReceipt,
} from './contracts.ts'
import {
  acquisitionCheckpointPayloadFingerprint,
  acquisitionFactId,
  stableAcquisitionSerialization,
  acquisitionTransitionId,
} from './identity.ts'
import { validateAcquisitionProgressEnvelope } from './validation.ts'

function isCanonicalIsoTimestamp(value: string) {
  return !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value
}

export type BuildAcquisitionCheckpointInput<
  TTarget extends AcquisitionTarget,
  TRevealMethod extends string,
> = {
  readonly envelope: AcquisitionProgressEnvelope<TTarget>
  readonly response: AcquisitionResponse<TRevealMethod>
  readonly answeredPromptId: string
  readonly sessionId: string
  readonly occurredAt: string
  readonly context: AcquisitionPersistenceContext<TTarget>
  readonly random?: () => number
}

function recordingRandom(random: () => number) {
  const values: number[] = []
  return {
    values,
    next() {
      const value = random()
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Acquisition randomness must be a finite value from zero through less than one.')
      values.push(value)
      return value
    },
  }
}

function replayRandom(values: readonly number[]) {
  let index = 0
  return {
    next() {
      if (index >= values.length) throw new Error('Acquisition checkpoint randomness is incomplete.')
      const value = values[index]
      index += 1
      return value
    },
    complete() {
      if (index !== values.length) throw new Error('Acquisition checkpoint randomness contains unused values.')
    },
  }
}

export function buildAcquisitionCheckpoint<
  TTarget extends AcquisitionTarget,
  TRevealMethod extends string,
>(input: BuildAcquisitionCheckpointInput<TTarget, TRevealMethod>): AcquisitionCheckpoint<TTarget> {
  if (!input.answeredPromptId || !input.sessionId || !isCanonicalIsoTimestamp(input.occurredAt)) throw new Error('Acquisition checkpoint identity or timestamp is invalid.')
  if (typeof input.response.correct !== 'boolean' || typeof input.response.revealMethod !== 'string' || input.response.revealMethod.length === 0) throw new Error('Acquisition checkpoint response is invalid.')
  const envelopeValidation = validateAcquisitionProgressEnvelope(input.envelope, input.context)
  if (!envelopeValidation.valid) throw new Error(envelopeValidation.errors.join(' '))
  if (input.envelope.flow.prompt?.id !== input.answeredPromptId) throw new Error('The checkpoint does not answer the current persisted prompt.')
  const recordedRandom = recordingRandom(input.random || Math.random)
  const transition = transitionAcquisition(
    revealAcquisition(input.envelope.flow),
    input.context.targetSet,
    input.context.strategy,
    input.response,
    recordedRandom.next,
  )
  const assessment = transition.assessment
  if (assessment && assessment.promptId !== input.answeredPromptId) throw new Error('The assessment does not describe the answered prompt.')
  const expectedRevision = input.envelope.revision
  const nextRevision = expectedRevision + 1
  const operation = 'answer' as const
  const transitionId = acquisitionTransitionId(input.envelope.id, expectedRevision, operation, input.answeredPromptId)
  const revealMethod = assessment ? String(assessment.revealMethod) : ''
  const scoredAttempt = assessment?.countsTowardWeeklyScore ? {
    id: acquisitionFactId(transitionId, 'attempt'),
    sessionId: input.sessionId,
    promptId: assessment.promptId,
    targetOccurrenceId: assessment.targetOccurrenceId,
    kind: assessment.kind,
    correct: assessment.correct,
    revealMethod,
    reviewedAt: input.occurredAt,
  } : undefined
  const dtObservation = assessment?.dtPoolType && input.context.strategy.dtObservationMode === 'collect' ? {
    id: acquisitionFactId(transitionId, 'dt-observation'),
    sessionId: input.sessionId,
    promptId: assessment.promptId,
    targetOccurrenceId: assessment.targetOccurrenceId,
    text: assessment.target.text,
    poolType: assessment.dtPoolType,
    correct: assessment.correct,
    revealMethod,
    reviewedAt: input.occurredAt,
  } : undefined
  const withoutFingerprint: Omit<AcquisitionCheckpoint<TTarget>, 'payloadFingerprint'> = {
    contractId: ACQUISITION_PERSISTENCE_CONTRACT_ID,
    progressionId: input.envelope.id,
    transitionId,
    operation,
    expectedRevision,
    nextRevision,
    sessionId: input.sessionId,
    promptId: input.answeredPromptId,
    occurredAt: input.occurredAt,
    response: { correct: input.response.correct, revealMethod: String(input.response.revealMethod) },
    randomValues: recordedRandom.values,
    nextFlow: transition.nextFlow,
    assessment: assessment ? { ...assessment, revealMethod } : undefined,
    scoredAttempt,
    dtObservation,
  }
  return { ...withoutFingerprint, payloadFingerprint: acquisitionCheckpointPayloadFingerprint(withoutFingerprint) }
}

export type BuildAcquisitionResumeCheckpointInput<TTarget extends AcquisitionTarget> = {
  readonly envelope: AcquisitionProgressEnvelope<TTarget>
  readonly sessionId: string
  readonly occurredAt: string
  readonly context: AcquisitionPersistenceContext<TTarget>
  readonly random?: () => number
}

export function buildAcquisitionResumeCheckpoint<TTarget extends AcquisitionTarget>(
  input: BuildAcquisitionResumeCheckpointInput<TTarget>,
): AcquisitionCheckpoint<TTarget> {
  if (!input.sessionId || !isCanonicalIsoTimestamp(input.occurredAt)) throw new Error('Acquisition resume checkpoint identity or timestamp is invalid.')
  const envelopeValidation = validateAcquisitionProgressEnvelope(input.envelope, input.context)
  if (!envelopeValidation.valid) throw new Error(envelopeValidation.errors.join(' '))
  if (!isCompletedTeachingFlow(input.envelope.flow)) throw new Error('Only the terminal teaching flow can resume into DT-only practice.')
  const recordedRandom = recordingRandom(input.random || Math.random)
  const resumedFlow = resumeAcquisition(input.envelope.flow, input.context.targetSet, input.context.strategy, recordedRandom.next)
  if (resumedFlow.mode !== 'dt-practice' || !resumedFlow.prompt) throw new Error('Completed teaching did not produce a DT-practice prompt.')
  const operation = 'resume-dt-practice' as const
  const promptId = resumedFlow.prompt.id
  const expectedRevision = input.envelope.revision
  const transitionId = acquisitionTransitionId(input.envelope.id, expectedRevision, operation, promptId)
  const withoutFingerprint: Omit<AcquisitionCheckpoint<TTarget>, 'payloadFingerprint'> = {
    contractId: ACQUISITION_PERSISTENCE_CONTRACT_ID,
    progressionId: input.envelope.id,
    transitionId,
    operation,
    expectedRevision,
    nextRevision: expectedRevision + 1,
    sessionId: input.sessionId,
    promptId,
    occurredAt: input.occurredAt,
    randomValues: recordedRandom.values,
    nextFlow: resumedFlow,
  }
  return { ...withoutFingerprint, payloadFingerprint: acquisitionCheckpointPayloadFingerprint(withoutFingerprint) }
}

function checkpointWithoutFingerprint<TTarget extends AcquisitionTarget>(checkpoint: AcquisitionCheckpoint<TTarget>): Omit<AcquisitionCheckpoint<TTarget>, 'payloadFingerprint'> {
  const { payloadFingerprint: _payloadFingerprint, ...payload } = checkpoint
  return payload
}

function checkpointProblem<TTarget extends AcquisitionTarget>(
  checkpoint: AcquisitionCheckpoint<TTarget>,
  envelope: AcquisitionProgressEnvelope<TTarget>,
  context: AcquisitionPersistenceContext<TTarget>,
) {
  if (checkpoint.contractId !== ACQUISITION_PERSISTENCE_CONTRACT_ID) return 'Checkpoint contract is unsupported.'
  if (checkpoint.progressionId !== envelope.id) return 'Checkpoint progression identity does not match.'
  if (checkpoint.operation !== 'answer' && checkpoint.operation !== 'resume-dt-practice') return 'Checkpoint operation is invalid.'
  if (!checkpoint.transitionId || checkpoint.transitionId !== acquisitionTransitionId(envelope.id, checkpoint.expectedRevision, checkpoint.operation, checkpoint.promptId)) return 'Checkpoint transition identity is invalid.'
  if (checkpoint.nextRevision !== checkpoint.expectedRevision + 1) return 'Checkpoint revision step is invalid.'
  if (!checkpoint.sessionId || !checkpoint.promptId || !isCanonicalIsoTimestamp(checkpoint.occurredAt)) return 'Checkpoint session, prompt, or timestamp is invalid.'
  if (!Array.isArray(checkpoint.randomValues) || checkpoint.randomValues.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 1)) return 'Checkpoint randomness is invalid.'
  if (checkpoint.operation === 'answer' && (!checkpoint.response || typeof checkpoint.response.correct !== 'boolean' || typeof checkpoint.response.revealMethod !== 'string' || checkpoint.response.revealMethod.length === 0)) return 'An answer checkpoint requires a valid response.'
  if (checkpoint.operation === 'resume-dt-practice' && checkpoint.response !== undefined) return 'A DT-practice resume cannot contain a response.'
  if (checkpoint.payloadFingerprint !== acquisitionCheckpointPayloadFingerprint(checkpointWithoutFingerprint(checkpoint))) return 'Checkpoint payload fingerprint is invalid.'
  const assessment = checkpoint.assessment
  if (assessment && (assessment.promptId !== checkpoint.promptId || assessment.targetOccurrenceId !== assessment.target.id)) return 'Checkpoint assessment identity is invalid.'
  if (checkpoint.operation === 'resume-dt-practice' && (assessment || checkpoint.scoredAttempt || checkpoint.dtObservation)) return 'A DT-practice resume cannot contain assessment facts.'
  if (Boolean(checkpoint.scoredAttempt) !== Boolean(assessment?.countsTowardWeeklyScore)) return 'Checkpoint scored-attempt fact is inconsistent.'
  if (Boolean(checkpoint.dtObservation) !== Boolean(assessment?.dtPoolType && context.strategy.dtObservationMode === 'collect')) return 'Checkpoint DT-observation fact is inconsistent.'
  if (checkpoint.scoredAttempt) {
    const fact = checkpoint.scoredAttempt
    if (fact.id !== acquisitionFactId(checkpoint.transitionId, 'attempt') || fact.sessionId !== checkpoint.sessionId || fact.promptId !== assessment?.promptId || fact.targetOccurrenceId !== assessment?.targetOccurrenceId || fact.kind !== assessment?.kind || fact.correct !== assessment?.correct || fact.revealMethod !== String(assessment?.revealMethod) || fact.reviewedAt !== checkpoint.occurredAt) return 'Checkpoint scored-attempt fact is invalid.'
  }
  if (checkpoint.dtObservation) {
    const fact = checkpoint.dtObservation
    if (fact.id !== acquisitionFactId(checkpoint.transitionId, 'dt-observation') || fact.sessionId !== checkpoint.sessionId || fact.promptId !== assessment?.promptId || fact.targetOccurrenceId !== assessment?.targetOccurrenceId || fact.text !== assessment?.target.text || fact.poolType !== assessment?.dtPoolType || fact.correct !== assessment?.correct || fact.revealMethod !== String(assessment?.revealMethod) || fact.reviewedAt !== checkpoint.occurredAt) return 'Checkpoint DT-observation fact is invalid.'
  }
  return null
}

function checkpointTransitionProblem<TTarget extends AcquisitionTarget>(
  checkpoint: AcquisitionCheckpoint<TTarget>,
  envelope: AcquisitionProgressEnvelope<TTarget>,
  context: AcquisitionPersistenceContext<TTarget>,
) {
  const prompt = envelope.flow.prompt
  if (checkpoint.operation === 'resume-dt-practice') {
    if (!isCompletedTeachingFlow(envelope.flow)) return 'Only the terminal teaching flow can resume into DT-only practice.'
    try {
      const random = replayRandom(checkpoint.randomValues)
      const expected = resumeAcquisition(envelope.flow, context.targetSet, context.strategy, random.next)
      random.complete()
      return stableAcquisitionSerialization(expected) === stableAcquisitionSerialization(checkpoint.nextFlow)
        && checkpoint.nextFlow.prompt?.id === checkpoint.promptId
        ? null
        : 'DT-practice resume does not match the engine transition.'
    } catch (error) {
      return error instanceof Error ? error.message : 'DT-practice resume could not be replayed.'
    }
  }
  if (!prompt || prompt.id !== checkpoint.promptId) return 'Checkpoint does not answer the current persisted prompt.'
  const assessment = checkpoint.assessment
  if (prompt.kind === 'show-copy') {
    if (assessment) return 'Show-and-copy checkpoints cannot contain an assessment.'
  } else if (!assessment) {
    return 'An assessed Acquisition prompt requires an assessment.'
  } else if (assessment.promptId !== prompt.id
    || assessment.targetOccurrenceId !== prompt.word.id
    || assessment.kind !== prompt.kind
    || assessment.target.id !== prompt.word.id
    || assessment.target.text !== prompt.word.text
    || assessment.target.sentence !== prompt.word.sentence
    || assessment.target.datasetId !== prompt.word.datasetId
    || assessment.target.language !== prompt.word.language
    || assessment.target.tier !== prompt.word.tier
    || assessment.target.activityType !== prompt.word.activityType
    || assessment.countsTowardWeeklyScore !== prompt.countsTowardWeeklyScore
    || assessment.dtPoolType !== prompt.dtPoolType
    || typeof assessment.correct !== 'boolean'
    || !String(assessment.revealMethod)) return 'Checkpoint assessment does not match the answered prompt.'
  try {
    const random = replayRandom(checkpoint.randomValues)
    const expected = transitionAcquisition(
      revealAcquisition(envelope.flow),
      context.targetSet,
      context.strategy,
      checkpoint.response!,
      random.next,
    )
    random.complete()
    return stableAcquisitionSerialization(expected.nextFlow) === stableAcquisitionSerialization(checkpoint.nextFlow)
      && stableAcquisitionSerialization(expected.assessment) === stableAcquisitionSerialization(checkpoint.assessment)
      ? null
      : 'Checkpoint next flow does not match the engine transition.'
  } catch (error) {
    return error instanceof Error ? error.message : 'Checkpoint transition could not be replayed.'
  }
}

function isCompletedTeachingFlow<TTarget extends AcquisitionTarget>(flow: AcquisitionProgressEnvelope<TTarget>['flow']) {
  return flow.mode === 'teaching'
    && flow.teachingComplete
    && flow.complete
    && flow.currentTarget === null
    && flow.prompt === null
    && flow.correctionRole === undefined
    && flow.resumePosition === undefined
}

function receiptProblem(
  receipt: AcquisitionTransitionReceipt,
  envelope: AcquisitionProgressEnvelope,
  checkpoint: AcquisitionCheckpoint,
) {
  if (receipt.progressionId !== envelope.id) return 'Transition receipt belongs to another progression.'
  if (!receipt.transitionId || !receipt.payloadFingerprint || !receipt.promptId || !Number.isInteger(receipt.expectedRevision) || receipt.expectedRevision < 0 || !Number.isInteger(receipt.appliedRevision) || receipt.appliedRevision <= 0) return 'Transition receipt identity or revision is invalid.'
  if (!isCanonicalIsoTimestamp(receipt.appliedAt)) return 'Transition receipt timestamp is invalid.'
  if (receipt.operation !== checkpoint.operation
    || receipt.promptId !== checkpoint.promptId
    || receipt.expectedRevision !== checkpoint.expectedRevision
    || receipt.appliedRevision !== checkpoint.nextRevision
    || receipt.appliedAt !== checkpoint.occurredAt) return 'Transition receipt does not prove the exact checkpoint application.'
  if (receipt.appliedRevision > envelope.revision || receipt.appliedAt > envelope.updatedAt) return 'Transition receipt describes unapplied future state.'
  return null
}

export function applyAcquisitionCheckpoint<TTarget extends AcquisitionTarget>(
  envelope: AcquisitionProgressEnvelope<TTarget>,
  checkpoint: AcquisitionCheckpoint<TTarget>,
  context: AcquisitionPersistenceContext<TTarget>,
  existingReceipt?: AcquisitionTransitionReceipt | null,
): AcquisitionCheckpointApplyResult<TTarget> {
  const currentValidation = validateAcquisitionProgressEnvelope(envelope, context)
  if (!currentValidation.valid) return { status: 'conflict', reason: currentValidation.errors.join(' '), envelope }
  const problem = checkpointProblem(checkpoint, envelope, context)
  if (problem) return { status: 'conflict', reason: problem, envelope }

  if (existingReceipt) {
    const receiptValidationProblem = receiptProblem(existingReceipt, envelope, checkpoint)
    if (receiptValidationProblem) return { status: 'conflict', reason: receiptValidationProblem, envelope }
  }
  const prior = existingReceipt?.transitionId === checkpoint.transitionId
    ? existingReceipt
    : envelope.lastAppliedTransition?.transitionId === checkpoint.transitionId
      ? envelope.lastAppliedTransition
      : null
  if (prior) return prior.payloadFingerprint === checkpoint.payloadFingerprint
    ? { status: 'idempotent', envelope }
    : { status: 'conflict', reason: 'Transition ID was reused with a different payload.', envelope }
  if (checkpoint.expectedRevision !== envelope.revision) return { status: 'conflict', reason: 'Checkpoint expected revision is stale.', envelope }
  if (checkpoint.occurredAt < envelope.updatedAt) return { status: 'conflict', reason: 'Checkpoint timestamp precedes the current progression update.', envelope }
  const transitionProblem = checkpointTransitionProblem(checkpoint, envelope, context)
  if (transitionProblem) return { status: 'conflict', reason: transitionProblem, envelope }

  const candidate: AcquisitionProgressEnvelope<TTarget> = {
    ...envelope,
    lifecycleStageAtLastCheckpoint: context.lifecycleStage,
    applicationVersion: context.applicationVersion,
    revision: checkpoint.nextRevision,
    status: checkpoint.nextFlow.teachingComplete ? 'teaching-complete' : 'in-progress',
    flow: checkpoint.nextFlow,
    lastAppliedTransition: {
      progressionId: envelope.id,
      transitionId: checkpoint.transitionId,
      payloadFingerprint: checkpoint.payloadFingerprint,
      operation: checkpoint.operation,
      promptId: checkpoint.promptId,
      expectedRevision: checkpoint.expectedRevision,
      appliedRevision: checkpoint.nextRevision,
      appliedAt: checkpoint.occurredAt,
    },
    updatedAt: checkpoint.occurredAt,
  }
  const validation = validateAcquisitionProgressEnvelope(candidate, context)
  return validation.valid
    ? { status: 'applied', envelope: validation.envelope }
    : { status: 'conflict', reason: validation.errors.join(' '), envelope }
}
