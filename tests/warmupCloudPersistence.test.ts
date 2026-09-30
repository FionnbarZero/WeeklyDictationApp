import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyWarmupTransitionToAppState,
  cloudWarmupSeedForVisit,
  createWarmupAnswerCheckpoint,
  createWarmupFinalizationCheckpoint,
  hydrateAdaptiveWarmupCloud,
  prepareAdaptiveWarmupVisit,
  recoverWarmupTransitions,
  synchronizeAdaptiveWarmupCloud,
  wordsForWarmupVisit,
} from '../src/application/warmup/index.ts'
import { createInitialState, resolveDatasetLifecycles } from '../src/domain.ts'
import { decodeCloudWarmupVisits, encodeCloudWarmupVisit } from '../src/persistence/warmup/cloudCodec.ts'
import { buildWarmupSeedRecordWrites, buildWarmupTransitionRecordWrites, reconcileWarmupSeedRecord, warmupReceiptMatchesTransition } from '../src/persistence/warmup/cloudWrites.ts'
import type { PendingWarmupCommit } from '../src/persistence/warmup/pendingJournal.ts'
import { createApplicationBackup, restoreApplicationBackup } from '../src/persistence/applicationBackup.ts'
import { grade2DeckProfile, importWeeklyDatasets } from '../src/slidesImporter.ts'

const datasets = importWeeklyDatasets({
  presentationId: grade2DeckProfile.sourceDeckId,
  slides: [
    { objectId: 'week-1', text: 'Week 8/31-9/4\nMandarin\nTier 1: 甲、乙、丙、丁、戊' },
    { objectId: 'week-2', text: 'Week 9/8-9/11\nMandarin\nTier 1: 己、庚、辛、壬、癸' },
    { objectId: 'week-3', text: 'Week 9/14-9/18\nMandarin\nTier 1: 子、丑、寅、卯、辰' },
    { objectId: 'week-4', text: 'Week 9/21-9/25\nMandarin\nTier 1: 巳、午、未、申、酉' },
  ],
}, [], grade2DeckProfile).datasets
const lifecycleResolution = resolveDatasetLifecycles(datasets, new Date(2026, 8, 23, 9, 0))

function preparedVisit() {
  const prepared = prepareAdaptiveWarmupVisit({
    state: createInitialState(datasets),
    childId: 'maya',
    grade: 'Grade 2',
    schoolYear: datasets[0].schoolYear,
    datasets,
    lifecycleResolution,
    visitType: 'standalone',
    visitId: 'cloud-warmup-visit',
    createdAt: '2026-09-23T16:00:00.000Z',
    random: () => 0.999,
  })
  assert.equal(prepared.status, 'ready')
  if (prepared.status !== 'ready') throw new Error(prepared.reason)
  return prepared
}

function cloudMasteryAfterAnswer(prepared: ReturnType<typeof preparedVisit>, nextMastery: NonNullable<ReturnType<typeof createWarmupAnswerCheckpoint>['transition']['nextMastery']>) {
  return cloudWarmupSeedForVisit(prepared.state, prepared.visit).mastery.map((item) => item.state.id === nextMastery.state.id ? nextMastery : item)
}

test('the cloud seed contains only the bounded visit mastery states and rotation state as create-only writes', () => {
  const prepared = preparedVisit()
  const seed = cloudWarmupSeedForVisit(prepared.state, prepared.visit)
  assert.equal(seed.mastery.length, prepared.visit.assignedQueueSize)
  assert.ok(seed.mastery.every((item) => prepared.visit.queue.some((entry) => entry.masteryTermId === item.state.masteryTermId)))
  const writes = buildWarmupSeedRecordWrites('maya', prepared.visit, seed.mastery, seed.rotations)
  assert.equal(writes.length, 1 + prepared.visit.queue.length + seed.mastery.length + seed.rotations.length)
  assert.ok(writes.every((write) => write.precondition === 'create'))
  assert.equal(writes[0].collection, 'warmupVisits')
  assert.equal(writes[0].id, 'cloud-warmup-visit')
  assert.equal(writes.filter((write) => write.collection === 'warmupQueueEntries').length, prepared.visit.queue.length)
})

