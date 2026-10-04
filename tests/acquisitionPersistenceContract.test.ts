import assert from 'node:assert/strict'
import test from 'node:test'
import type { AcquisitionTarget, AcquisitionTargetSet } from '../src/acquisition/contracts.ts'
import { revealAcquisition, resumeAcquisition, startAcquisition } from '../src/acquisition/engine.ts'
import {
  ACQUISITION_PERSISTENCE_CONTRACT_ID,
  type AcquisitionCheckpoint,
  type AcquisitionPersistenceContext,
  type AcquisitionProgressEnvelope,
} from '../src/acquisition/persistence/contracts.ts'
import {
  acquisitionCheckpointPayloadFingerprint,
  acquisitionProgressionId,
  stableAcquisitionSerialization,
  acquisitionTargetSetFingerprint,
} from '../src/acquisition/persistence/identity.ts'
import { createAcquisitionProgressEnvelope, migrateAcquisitionProgress, migrateAcquisitionProgressCollection } from '../src/acquisition/persistence/migration.ts'
import { applyAcquisitionCheckpoint, buildAcquisitionCheckpoint, buildAcquisitionResumeCheckpoint } from '../src/acquisition/persistence/reducer.ts'
import { validateAcquisitionProgressEnvelope } from '../src/acquisition/persistence/validation.ts'
import { grade2AcquisitionStrategy } from '../src/acquisition/strategies/grade2.ts'
import { kindergartenAcquisitionStrategy } from '../src/acquisition/strategies/kindergarten.ts'
import { transitionAcquisition } from '../src/acquisition/transition.ts'

const targets: AcquisitionTarget[] = [
  { id: 'week-1-word-1', text: '需要', sentence: '我需要一本书。', datasetId: 'week-1', language: 'mandarin', tier: 'tier-1', activityType: 'dictation' },
  { id: 'week-1-word-2', text: '部分', sentence: '', datasetId: 'week-1', language: 'mandarin', tier: 'tier-1', activityType: 'dictation' },
]
const targetSet: AcquisitionTargetSet = { id: 'week-1', targets }
const context: AcquisitionPersistenceContext = {
  identity: {
    childId: 'maya',
    datasetId: targetSet.id,
    grade: 'Grade 2',
    schoolYear: '2026-27',
    activityModule: 'mandarin-tier1-writing',
    tier: 'tier-1',
  },
  lifecycleStage: { kind: 'acquisition' },
  applicationVersion: '0.2.0-stage2',
  targetSet,
  strategy: grade2AcquisitionStrategy,
}
const startedAt = '2026-09-29T16:00:00.000Z'

function startedEnvelope() {
  return createAcquisitionProgressEnvelope(context, startAcquisition(targetSet, grade2AcquisitionStrategy, () => 0), startedAt)
}

function answerCheckpoint(envelope: AcquisitionProgressEnvelope, correct = true, random: () => number = () => 0, seconds = envelope.revision + 1) {
  const prompt = envelope.flow.prompt
  assert.ok(prompt)
  return buildAcquisitionCheckpoint({
    envelope,
    response: { correct, revealMethod: 'timer' },
    answeredPromptId: prompt.id,
    sessionId: 'session-1',
    occurredAt: new Date(Date.parse(startedAt) + seconds * 1_000).toISOString(),
    context,
    random,
  })
}

function applied(envelope: AcquisitionProgressEnvelope, checkpoint: AcquisitionCheckpoint) {
  const result = applyAcquisitionCheckpoint(envelope, checkpoint, context)
  assert.equal(result.status, 'applied', result.status === 'conflict' ? result.reason : undefined)
  return result.envelope
}

function withCheckpointFingerprint(checkpoint: AcquisitionCheckpoint) {
  const { payloadFingerprint: _payloadFingerprint, ...payload } = checkpoint
  return { ...payload, payloadFingerprint: acquisitionCheckpointPayloadFingerprint(payload) }
}

test('progression and target-set identities are deterministic, path-safe, and use the complete tuple', () => {
  const id = acquisitionProgressionId(context.identity)
  assert.match(id, /^acq-progress-v1-[a-f0-9]{16}$/)
  assert.equal(id, acquisitionProgressionId({ ...context.identity }))
  assert.notEqual(id, acquisitionProgressionId({ ...context.identity, schoolYear: '2027-28' }))
  assert.notEqual(id, acquisitionProgressionId({ ...context.identity, activityModule: 'mandarin-tier2-reading', tier: 'tier-2' }))
  assert.match(acquisitionTargetSetFingerprint(targetSet), /^acq-targets-v1-[a-f0-9]{16}$/)
  assert.notEqual(acquisitionTargetSetFingerprint(targetSet), acquisitionTargetSetFingerprint({ ...targetSet, targets: [...targets].reverse() }))
})

