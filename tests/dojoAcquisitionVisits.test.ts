import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyAcquisitionCheckpointToAppState,
  createAcquisitionAnswerCheckpoint,
  prepareAcquisitionProgress,
} from '../src/application/acquisitionPersistence.ts'
import { createInitialState, type Dataset, type Word } from '../src/domain.ts'

function occurrence(datasetId: string, id: string, text: string, tier: 'tier-1' | 'tier-2'): Word {
  return {
    id,
    text,
    sentence: '',
    datasetId,
    grade: 'Grade 2',
    language: 'mandarin',
    tier,
    activityType: tier === 'tier-1' ? 'dictation' : 'reading',
  }
}

const datasetId = 'shared-dojo-week'
const tier1 = [occurrence(datasetId, 'write-1', '大', 'tier-1')]
const tier2 = [occurrence(datasetId, 'read-1', '大小', 'tier-2')]
const dataset: Dataset = {
  id: datasetId,
  dateRange: '9/21–9/27',
  startDate: '2026-09-21',
  endDate: '2026-09-27',
  grade: 'Grade 2',
  schoolYear: '2026–2027',
  description: 'Shared Dojo persistence fixture',
  words: tier1,
  vocabulary: { tier1, tier2, tier3: [] },
}

test('Writing, Reading, and Stroke Order own separate durable visit identities', () => {
  let state = { ...createInitialState(), datasets: [dataset] }
  const writing = prepareAcquisitionProgress(state, 'maya', dataset, '2026-09-21T10:00:00.000Z', () => 0)
  assert.equal(writing.status, 'ready')
  if (writing.status !== 'ready') return
  state = writing.state

  const reading = prepareAcquisitionProgress(state, 'maya', dataset, '2026-09-21T10:01:00.000Z', () => 0, {
    experienceId: 'reading',
    startNewVisit: true,
    visitId: 'reading-visit-1',
  })
  assert.equal(reading.status, 'ready')
  if (reading.status !== 'ready') return
  state = reading.state

  const stroke = prepareAcquisitionProgress(state, 'maya', dataset, '2026-09-21T10:02:00.000Z', () => 0, {
    experienceId: 'stroke-order',
    startNewVisit: true,
    visitId: 'stroke-visit-1',
  })
  assert.equal(stroke.status, 'ready')
  if (stroke.status !== 'ready') return

  assert.equal(writing.envelope.experienceId, undefined)
  assert.equal(reading.envelope.experienceId, 'reading')
  assert.equal(reading.envelope.visitId, 'reading-visit-1')
  assert.deepEqual(
    reading.context.targetSet.targets.map((target) => target.id),
    [tier2[0].id],
  )
  assert.equal(stroke.envelope.experienceId, 'stroke-order')
  assert.deepEqual(
    stroke.context.targetSet.targets.map((target) => target.id),
    [tier1[0].id],
  )
  assert.equal(new Set([writing.envelope.id, reading.envelope.id, stroke.envelope.id]).size, 3)
})

test('a legacy Writing quarantine does not block Reading or Stroke Order', () => {
  const state = { ...createInitialState(), datasets: [dataset] }
  state.acquisitionProgressQuarantine = [
    {
      id: 'legacy-writing-quarantine',
      childId: 'maya',
      datasetId,
      reason: 'Legacy Writing progress is malformed.',
      quarantinedAt: '2026-09-21T09:00:00.000Z',
      raw: {},
    },
  ]

  const writing = prepareAcquisitionProgress(state, 'maya', dataset, '2026-09-21T10:00:00.000Z')
  const reading = prepareAcquisitionProgress(state, 'maya', dataset, '2026-09-21T10:01:00.000Z', () => 0, {
    experienceId: 'reading',
    startNewVisit: true,
    visitId: 'reading-visit',
  })
  const stroke = prepareAcquisitionProgress(state, 'maya', dataset, '2026-09-21T10:02:00.000Z', () => 0, {
    experienceId: 'stroke-order',
    startNewVisit: true,
    visitId: 'stroke-visit',
  })

  assert.equal(writing.status, 'blocked')
  assert.equal(reading.status, 'ready')
  assert.equal(stroke.status, 'ready')
})