test('seed reconciliation accepts exact records, advances only rotation cycles, and rejects changed mastery provenance', () => {
  const prepared = preparedVisit()
  const seed = cloudWarmupSeedForVisit(prepared.state, prepared.visit)
  const writes = buildWarmupSeedRecordWrites('maya', prepared.visit, seed.mastery, seed.rotations)
  const mastery = writes.find((write) => write.collection === 'warmupMastery')!
  const rotation = writes.find((write) => write.collection === 'warmupRotations')!
  assert.equal(reconcileWarmupSeedRecord(mastery, mastery.value), null)
  assert.throws(() => reconcileWarmupSeedRecord(mastery, { ...mastery.value, unexpectedProvenance: true }), /conflicts with saved progress/i)
  const previousRotation = { ...rotation.value, cycle: Number(rotation.value.cycle) - 1 }
  assert.equal(reconcileWarmupSeedRecord(rotation, previousRotation)?.precondition, 'update')
})

test('one cloud Warmup transition contains the exact visit, mastery, receipt, attempt, and graph writes', () => {
  const prepared = preparedVisit()
  const checkpoint = createWarmupAnswerCheckpoint({ state: prepared.state, visitId: prepared.visit.id, correct: true, revealMethod: 'timer', occurredAt: '2026-09-23T16:01:00.000Z' })
  const writes = buildWarmupTransitionRecordWrites('maya', checkpoint.transition)
  assert.equal(writes.length, 6)
  assert.ok(warmupReceiptMatchesTransition(checkpoint.transition.nextVisit.lastAppliedTransition!, checkpoint.transition))
  const collections = writes.map((write) => write.collection)
  for (const collection of ['warmupVisits', 'warmupQueueEntries', 'warmupMastery', 'warmupTransitions', 'warmupAttempts', 'warmupGraphPoints']) assert.ok(collections.includes(collection as typeof collections[number]))
})

test('a finalization write plan updates no queue-entry record', () => {
  const prepared = preparedVisit()
  const answer = createWarmupAnswerCheckpoint({ state: prepared.state, visitId: prepared.visit.id, correct: true, revealMethod: 'timer', occurredAt: '2026-09-23T16:01:00.000Z' })
  const applied = applyWarmupTransitionToAppState(prepared.state, answer.transition)
  assert.equal(applied.status, 'applied')
  if (applied.status !== 'applied') return
  const finalization = createWarmupFinalizationCheckpoint({ state: applied.state, visitId: prepared.visit.id, operation: 'finalize-partial', occurredAt: '2026-09-23T16:02:00.000Z' })
  const writes = buildWarmupTransitionRecordWrites('maya', finalization.transition)
  assert.equal(writes.some((write) => write.collection === 'warmupQueueEntries'), false)
  assert.deepEqual(writes.map((write) => write.collection), ['warmupVisits', 'warmupTransitions', 'warmupGraphPoints'])
})

test('cloud visit metadata and queue records round-trip without embedding the queue array', () => {
  const prepared = preparedVisit()
  const encoded = encodeCloudWarmupVisit(prepared.visit)
  assert.equal('queue' in encoded.visit, false)
  assert.deepEqual(encoded.visit.queueEntryIds, prepared.visit.queue.map((entry) => entry.id))
  const decoded = decodeCloudWarmupVisits([encoded.visit], encoded.queueEntries)
  assert.deepEqual(decoded.visits, [prepared.visit])
  assert.deepEqual(decoded.issues, [])
})

test('cloud visit decoding quarantines a missing queue entry without shifting positions', () => {
  const prepared = preparedVisit()
  const encoded = encodeCloudWarmupVisit(prepared.visit)
  const decoded = decodeCloudWarmupVisits([encoded.visit], encoded.queueEntries.slice(1))
  assert.deepEqual(decoded.visits, [])
  assert.equal(decoded.issues.some((issue) => issue.collection === 'visits'), true)
  assert.equal(decoded.issues.some((issue) => issue.collection === 'queue-entries'), true)
})