test('a new envelope stores and validates the complete canonical identity and flow', () => {
  const envelope = startedEnvelope()
  assert.equal(envelope.contractId, ACQUISITION_PERSISTENCE_CONTRACT_ID)
  assert.equal(envelope.revision, 0)
  assert.deepEqual(envelope.targetOccurrenceIds, targets.map((target) => target.id))
  assert.equal(validateAcquisitionProgressEnvelope(envelope, context).valid, true)

  const wrongContext = { ...context, identity: { ...context.identity, childId: 'eli' } }
  const result = validateAcquisitionProgressEnvelope(envelope, wrongContext)
  assert.equal(result.valid, false)
  if (!result.valid) assert.match(result.errors.join(' '), /identity tuple|childId/)
})

test('every successful Grade 2 v4 Introduction and Expanded position checkpoints and validates', () => {
  let envelope = startedEnvelope()
  const visited = new Set<string>()
  let guard = 0
  while (!envelope.flow.complete && guard < 100) {
    visited.add(`${envelope.flow.phase}:${envelope.flow.step}:${envelope.flow.prompt?.kind}`)
    envelope = applied(envelope, answerCheckpoint(envelope, true, () => 0, guard + 1))
    assert.equal(validateAcquisitionProgressEnvelope(envelope, context).valid, true)
    guard += 1
  }
  assert.equal(envelope.flow.teachingComplete, true)
  assert.ok(visited.has('introduction:0:familiar-dt'))
  assert.ok(visited.has('introduction:2:show-copy'))
  for (let step = 0; step < grade2AcquisitionStrategy.expandedSequence.length; step += 1) {
    const kind = grade2AcquisitionStrategy.expandedSequence[step]
    assert.ok([...visited].some((entry) => entry.startsWith(`expanded-trials:${step}:`) && (kind !== 'dt' || entry.endsWith('familiar-dt'))), `missing expanded step ${step}`)
  }
})

test('all six Correction positions checkpoint without changing the engine contract', () => {
  let envelope = startedEnvelope()
  for (let index = 0; index < 3; index += 1) envelope = applied(envelope, answerCheckpoint(envelope, true, () => 0, index + 1))
  envelope = applied(envelope, answerCheckpoint(envelope, false, () => 0, 4))
  assert.equal(envelope.flow.phase, 'correction')
  const visited: string[] = []
  for (let index = 0; index < grade2AcquisitionStrategy.correctionSequence.length; index += 1) {
    visited.push(`${envelope.flow.step}:${envelope.flow.prompt?.kind}`)
    envelope = applied(envelope, answerCheckpoint(envelope, true, () => 0, index + 5))
  }
  assert.deepEqual(visited, ['0:show-copy', '1:show-copy', '2:show-copy', '3:target', '4:familiar-dt', '5:target'])
  assert.equal(envelope.flow.phase, 'expanded-trials')
})

test('Correction after an error on the final Expanded Trial checkpoints and resumes DT practice', () => {
  let envelope = startedEnvelope()
  let seconds = 1
  const finalExpandedStep = grade2AcquisitionStrategy.expandedSequence.length - 1
  while (!(envelope.flow.targetIndex === targets.length - 1
    && envelope.flow.phase === 'expanded-trials'
    && envelope.flow.step === finalExpandedStep)) {
    envelope = applied(envelope, answerCheckpoint(envelope, true, () => 0, seconds))
    seconds += 1
  }

  envelope = applied(envelope, answerCheckpoint(envelope, false, () => 0, seconds))
  seconds += 1
  assert.equal(envelope.flow.phase, 'correction')

  for (let index = 0; index < grade2AcquisitionStrategy.correctionSequence.length; index += 1) {
    envelope = applied(envelope, answerCheckpoint(envelope, true, () => 0, seconds))
    seconds += 1
  }

  assert.equal(envelope.flow.teachingComplete, true)
  assert.equal(envelope.flow.complete, true)
  assert.equal(envelope.flow.phase, 'expanded-trials')
  assert.equal(envelope.flow.step, grade2AcquisitionStrategy.expandedSequence.length)
  assert.equal(validateAcquisitionProgressEnvelope(envelope, context).valid, true)

  const resume = buildAcquisitionResumeCheckpoint({
    envelope,
    sessionId: 'session-after-final-correction',
    occurredAt: new Date(Date.parse(startedAt) + seconds * 1_000).toISOString(),
    context,
    random: () => 0,
  })
  envelope = applied(envelope, resume)
  assert.equal(envelope.flow.mode, 'dt-practice')
  assert.equal(envelope.flow.currentTarget, null)
  assert.ok(envelope.flow.prompt)
  assert.equal(envelope.flow.step, grade2AcquisitionStrategy.expandedSequence.length)
  assert.equal(validateAcquisitionProgressEnvelope(envelope, context).valid, true)
})