test('Reading resumes the exact checkpoint and Practice again creates an independent visit', () => {
  const initial = { ...createInitialState(), datasets: [dataset] }
  const prepared = prepareAcquisitionProgress(initial, 'maya', dataset, '2026-09-21T10:00:00.000Z', () => 0, {
    experienceId: 'reading',
    startNewVisit: true,
    visitId: 'reading-visit-1',
  })
  assert.equal(prepared.status, 'ready')
  if (prepared.status !== 'ready' || !prepared.envelope.flow.prompt) return
  const answeredPromptId = prepared.envelope.flow.prompt.id
  const checkpoint = createAcquisitionAnswerCheckpoint({
    envelope: prepared.envelope,
    context: prepared.context,
    response: { correct: true, revealMethod: 'show_answer' },
    answeredPromptId,
    sessionId: 'launch-1',
    occurredAt: '2026-09-21T10:00:10.000Z',
    random: () => 0,
  })
  const applied = applyAcquisitionCheckpointToAppState(prepared.state, checkpoint, prepared.context)
  assert.equal(applied.status, 'applied')

  const resumed = prepareAcquisitionProgress(applied.state, 'maya', dataset, '2026-09-22T10:00:00.000Z', () => 0, {
    experienceId: 'reading',
    progressionId: prepared.envelope.id,
  })
  assert.equal(resumed.status, 'ready')
  if (resumed.status !== 'ready') return
  assert.equal(resumed.envelope.revision, 1)
  assert.equal(resumed.envelope.flow.prompt?.id, checkpoint.nextFlow.prompt?.id)
  assert.notEqual(resumed.envelope.flow.prompt?.id, answeredPromptId)
  assert.deepEqual(
    resumed.state.distractorTargetObservations.map((observation) => observation.id),
    applied.state.distractorTargetObservations.map((observation) => observation.id),
  )
  assert.deepEqual(resumed.state.results, applied.state.results)

  const repeated = prepareAcquisitionProgress(resumed.state, 'maya', dataset, '2026-09-22T10:01:00.000Z', () => 0, {
    experienceId: 'reading',
    startNewVisit: true,
    visitId: 'reading-visit-2',
  })
  assert.equal(repeated.status, 'ready')
  if (repeated.status !== 'ready') return
  assert.notEqual(repeated.envelope.id, resumed.envelope.id)
  assert.equal(repeated.envelope.revision, 0)
  assert.ok(repeated.state.acquisitionProgressEnvelopes?.some((entry) => entry.id === resumed.envelope.id))
})

test('Stroke Order restores the saved prompt and engine retry state without retaining drawing data', () => {
  const initial = { ...createInitialState(), datasets: [dataset] }
  const prepared = prepareAcquisitionProgress(initial, 'maya', dataset, '2026-09-21T11:00:00.000Z', () => 0, {
    experienceId: 'stroke-order',
    startNewVisit: true,
    visitId: 'stroke-visit-1',
  })
  assert.equal(prepared.status, 'ready')
  if (prepared.status !== 'ready' || !prepared.envelope.flow.prompt) return
  const first = createAcquisitionAnswerCheckpoint({
    envelope: prepared.envelope,
    context: prepared.context,
    response: { correct: true, revealMethod: 'show_answer' },
    answeredPromptId: prepared.envelope.flow.prompt.id,
    sessionId: 'stroke-launch-1',
    occurredAt: '2026-09-21T11:00:10.000Z',
    random: () => 0,
  })
  const firstApplied = applyAcquisitionCheckpointToAppState(prepared.state, first, prepared.context)
  assert.equal(firstApplied.status, 'applied')
  assert.ok(firstApplied.envelope.flow.prompt)
  if (!firstApplied.envelope.flow.prompt) return
  const failed = createAcquisitionAnswerCheckpoint({
    envelope: firstApplied.envelope,
    context: prepared.context,
    response: { correct: false, revealMethod: 'show_answer' },
    answeredPromptId: firstApplied.envelope.flow.prompt.id,
    sessionId: 'stroke-launch-1',
    occurredAt: '2026-09-21T11:00:20.000Z',
    random: () => 0,
  })
  const failedApplied = applyAcquisitionCheckpointToAppState(firstApplied.state, failed, prepared.context)
  assert.equal(failedApplied.status, 'applied')

  const resumed = prepareAcquisitionProgress(
    failedApplied.state,
    'maya',
    dataset,
    '2026-09-22T11:00:00.000Z',
    () => 0,
    { experienceId: 'stroke-order', progressionId: prepared.envelope.id },
  )
  assert.equal(resumed.status, 'ready')
  if (resumed.status !== 'ready') return
  assert.equal(resumed.envelope.revision, 2)
  assert.equal(resumed.envelope.flow.prompt?.id, failed.nextFlow.prompt?.id)
  assert.deepEqual(resumed.envelope.flow.consecutiveErrors, failed.nextFlow.consecutiveErrors)
  assert.deepEqual(
    resumed.state.distractorTargetObservations.map((observation) => observation.id),
    failedApplied.state.distractorTargetObservations.map((observation) => observation.id),
  )
  assert.deepEqual(resumed.state.results, failedApplied.state.results)
  assert.equal('drawing' in resumed.envelope, false)
})