test('cloud hydration preserves valid records while quarantining one malformed record individually', () => {
  const prepared = preparedVisit()
  const checkpoint = createWarmupAnswerCheckpoint({ state: prepared.state, visitId: prepared.visit.id, correct: false, revealMethod: 'skip_timer', occurredAt: '2026-09-23T16:01:00.000Z' })
  const applied = applyWarmupTransitionToAppState(prepared.state, checkpoint.transition)
  assert.equal(applied.status, 'applied')
  if (applied.status !== 'applied') return
  const hydrated = hydrateAdaptiveWarmupCloud({
    state: createInitialState(datasets),
    childId: 'maya',
    grade: 'Grade 2',
    schoolYear: datasets[0].schoolYear,
    datasets,
    lifecycleResolution,
    mastery: cloudMasteryAfterAnswer(prepared, checkpoint.transition.nextMastery!),
    visits: [checkpoint.transition.nextVisit],
    receipts: [checkpoint.transition.nextVisit.lastAppliedTransition!],
    attempts: [checkpoint.transition.attempt!],
    graphPoints: [checkpoint.transition.graphPoint!, { ...checkpoint.transition.graphPoint!, id: 'malformed-graph' }],
    rotations: applied.state.adaptiveWarmup!.rotationStates,
    hydratedAt: '2026-09-23T16:02:00.000Z',
  })
  assert.equal(hydrated.warmupGraphPointsV1?.length, 1)
  assert.equal(hydrated.warmupAttemptsV1?.length, 1)
  assert.equal(hydrated.warmupCloudQuarantineV1?.length, 1)
  assert.equal(hydrated.warmupCloudQuarantineV1?.[0].collection, 'graph-points')
})

test('cloud hydration requires attempts and graph points to be named by their immutable receipts', () => {
  const prepared = preparedVisit()
  const checkpoint = createWarmupAnswerCheckpoint({ state: prepared.state, visitId: prepared.visit.id, correct: true, revealMethod: 'timer', occurredAt: '2026-09-23T16:01:00.000Z' })
  const detachedAttempt = { ...checkpoint.transition.attempt!, id: 'warmup-attempt-v1-0000000000000000' }
  const detachedGraph = { ...checkpoint.transition.graphPoint!, id: 'warmup-graph-v1-0000000000000000' }
  const hydrated = hydrateAdaptiveWarmupCloud({
    state: createInitialState(datasets),
    childId: 'maya',
    grade: 'Grade 2',
    schoolYear: datasets[0].schoolYear,
    datasets,
    lifecycleResolution,
    mastery: cloudMasteryAfterAnswer(prepared, checkpoint.transition.nextMastery!),
    visits: [checkpoint.transition.nextVisit],
    receipts: [checkpoint.transition.nextVisit.lastAppliedTransition!],
    attempts: [detachedAttempt],
    graphPoints: [detachedGraph],
    rotations: prepared.state.adaptiveWarmup!.rotationStates,
    hydratedAt: '2026-09-23T16:02:00.000Z',
  })
  assert.equal(hydrated.warmupAttemptsV1?.length, 0)
  assert.equal(hydrated.warmupGraphPointsV1?.length, 0)
  assert.deepEqual(hydrated.warmupCloudQuarantineV1?.map((issue) => issue.collection).sort(), ['attempts', 'graph-points'])
})

test('cloud hydration quarantines a mastery record that conflicts with the canonical curriculum graph', () => {
  const prepared = preparedVisit()
  const checkpoint = createWarmupAnswerCheckpoint({ state: prepared.state, visitId: prepared.visit.id, correct: true, revealMethod: 'timer', occurredAt: '2026-09-23T16:01:00.000Z' })
  const mastery = checkpoint.transition.nextMastery!
  const conflicting = {
    ...mastery,
    state: {
      ...mastery.state,
      integratedOccurrences: [{
        ...mastery.state.integratedOccurrences[0],
        occurrenceId: 'occurrence-that-does-not-exist',
      }],
    },
  }
  const hydrated = hydrateAdaptiveWarmupCloud({
    state: createInitialState(datasets),
    childId: 'maya',
    grade: 'Grade 2',
    schoolYear: datasets[0].schoolYear,
    datasets,
    lifecycleResolution,
    mastery: [conflicting],
    visits: [],
    receipts: [],
    attempts: [],
    graphPoints: [],
    rotations: [],
    hydratedAt: '2026-09-23T16:02:00.000Z',
  })
  assert.equal(hydrated.warmupCloudQuarantineV1?.length, 1)
  assert.equal(hydrated.warmupCloudQuarantineV1?.[0].collection, 'mastery')
  assert.ok(hydrated.adaptiveWarmup?.childStates.every((state) => state.integratedOccurrences.every((record) => record.occurrenceId !== 'occurrence-that-does-not-exist')))
})