test('completed teaching enters ongoing DT practice through an explicit revisioned resume checkpoint', () => {
  let envelope = startedEnvelope()
  let guard = 1
  while (!envelope.flow.complete) {
    envelope = applied(envelope, answerCheckpoint(envelope, true, () => 0, guard))
    guard += 1
  }
  const priorRevision = envelope.revision
  const resume = buildAcquisitionResumeCheckpoint({ envelope, sessionId: 'session-2', occurredAt: '2026-09-29T16:01:00.000Z', context, random: () => 0.75 })
  assert.equal(resume.operation, 'resume-dt-practice')
  assert.equal(resume.assessment, undefined)
  assert.equal(resume.scoredAttempt, undefined)
  assert.equal(resume.dtObservation, undefined)
  envelope = applied(envelope, resume)
  assert.equal(envelope.revision, priorRevision + 1)
  assert.equal(envelope.flow.mode, 'dt-practice')
  assert.equal(envelope.flow.prompt?.kind, 'earned-dt')

  const answered = answerCheckpoint(envelope, false, () => 0.75, 61)
  assert.equal(answered.scoredAttempt?.kind, 'earned-dt')
  assert.equal(answered.dtObservation?.poolType, 'earned')
  envelope = applied(envelope, answered)
  assert.equal(envelope.flow.mode, 'dt-practice')
  assert.equal(envelope.flow.phase, 'correction')
  assert.equal(envelope.flow.step, 0)
  assert.equal(envelope.flow.prompt?.kind, 'show-copy')
  assert.equal(validateAcquisitionProgressEnvelope(envelope, context).valid, true)
})

test('open-ended Earned-DT Correction checkpoints all six positions and returns to DT practice', () => {
  let envelope = startedEnvelope()
  let seconds = 1
  while (!envelope.flow.complete) {
    envelope = applied(envelope, answerCheckpoint(envelope, true, () => 0, seconds))
    seconds += 1
  }
  envelope = applied(envelope, buildAcquisitionResumeCheckpoint({
    envelope,
    sessionId: 'session-dt-correction',
    occurredAt: new Date(Date.parse(startedAt) + seconds * 1_000).toISOString(),
    context,
    random: () => 0.75,
  }))
  seconds += 1
  assert.equal(envelope.flow.prompt?.kind, 'earned-dt')

  envelope = applied(envelope, answerCheckpoint(envelope, false, () => 0.75, seconds))
  seconds += 1
  const visited: string[] = []
  for (let index = 0; index < grade2AcquisitionStrategy.correctionSequence.length; index += 1) {
    visited.push(`${envelope.flow.step}:${envelope.flow.prompt?.kind}`)
    envelope = applied(envelope, answerCheckpoint(envelope, true, () => 0.75, seconds))
    assert.equal(validateAcquisitionProgressEnvelope(envelope, context).valid, true)
    seconds += 1
  }

  assert.deepEqual(visited, ['0:show-copy', '1:show-copy', '2:show-copy', '3:target', '4:familiar-dt', '5:target'])
  assert.equal(envelope.flow.mode, 'dt-practice')
  assert.equal(envelope.flow.currentTarget, null)
  assert.ok(envelope.flow.prompt)
})

test('checkpointed Earned-DT reacquisition preserves the original weekly resume position through completion', () => {
  let envelope = startedEnvelope()
  let seconds = 1
  while (envelope.flow.targetIndex === 0) {
    envelope = applied(envelope, answerCheckpoint(envelope, true, () => 0, seconds))
    seconds += 1
  }
  while (envelope.flow.phase === 'introduction') {
    envelope = applied(envelope, answerCheckpoint(envelope, true, () => 0, seconds))
    seconds += 1
  }
  envelope = applied(envelope, answerCheckpoint(envelope, true, () => 0.75, seconds))
  seconds += 1
  assert.equal(envelope.flow.prompt?.kind, 'earned-dt')
  const reacquiredWordId = envelope.flow.prompt.word.id

  envelope = applied(envelope, answerCheckpoint(envelope, false, () => 0.75, seconds))
  seconds += 1
  for (let index = 0; index < 3; index += 1) {
    envelope = applied(envelope, answerCheckpoint(envelope, true, () => 0.75, seconds))
    seconds += 1
  }
  envelope = applied(envelope, answerCheckpoint(envelope, false, () => 0.75, seconds))
  seconds += 1
  envelope = applied(envelope, answerCheckpoint(envelope, true, () => 0.75, seconds))
  seconds += 1
  envelope = applied(envelope, answerCheckpoint(envelope, false, () => 0.75, seconds))
  seconds += 1

  assert.equal(envelope.flow.phase, 'introduction')
  assert.equal(envelope.flow.correctionRole, 'earned-dt')
  assert.equal(envelope.flow.resumePosition?.currentTarget.id, targets[1].id)
  assert.equal(envelope.flow.resumePosition?.step, 2)

  let guard = 0
  while (envelope.flow.correctionRole === 'earned-dt' && guard < 100) {
    if (envelope.flow.prompt?.kind === 'familiar-dt' || envelope.flow.prompt?.kind === 'earned-dt') {
      assert.equal(envelope.flow.prompt.kind, 'familiar-dt')
      assert.equal(envelope.flow.resumePosition?.currentTarget.id, targets[1].id)
      assert.equal(envelope.flow.resumePosition?.step, 2)
    }
    envelope = applied(envelope, answerCheckpoint(envelope, true, () => 0.75, seconds))
    assert.equal(validateAcquisitionProgressEnvelope(envelope, context).valid, true)
    seconds += 1
    guard += 1
  }
  assert.ok(guard < 100)
  assert.equal(envelope.flow.currentTarget?.id, targets[1].id)
  assert.equal(envelope.flow.targetIndex, 1)
  assert.equal(envelope.flow.phase, 'expanded-trials')
  assert.equal(envelope.flow.step, 2)
  assert.equal(envelope.flow.resumePosition, undefined)
  assert.ok(envelope.flow.earnedDtPool.some((target) => target.id === reacquiredWordId))

  while (!envelope.flow.complete) {
    envelope = applied(envelope, answerCheckpoint(envelope, true, () => 0, seconds))
    assert.equal(validateAcquisitionProgressEnvelope(envelope, context).valid, true)
    seconds += 1
  }
  assert.equal(envelope.flow.teachingComplete, true)
  assert.deepEqual(envelope.flow.earnedDtPool.map((target) => target.id), targets.map((target) => target.id))
})

