import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyWarmupTransitionToAppState,
  grade2AdaptiveWarmupRegistry,
  prepareAdaptiveWarmupVisit,
} from '../src/application/warmup/index.ts'
import { createInitialState, resolveDatasetLifecycles } from '../src/domain.ts'
import { grade2DeckProfile, importWeeklyDatasets } from '../src/slidesImporter.ts'
import { grade2Tier1WritingAdaptiveWarmupProfile } from '../src/warmup/adaptive/profiles/grade2.ts'
import { buildWarmupAnswerTransition, buildWarmupFinalizationTransition } from '../src/warmup/visits/reducer.ts'
import { validateAdaptiveWarmupV3Projection } from '../src/warmup/adaptive/validation.ts'

const presentation = {
  presentationId: grade2DeckProfile.sourceDeckId,
  slides: [
    { objectId: 'week-1', text: 'Week 8/31-9/4\nMandarin\nTier 1: 甲、乙、丙、丁、戊' },
    { objectId: 'week-2', text: 'Week 9/8-9/11\nMandarin\nTier 1: 己、庚、辛、壬、癸' },
    { objectId: 'week-3', text: 'Week 9/14-9/18\nMandarin\nTier 1: 子、丑、寅、卯、辰' },
    { objectId: 'week-4', text: 'Week 9/21-9/25\nMandarin\nTier 1: 巳、午、未、申、酉' },
  ],
}
const datasets = importWeeklyDatasets(presentation, [], grade2DeckProfile).datasets
const today = new Date(2026, 8, 23, 9, 0)
const lifecycleResolution = resolveDatasetLifecycles(datasets, today)
const schoolYear = datasets[0].schoolYear

function prepare(state = createInitialState(datasets), visitId = 'session-1-warmup') {
  return prepareAdaptiveWarmupVisit({
    state,
    childId: 'maya',
    grade: 'Grade 2',
    schoolYear,
    datasets,
    lifecycleResolution,
    visitType: 'pre-activity',
    visitId,
    createdAt: '2026-09-23T16:00:00.000Z',
    associatedPrimaryActivity: { phase: 'acquisition', datasetId: lifecycleResolution.acquisition!.id },
    random: () => 0.999,
  })
}

test('production preparation migrates legacy state and materializes the approved Adaptive Warmup queue', () => {
  const prepared = prepare()
  assert.equal(prepared.status, 'ready')
  if (prepared.status !== 'ready') return
  assert.equal(prepared.resumed, false)
  assert.equal(prepared.visit.visitType, 'pre-activity')
  assert.equal(prepared.visit.assignedQueueSize, 6)
  assert.equal(new Set(prepared.visit.queue.map((entry) => entry.masteryTermId)).size, 6)
  assert.equal(prepared.visit.queue.some((entry) => lifecycleResolution.acquisition?.words.some((word) => word.id === entry.prompt.wordId)), false)
  assert.equal(prepared.visit.queue.some((entry) => lifecycleResolution.testReview?.words.some((word) => word.id === entry.prompt.wordId)), false)
  assert.ok(prepared.state.adaptiveWarmup)
  assert.deepEqual(validateAdaptiveWarmupV3Projection(prepared.state.adaptiveWarmup, { profileRegistry: grade2AdaptiveWarmupRegistry }), { valid: true, errors: [] })
})

test('an answered visit persists its exact next position and resumes the same materialized queue', () => {
  const prepared = prepare()
  assert.equal(prepared.status, 'ready')
  if (prepared.status !== 'ready') return
  const firstEntry = prepared.visit.queue[0]
  const childState = prepared.state.adaptiveWarmup!.childStates.find((state) => state.childId === 'maya' && state.masteryTermId === firstEntry.masteryTermId)!
  const transition = buildWarmupAnswerTransition({
    visit: prepared.visit,
    mastery: { revision: 0, state: childState },
    profile: grade2Tier1WritingAdaptiveWarmupProfile,
    correct: true,
    revealMethod: 'timer',
    occurredAt: '2026-09-23T16:01:00.000Z',
  })
  const applied = applyWarmupTransitionToAppState(prepared.state, transition)
  assert.equal(applied.status, 'applied')
  const resumed = prepare(applied.state, 'ignored-new-id')
  assert.equal(resumed.status, 'ready')
  if (resumed.status !== 'ready') return
  assert.equal(resumed.resumed, true)
  assert.equal(resumed.visit.id, prepared.visit.id)
  assert.equal(resumed.visit.nextPosition, 1)
  assert.equal(resumed.visit.queue[0].status, 'answered')
  assert.equal(resumed.state.warmupAttemptsV1?.length, 1)
  assert.equal(resumed.state.warmupGraphPointsV1?.length, 1)
})

test('a partial visit closes permanently while its one graph point remains updatable by visit identity', () => {
  const prepared = prepare()
  assert.equal(prepared.status, 'ready')
  if (prepared.status !== 'ready') return
  const entry = prepared.visit.queue[0]
  const childState = prepared.state.adaptiveWarmup!.childStates.find((state) => state.childId === 'maya' && state.masteryTermId === entry.masteryTermId)!
  const answer = buildWarmupAnswerTransition({ visit: prepared.visit, mastery: { revision: 0, state: childState }, profile: grade2Tier1WritingAdaptiveWarmupProfile, correct: false, revealMethod: 'timer', occurredAt: '2026-09-23T16:01:00.000Z' })
  const answered = applyWarmupTransitionToAppState(prepared.state, answer)
  assert.equal(answered.status, 'applied')
  const partial = buildWarmupFinalizationTransition({ visit: answer.nextVisit, operation: 'finalize-partial', occurredAt: '2026-09-23T16:02:00.000Z' })
  const finalized = applyWarmupTransitionToAppState(answered.state, partial)
  assert.equal(finalized.status, 'applied')
  assert.equal(finalized.state.warmupVisitsV1?.[0].status, 'partial')
  assert.equal(finalized.state.warmupGraphPointsV1?.length, 1)
  assert.equal(finalized.state.warmupGraphPointsV1?.[0].status, 'partial')
  const next = prepare(finalized.state, 'session-2-warmup')
  assert.equal(next.status, 'ready')
  if (next.status === 'ready') assert.equal(next.visit.id, 'session-2-warmup')
})

test('unsupported grades cannot silently inherit the Grade 2 Warmup profile', () => {
  const prepared = prepareAdaptiveWarmupVisit({
    state: createInitialState(datasets),
    childId: 'maya',
    grade: 'Grade 5',
    schoolYear,
    datasets,
    lifecycleResolution,
    visitType: 'standalone',
    visitId: 'grade5-visit',
    createdAt: '2026-09-23T16:00:00.000Z',
  })
  assert.equal(prepared.status, 'blocked')
})