test('a missing canonical prompt fails closed without shifting later queue positions', () => {
  const prepared = preparedVisit()
  assert.ok(prepared.visit.queue.length > 1)
  const first = prepared.visit.queue[0]
  const stateWithoutFirstPrompt = {
    ...prepared.state,
    datasets: prepared.state.datasets.map((dataset) => dataset.id === first.prompt.datasetId
      ? { ...dataset, words: dataset.words.filter((word) => word.id !== first.prompt.wordId) }
      : dataset),
  }
  assert.throws(() => wordsForWarmupVisit(stateWithoutFirstPrompt, prepared.visit), /queue was not shifted/i)
})

test('a pending journal transition restores from its exact base and rejects a stale base', () => {
  const prepared = preparedVisit()
  const checkpoint = createWarmupAnswerCheckpoint({ state: prepared.state, visitId: prepared.visit.id, correct: true, revealMethod: 'timer', occurredAt: '2026-09-23T16:01:00.000Z' })
  const entry: PendingWarmupCommit = { transition: checkpoint.transition, baseVisit: checkpoint.baseVisit, baseMastery: checkpoint.baseMastery }
  const recovered = recoverWarmupTransitions(prepared.state, [entry])
  assert.equal(recovered.status, 'recovered')
  assert.equal(recovered.state.warmupVisitsV1?.[0].revision, 1)
  const stale = recoverWarmupTransitions({ ...prepared.state, warmupVisitsV1: [{ ...prepared.visit, revision: 1 }] }, [entry])
  assert.equal(stale.status, 'blocked')
})

test('the application backup restores a pending Warmup checkpoint with its exact base revisions', () => {
  const prepared = preparedVisit()
  const checkpoint = createWarmupAnswerCheckpoint({ state: prepared.state, visitId: prepared.visit.id, correct: true, revealMethod: 'timer', occurredAt: '2026-09-23T16:01:00.000Z' })
  const pending: PendingWarmupCommit = { transition: checkpoint.transition, baseVisit: checkpoint.baseVisit, baseMastery: checkpoint.baseMastery }
  const serialized = createApplicationBackup(prepared.state, [], [pending], '2026-09-23T17:00:00.000Z')
  const restored = restoreApplicationBackup(serialized)
  assert.deepEqual(restored.pendingWarmup, [pending])
  assert.deepEqual(restored.state.warmupVisitsV1, prepared.state.warmupVisitsV1)
})

test('the cloud coordinator reconstructs records and replays one pending transition through an injected transport', async () => {
  const prepared = preparedVisit()
  const checkpoint = createWarmupAnswerCheckpoint({ state: prepared.state, visitId: prepared.visit.id, correct: true, revealMethod: 'timer', occurredAt: '2026-09-23T16:01:00.000Z' })
  const pending: PendingWarmupCommit = { transition: checkpoint.transition, baseVisit: checkpoint.baseVisit, baseMastery: checkpoint.baseMastery }
  const seed = cloudWarmupSeedForVisit(prepared.state, prepared.visit)
  const encoded = encodeCloudWarmupVisit(prepared.visit)
  const committed: string[] = []
  const acknowledged: string[] = []
  const synchronized = await synchronizeAdaptiveWarmupCloud({
    state: createInitialState(datasets),
    childId: 'maya',
    grade: 'Grade 2',
    schoolYear: datasets[0].schoolYear,
    datasets,
    lifecycleResolution,
    records: { visits: [encoded.visit], queueEntries: encoded.queueEntries, mastery: seed.mastery, receipts: [], attempts: [], graphPoints: [], rotations: seed.rotations },
    pending: [pending],
    hydratedAt: '2026-09-23T16:02:00.000Z',
    transport: {
      transitionAlreadyCommitted: async () => false,
      ensureSeed: async () => undefined,
      commitTransition: async (transition) => { committed.push(transition.transitionId); return 'applied' },
      acknowledgeTransition: (transitionId) => acknowledged.push(transitionId),
    },
  })
  assert.equal(synchronized.warmupVisitsV1?.[0].revision, 1)
  assert.deepEqual(committed, [checkpoint.transition.transitionId])
  assert.deepEqual(acknowledged, [checkpoint.transition.transitionId])
})