test('one checkpoint derives the correct facts and applies exactly once', () => {
  const envelope = startedEnvelope()
  const checkpoint = answerCheckpoint(envelope)
  assert.equal(checkpoint.scoredAttempt, undefined)
  assert.equal(checkpoint.dtObservation?.poolType, 'familiar')
  const first = applyAcquisitionCheckpoint(envelope, checkpoint, context)
  assert.equal(first.status, 'applied')
  const next = first.envelope
  assert.equal(next.revision, 1)
  assert.equal(next.lastAppliedTransition?.transitionId, checkpoint.transitionId)

  const retry = applyAcquisitionCheckpoint(next, checkpoint, context)
  assert.equal(retry.status, 'idempotent')
  assert.equal(retry.envelope, next)

  const conflictingTime = '2026-09-29T16:01:00.000Z'
  const conflicting = withCheckpointFingerprint({
    ...checkpoint,
    occurredAt: conflictingTime,
    dtObservation: checkpoint.dtObservation ? { ...checkpoint.dtObservation, reviewedAt: conflictingTime } : undefined,
  })
  const conflict = applyAcquisitionCheckpoint(next, conflicting, context)
  assert.equal(conflict.status, 'conflict')
  if (conflict.status === 'conflict') assert.match(conflict.reason, /different payload/)

  const secondCheckpoint = answerCheckpoint(next, true, () => 0, 2)
  const second = applied(next, secondCheckpoint)
  const oldRetryWithoutReceipt = applyAcquisitionCheckpoint(second, checkpoint, context)
  assert.equal(oldRetryWithoutReceipt.status, 'conflict')
  const oldRetryWithReceipt = applyAcquisitionCheckpoint(second, checkpoint, context, next.lastAppliedTransition)
  assert.equal(oldRetryWithReceipt.status, 'idempotent')
  assert.equal(oldRetryWithReceipt.envelope, second)
})

test('weekly targets create scored facts while Earned DTs create one scored fact and one DT fact', () => {
  let envelope = startedEnvelope()
  for (let index = 0; index < 3; index += 1) envelope = applied(envelope, answerCheckpoint(envelope, true, () => 0, index + 1))
  assert.equal(envelope.flow.prompt?.kind, 'target')
  const weekly = answerCheckpoint(envelope, true, () => 0, 4)
  assert.equal(weekly.scoredAttempt?.targetOccurrenceId, targets[0].id)
  assert.equal(weekly.dtObservation, undefined)
  envelope = applied(envelope, weekly)

  let guard = 5
  while (!(envelope.flow.targetIndex === 1 && envelope.flow.phase === 'expanded-trials' && envelope.flow.step === 0)) {
    envelope = applied(envelope, answerCheckpoint(envelope, true, () => 0, guard))
    guard += 1
  }
  envelope = applied(envelope, answerCheckpoint(envelope, true, () => 0.75, guard))
  guard += 1
  assert.equal(envelope.flow.prompt?.kind, 'earned-dt')
  const earned = answerCheckpoint(envelope, true, () => 0, guard)
  assert.equal(earned.scoredAttempt?.kind, 'earned-dt')
  assert.equal(earned.dtObservation?.poolType, 'earned')
  assert.equal(earned.scoredAttempt?.targetOccurrenceId, earned.dtObservation?.targetOccurrenceId)
})

test('stale revisions and internally inconsistent facts fail closed', () => {
  const initial = startedEnvelope()
  const first = answerCheckpoint(initial)
  const current = applied(initial, first)
  const nextPrompt = current.flow.prompt
  assert.ok(nextPrompt)
  const { lastAppliedTransition: _lastAppliedTransition, ...withoutReceipt } = current
  const fakeOldRevision = { ...withoutReceipt, revision: 0 }
  const stale = buildAcquisitionCheckpoint({ envelope: fakeOldRevision, response: { correct: true, revealMethod: 'timer' }, answeredPromptId: nextPrompt.id, sessionId: 'session-1', occurredAt: '2026-09-29T16:00:02.000Z', context, random: () => 0 })
  const staleResult = applyAcquisitionCheckpoint(current, stale, context)
  assert.equal(staleResult.status, 'conflict')
  if (staleResult.status === 'conflict') assert.match(staleResult.reason, /stale/)

  const malformed = withCheckpointFingerprint({ ...stale, expectedRevision: 1, nextRevision: 2, scoredAttempt: { id: 'invented', sessionId: 'session-1', promptId: nextPrompt.id, targetOccurrenceId: nextPrompt.word.id, kind: nextPrompt.kind, correct: true, revealMethod: 'timer', reviewedAt: stale.occurredAt } })
  const malformedResult = applyAcquisitionCheckpoint(current, malformed, context)
  assert.equal(malformedResult.status, 'conflict')

  const backwards = answerCheckpoint(current, true, () => 0, 0)
  const backwardsResult = applyAcquisitionCheckpoint(current, backwards, context)
  assert.equal(backwardsResult.status, 'conflict')
  if (backwardsResult.status === 'conflict') assert.match(backwardsResult.reason, /timestamp precedes/)
})

test('a checkpoint cannot substitute a structurally valid but invented successor flow', () => {
  const envelope = startedEnvelope()
  const checkpoint = answerCheckpoint(envelope)
  const first = transitionAcquisition(revealAcquisition(envelope.flow), targetSet, grade2AcquisitionStrategy, { correct: true, revealMethod: 'timer' }, () => 0).nextFlow
  const twoStepsAhead = transitionAcquisition(revealAcquisition(first), targetSet, grade2AcquisitionStrategy, { correct: true, revealMethod: 'timer' }, () => 0).nextFlow
  const invented = withCheckpointFingerprint({ ...checkpoint, nextFlow: twoStepsAhead })
  assert.equal(validateAcquisitionProgressEnvelope({ ...envelope, flow: twoStepsAhead }, context).valid, true)
  const result = applyAcquisitionCheckpoint(envelope, invented, context)
  assert.equal(result.status, 'conflict')
  if (result.status === 'conflict') assert.match(result.reason, /does not match the engine transition/)
})

test('strict validation rejects impossible timers, missing prompts, false completion, and future DT state', () => {
  const envelope = startedEnvelope()
  assert.ok(envelope.flow.prompt)
  const impossible = [
    { ...envelope, flow: { ...envelope.flow, prompt: { ...envelope.flow.prompt, timerSeconds: 999 } } },
    { ...envelope, flow: { ...envelope.flow, prompt: null } },
    { ...envelope, flow: { ...envelope.flow, complete: true } },
    { ...envelope, flow: { ...envelope.flow, lastDtWordId: targets[1].id } },
  ]
  for (const candidate of impossible) assert.equal(validateAcquisitionProgressEnvelope(candidate, context).valid, false)
})

test('an unverified or future receipt cannot turn unapplied work into an idempotent no-op', () => {
  const envelope = startedEnvelope()
  const checkpoint = answerCheckpoint(envelope)
  const fakeReceipt = {
    progressionId: envelope.id,
    transitionId: checkpoint.transitionId,
    payloadFingerprint: checkpoint.payloadFingerprint,
    operation: checkpoint.operation,
    promptId: checkpoint.promptId,
    expectedRevision: checkpoint.expectedRevision,
    appliedRevision: 999,
    appliedAt: '2099-01-01T00:00:00.000Z',
  }
  const result = applyAcquisitionCheckpoint(envelope, checkpoint, context, fakeReceipt)
  assert.equal(result.status, 'conflict')
  if (result.status === 'conflict') assert.match(result.reason, /exact checkpoint application/)
})

test('a receipt for the wrong applied revision cannot prove an older checkpoint was committed', () => {
  const firstEnvelope = startedEnvelope()
  const firstCheckpoint = answerCheckpoint(firstEnvelope)
  const afterFirst = applied(firstEnvelope, firstCheckpoint)
  const secondCheckpoint = answerCheckpoint(afterFirst, true, () => 0, 2)
  const afterSecond = applied(afterFirst, secondCheckpoint)
  const impossibleReceipt = {
    progressionId: afterSecond.id,
    transitionId: firstCheckpoint.transitionId,
    payloadFingerprint: firstCheckpoint.payloadFingerprint,
    operation: firstCheckpoint.operation,
    promptId: firstCheckpoint.promptId,
    expectedRevision: firstCheckpoint.expectedRevision,
    appliedRevision: 2,
    appliedAt: afterSecond.updatedAt,
  }
  const result = applyAcquisitionCheckpoint(afterSecond, firstCheckpoint, context, impossibleReceipt)
  assert.equal(result.status, 'conflict')
  if (result.status === 'conflict') assert.match(result.reason, /exact checkpoint application/)
})

test('an unfinished progression can continue after its dataset advances into Test Review', () => {
  const initial = startedEnvelope()
  const reviewContext: AcquisitionPersistenceContext = { ...context, lifecycleStage: { kind: 'test-review', cycle: 1 } }
  const historicalRead = migrateAcquisitionProgress(initial, reviewContext)
  assert.equal(historicalRead.status, 'already-current')
  if (historicalRead.status !== 'quarantined') assert.deepEqual(historicalRead.envelope.lifecycleStageAtLastCheckpoint, { kind: 'acquisition' })
  const checkpoint = buildAcquisitionCheckpoint({ envelope: initial, response: { correct: true, revealMethod: 'timer' }, answeredPromptId: initial.flow.prompt!.id, sessionId: 'session-1', occurredAt: '2026-09-29T16:00:01.000Z', context: reviewContext, random: () => 0 })
  const result = applyAcquisitionCheckpoint(initial, checkpoint, reviewContext)
  assert.equal(result.status, 'applied')
  assert.deepEqual(result.envelope.lifecycleStageAtLastCheckpoint, { kind: 'test-review', cycle: 1 })
  assert.equal(validateAcquisitionProgressEnvelope(result.envelope, reviewContext).valid, true)
})

test('DT-only practice can resume exactly once from the terminal teaching state', () => {
  let envelope = startedEnvelope()
  let guard = 1
  while (!envelope.flow.complete) {
    envelope = applied(envelope, answerCheckpoint(envelope, true, () => 0, guard))
    guard += 1
  }
  const resume = buildAcquisitionResumeCheckpoint({ envelope, sessionId: 'session-2', occurredAt: '2026-09-29T16:01:00.000Z', context, random: () => 0.75 })
  const resumed = applied(envelope, resume)
  assert.throws(
    () => buildAcquisitionResumeCheckpoint({ envelope: resumed, sessionId: 'session-3', occurredAt: '2026-09-29T16:02:00.000Z', context, random: () => 0.75 }),
    /terminal teaching flow/,
  )
})

test('canonical persistence serialization uses locale-independent code-unit ordering', () => {
  assert.equal(stableAcquisitionSerialization({ ä: 1, z: 2, a: 3, 写: 4 }), '{"a":3,"z":2,"ä":1,"写":4}')
  assert.equal(
    stableAcquisitionSerialization({ errors: { 写: 1, a: 2, z: 3 } }),
    '{"errors":{"a":2,"z":3,"写":1}}',
  )
})

test('legacy records migrate without losing the position and Established terminology normalizes to Familiar', () => {
  const current = startAcquisition(targetSet, grade2AcquisitionStrategy, () => 0)
  const oldFamiliar = { ...grade2AcquisitionStrategy.familiarDtTargets[0], id: 'established-dt-1', datasetId: '__established-dt__' }
  const legacyFlow = {
    ...current,
    strategyId: 'grade2-acquisition-v2',
    strategyVersion: 2,
    familiarDtBag: undefined,
    establishedDtBag: [oldFamiliar],
    prompt: current.prompt ? { ...current.prompt, kind: 'established-dt', word: oldFamiliar, dtPoolType: 'established' } : null,
  }
  const raw = { id: 'maya::week-1::tier-1-writing', childId: 'maya', datasetId: 'week-1', grade: 'Grade 2', flow: legacyFlow, updatedAt: startedAt }
  const migrated = migrateAcquisitionProgress(raw, context)
  assert.equal(migrated.status, 'migrated')
  if (migrated.status !== 'quarantined') {
    assert.equal(migrated.envelope.flow.strategyId, grade2AcquisitionStrategy.id)
    assert.equal(migrated.envelope.flow.prompt?.kind, 'familiar-dt')
    assert.equal(migrated.envelope.flow.prompt?.word.id, 'familiar-dt-1')
    assert.equal('establishedDtBag' in migrated.envelope.flow, false)
    assert.equal(validateAcquisitionProgressEnvelope(migrated.envelope, context).valid, true)
    assert.equal(migrateAcquisitionProgress(migrated.envelope, context).status, 'already-current')
  }
})

test('legacy migration rejects a later target when an earlier target has no completion evidence', () => {
  const laterBase = startAcquisition({ id: targetSet.id, targets: [targets[1]] }, grade2AcquisitionStrategy, () => 0)
  assert.ok(laterBase.prompt)
  const skippedTargetFlow = {
    ...laterBase,
    targetIndex: 1,
    currentTarget: targets[1],
    prompt: {
      ...laterBase.prompt,
      id: `${targetSet.id}-1-${laterBase.phase}-${laterBase.step}-${laterBase.trialNumber}-${laterBase.prompt.kind}-${laterBase.prompt.word.id}`,
    },
  }
  const raw = { id: 'legacy-skipped-target', childId: 'maya', datasetId: targetSet.id, grade: 'Grade 2', flow: skippedTargetFlow, updatedAt: startedAt }
  const migrated = migrateAcquisitionProgress(raw, context)
  assert.equal(migrated.status, 'quarantined')
  if (migrated.status === 'quarantined') assert.match(migrated.reason, /missing completed target/)
})

test('every current Introduction, Expanded, Correction, and DT-practice position survives unversioned migration', () => {
  const assertMigratesExactly = (flow: ReturnType<typeof startAcquisition>, suffix: string) => {
    const raw = { id: `legacy-${suffix}`, childId: 'maya', datasetId: 'week-1', grade: 'Grade 2', flow, updatedAt: startedAt }
    const result = migrateAcquisitionProgress(raw, context)
    assert.equal(result.status, 'migrated')
    if (result.status !== 'quarantined') assert.deepEqual(result.envelope.flow, flow)
  }

  let successful = startAcquisition(targetSet, grade2AcquisitionStrategy, () => 0)
  let guard = 0
  while (!successful.complete && guard < 100) {
    assertMigratesExactly(successful, `success-${guard}`)
    successful = transitionAcquisition(revealAcquisition(successful), targetSet, grade2AcquisitionStrategy, { correct: true, revealMethod: 'timer' }, () => 0).nextFlow
    guard += 1
  }

  let correction = startAcquisition(targetSet, grade2AcquisitionStrategy, () => 0)
  for (let index = 0; index < 3; index += 1) correction = transitionAcquisition(revealAcquisition(correction), targetSet, grade2AcquisitionStrategy, { correct: true, revealMethod: 'timer' }, () => 0).nextFlow
  correction = transitionAcquisition(revealAcquisition(correction), targetSet, grade2AcquisitionStrategy, { correct: false, revealMethod: 'timer' }, () => 0).nextFlow
  for (let index = 0; index < grade2AcquisitionStrategy.correctionSequence.length; index += 1) {
    assertMigratesExactly(correction, `correction-${index}`)
    correction = transitionAcquisition(revealAcquisition(correction), targetSet, grade2AcquisitionStrategy, { correct: true, revealMethod: 'timer' }, () => 0).nextFlow
  }

  const dtPractice = resumeAcquisition(successful, targetSet, grade2AcquisitionStrategy, () => 0.75)
  assertMigratesExactly(dtPractice, 'dt-practice')
})

test('malformed or mismatched legacy progress is quarantined without altering the raw record', () => {
  const raw = { id: 'legacy', childId: 'other-child', datasetId: 'week-1', grade: 'Grade 2', flow: {}, updatedAt: startedAt }
  const before = JSON.stringify(raw)
  const result = migrateAcquisitionProgress(raw, context)
  assert.equal(result.status, 'quarantined')
  assert.equal(JSON.stringify(raw), before)
  if (result.status === 'quarantined') assert.equal(result.raw, raw)
})

test('a versioned strategy change requires an explicit upgrade path', () => {
  const envelope = startedEnvelope()
  const old = {
    ...envelope,
    strategyId: 'grade2-acquisition-v2',
    strategyVersion: 2,
    strategyFingerprint: 'acq-strategy-v1-legacy',
    flow: { ...envelope.flow, strategyId: 'grade2-acquisition-v2', strategyVersion: 2 },
  }
  assert.equal(migrateAcquisitionProgress(old, context).status, 'quarantined')
  const upgradeContext: AcquisitionPersistenceContext = {
    ...context,
    strategyUpgrades: [{
      id: 'grade2-acquisition-v2-to-v3',
      fromStrategyId: 'grade2-acquisition-v2',
      fromStrategyVersion: 2,
      fromStrategyFingerprint: 'acq-strategy-v1-legacy',
      toStrategyId: grade2AcquisitionStrategy.id,
      toStrategyVersion: grade2AcquisitionStrategy.version,
      upgrade: (flow) => ({ ...flow, strategyId: grade2AcquisitionStrategy.id, strategyVersion: grade2AcquisitionStrategy.version }),
    }],
  }
  const result = migrateAcquisitionProgress(old, upgradeContext)
  assert.equal(result.status, 'migrated')
  if (result.status !== 'quarantined') {
    assert.equal(result.envelope.strategyId, grade2AcquisitionStrategy.id)
    assert.equal(validateAcquisitionProgressEnvelope(result.envelope, upgradeContext).valid, true)
  }
})

test('a strategy upgrade requires its exact source fingerprint and cannot rewrite target order', () => {
  let completed = startedEnvelope()
  let guard = 1
  while (!completed.flow.complete) {
    completed = applied(completed, answerCheckpoint(completed, true, () => 0, guard))
    guard += 1
  }
  const oldFingerprint = 'acq-strategy-v1-exact-old'
  const old = {
    ...completed,
    strategyId: 'grade2-acquisition-v2',
    strategyVersion: 2,
    strategyFingerprint: oldFingerprint,
    flow: { ...completed.flow, strategyId: 'grade2-acquisition-v2', strategyVersion: 2 },
  }
  const upgrade = {
    id: 'grade2-acquisition-v2-to-v3',
    fromStrategyId: 'grade2-acquisition-v2',
    fromStrategyVersion: 2,
    fromStrategyFingerprint: oldFingerprint,
    toStrategyId: grade2AcquisitionStrategy.id,
    toStrategyVersion: grade2AcquisitionStrategy.version,
    upgrade: (flow: typeof completed.flow) => ({ ...flow, strategyId: grade2AcquisitionStrategy.id, strategyVersion: grade2AcquisitionStrategy.version }),
  }
  const wrongFingerprintContext: AcquisitionPersistenceContext = {
    ...context,
    strategyUpgrades: [{ ...upgrade, fromStrategyFingerprint: 'acq-strategy-v1-different-old' }],
  }
  assert.equal(migrateAcquisitionProgress(old, wrongFingerprintContext).status, 'quarantined')

  const reversedContext: AcquisitionPersistenceContext = {
    ...context,
    targetSet: { ...targetSet, targets: [...targets].reverse() },
    strategyUpgrades: [upgrade],
  }
  const reordered = migrateAcquisitionProgress(old, reversedContext)
  assert.equal(reordered.status, 'quarantined')
  if (reordered.status === 'quarantined') assert.match(reordered.reason, /cannot change the canonical ordered target set/)
})

test('collection migration preserves unrelated valid progress when one record is malformed', () => {
  const valid = { id: 'legacy-valid', childId: 'maya', datasetId: 'week-1', grade: 'Grade 2', flow: startAcquisition(targetSet, grade2AcquisitionStrategy, () => 0), updatedAt: startedAt }
  const malformed = { id: 'legacy-bad', childId: 'other-child', datasetId: 'week-1', grade: 'Grade 2', flow: {}, updatedAt: startedAt }
  const result = migrateAcquisitionProgressCollection([malformed, valid], () => context)
  assert.equal(result.envelopes.length, 1)
  assert.equal(result.envelopes[0].childId, 'maya')
  assert.equal(result.quarantined.length, 1)
  assert.equal(result.quarantined[0].index, 0)
  assert.equal(result.quarantined[0].raw, malformed)
})

test('strict validation rejects changed targets, revealed prompts, and impossible revision ledgers', () => {
  const envelope = startedEnvelope()
  const changedContext = { ...context, targetSet: { ...targetSet, targets: [{ ...targets[0], text: '改变' }, targets[1]] } }
  const changedStrategyContext = { ...context, strategy: { ...grade2AcquisitionStrategy, dtObservationMode: 'discard' as const } }
  assert.equal(validateAcquisitionProgressEnvelope(envelope, changedContext).valid, false)
  assert.equal(validateAcquisitionProgressEnvelope(envelope, changedStrategyContext).valid, false)
  assert.equal(validateAcquisitionProgressEnvelope({ ...envelope, flow: { ...envelope.flow, prompt: envelope.flow.prompt ? { ...envelope.flow.prompt, revealed: true } : null } }, context).valid, false)
  assert.equal(validateAcquisitionProgressEnvelope({ ...envelope, flow: { ...envelope.flow, earnedDtPool: [targets[1]] } }, context).valid, false)
  assert.equal(validateAcquisitionProgressEnvelope({ ...envelope, revision: 1 }, context).valid, false)
})

test('the contract remains grade-neutral while preserving grade-owned strategy identity', () => {
  const kindergartenTargets: AcquisitionTargetSet = { id: 'kindergarten-week-1', targets: [{ ...targets[0], id: 'kindergarten-word-1', datasetId: 'kindergarten-week-1' }] }
  const kindergartenContext: AcquisitionPersistenceContext = {
    identity: { childId: 'rhys', datasetId: kindergartenTargets.id, grade: 'Kindergarten', schoolYear: '2026-27', activityModule: 'mandarin-tier1-writing', tier: 'tier-1' },
    lifecycleStage: { kind: 'acquisition' },
    applicationVersion: '0.2.0-stage2',
    targetSet: kindergartenTargets,
    strategy: kindergartenAcquisitionStrategy,
  }
  const envelope = createAcquisitionProgressEnvelope(kindergartenContext, startAcquisition(kindergartenTargets, kindergartenAcquisitionStrategy, () => 0), startedAt)
  assert.equal(validateAcquisitionProgressEnvelope(envelope, kindergartenContext).valid, true)
  assert.equal(envelope.strategyId, 'kindergarten-acquisition-v1')
  assert.notEqual(envelope.id, startedEnvelope().id)
})
