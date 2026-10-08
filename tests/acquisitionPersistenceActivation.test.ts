import assert from 'node:assert/strict'
import test from 'node:test'
import {
  acquisitionPersistenceContext,
  applyAcquisitionCheckpointToAppState,
  createAcquisitionAnswerCheckpoint,
  markAcquisitionCheckpointCommitted,
  prepareAcquisitionProgress,
  recoverAcquisitionCheckpoints,
} from '../src/application/acquisitionPersistence.ts'
import { createInitialState, type AppState, type Dataset } from '../src/domain.ts'
import { startAcquisition } from '../src/acquisition/engine.ts'
import { createAcquisitionProgressEnvelope } from '../src/acquisition/persistence/migration.ts'
import { acquisitionReceiptMatchesCheckpoint, buildCloudAcquisitionCheckpointWrites, cloudDataToAppState } from '../src/firestoreClient.ts'
import { createApplicationBackup, restoreApplicationBackup } from '../src/persistence/applicationBackup.ts'
import {
  ACQUISITION_PENDING_JOURNAL_KEY,
  appendPendingAcquisitionCheckpoint,
  readPendingAcquisitionJournal,
  removePendingAcquisitionCheckpoint,
} from '../src/persistence/acquisitionPendingJournal.ts'
import { grade2DeckProfile, importWeeklyDatasets } from '../src/slidesImporter.ts'

const dataset: Dataset = {
  id: 'grade2-week-1',
  dateRange: '9/28–10/2',
  startDate: '2026-09-28',
  endDate: '2026-10-02',
  grade: 'Grade 2',
  schoolYear: '2026–2027',
  description: 'Week 1',
  words: [
    { id: 'grade2-week-1-word-1', text: '需要', sentence: '我需要一本书。', datasetId: 'grade2-week-1', language: 'mandarin', tier: 'tier-1', activityType: 'dictation' },
    { id: 'grade2-week-1-word-2', text: '部分', sentence: '这是其中一部分。', datasetId: 'grade2-week-1', language: 'mandarin', tier: 'tier-1', activityType: 'dictation' },
  ],
}

function stateWithDataset() {
  return { ...createInitialState(), datasets: [dataset] }
}

test('opening Acquisition creates one versioned progression without changing the outer app-state version', () => {
  const prepared = prepareAcquisitionProgress(stateWithDataset(), 'maya', dataset, '2026-09-29T16:00:00.000Z', () => 0)
  assert.equal(prepared.status, 'ready')
  if (prepared.status !== 'ready') return
  assert.equal(prepared.state.version, 2)
  assert.equal(prepared.state.acquisitionProgressions.length, 0)
  assert.equal(prepared.state.acquisitionProgressEnvelopes?.length, 1)
  assert.equal(prepared.envelope.revision, 0)
  assert.equal(prepared.envelope.activityModule, 'mandarin-tier1-writing')
  assert.equal(prepared.envelope.schoolYear, '2026-27')
})

test('Grade 2 local acquisition pins its lesson and replays a pending answer against the original words', () => {
  const first = prepareAcquisitionProgress(stateWithDataset(), 'maya', dataset, '2026-09-29T16:00:00.000Z', () => 0, true)
  assert.equal(first.status, 'ready')
  if (first.status !== 'ready') return
  assert.ok(first.envelope.lessonSnapshot)
  const checkpoint = createAcquisitionAnswerCheckpoint({ envelope: first.envelope, context: first.context,
    sessionId: 'session-pinned', occurredAt: '2026-09-29T16:01:00.000Z',
    answeredPromptId: first.envelope.flow.prompt!.id,
    response: { correct: true, revealMethod: 'timer' }, random: () => 0 })
  const updatedDataset = { ...dataset, words: dataset.words.map(word => ({ ...word, text: '改正' })) }
  const state = { ...first.state, datasets: [updatedDataset] }
  const restored = prepareAcquisitionProgress(state, 'maya', updatedDataset, '2026-09-30T16:00:00.000Z', () => 0, true)
  assert.equal(restored.status, 'ready')
  if (restored.status !== 'ready') return
  assert.deepEqual(restored.envelope, first.envelope)
  assert.deepEqual(restored.context.targetSet.targets, dataset.words)
  const recovered = recoverAcquisitionCheckpoints(state, [{ checkpoint, baseEnvelope: first.envelope }])
  assert.equal(recovered.status, 'recovered')
  assert.equal(recovered.state.acquisitionProgressEnvelopes![0].revision, 1)
  assert.deepEqual(recovered.state.acquisitionProgressEnvelopes![0].lessonSnapshot, first.envelope.lessonSnapshot)
  assert.deepEqual(recovered.state.scores, state.scores)
  assert.deepEqual(recovered.state.completedSessions, state.completedSessions)
})

test('Grade 2 pin activation blocks an unverifiable legacy lesson instead of applying a current strategy', () => {
  const first = prepareAcquisitionProgress(stateWithDataset(), 'maya', dataset, '2026-09-29T16:00:00.000Z', () => 0)
  assert.equal(first.status, 'ready')
  if (first.status !== 'ready') return
  const changed = { ...dataset, words: dataset.words.map(word => ({ ...word, text: '改正' })) }
  const result = prepareAcquisitionProgress(first.state, 'maya', changed, '2026-09-30T16:00:00.000Z', () => 0, true)
  assert.equal(result.status, 'blocked')
  assert.equal(result.state.acquisitionProgressEnvelopes![0], first.envelope)
  assert.equal(result.state.acquisitionProgressQuarantine![0].raw, first.envelope)
})

test('legacy progress migrates in place while malformed progress is preserved and blocks a silent restart', () => {
  const fresh = prepareAcquisitionProgress(stateWithDataset(), 'maya', dataset, '2026-09-29T16:00:00.000Z', () => 0)
  assert.equal(fresh.status, 'ready')
  if (fresh.status !== 'ready') return
  const legacy = {
    id: `maya::${dataset.id}::tier-1-writing`,
    childId: 'maya',
    datasetId: dataset.id,
    grade: 'Grade 2',
    flow: fresh.envelope.flow,
    updatedAt: '2026-09-29T16:01:00.000Z',
  }
  const migrated = prepareAcquisitionProgress({ ...stateWithDataset(), acquisitionProgressions: [legacy] }, 'maya', dataset, '2026-09-29T16:02:00.000Z', () => 0)
  assert.equal(migrated.status, 'ready')
  if (migrated.status === 'ready') assert.equal(migrated.envelope.migratedFromProgressionId, legacy.id)

  const malformed = { ...legacy, flow: {} as never }
  const blocked = prepareAcquisitionProgress({ ...stateWithDataset(), acquisitionProgressions: [malformed] }, 'maya', dataset, '2026-09-29T16:02:00.000Z', () => 0)
  assert.equal(blocked.status, 'blocked')
  assert.equal(blocked.state.acquisitionProgressions[0], malformed)
  assert.equal(blocked.state.acquisitionProgressEnvelopes?.length, 0)
  assert.equal(blocked.state.acquisitionProgressQuarantine?.[0].raw, malformed)

  const wrongId = { ...fresh.envelope, id: 'wrong-current-progression-id' }
  const wrongIdBlocked = prepareAcquisitionProgress({ ...stateWithDataset(), acquisitionProgressEnvelopes: [wrongId] }, 'maya', dataset, '2026-09-29T16:03:00.000Z', () => 0)
  assert.equal(wrongIdBlocked.status, 'blocked')
  assert.equal(wrongIdBlocked.state.acquisitionProgressEnvelopes?.[0], wrongId)
})

test('one application reducer applies flow, receipt, score fact, and pending checkpoint exactly once', () => {
  const prepared = prepareAcquisitionProgress(stateWithDataset(), 'maya', dataset, '2026-09-29T16:00:00.000Z', () => 0)
  assert.equal(prepared.status, 'ready')
  if (prepared.status !== 'ready') return
  let state: AppState = prepared.state
  let envelope = prepared.envelope
  const context = acquisitionPersistenceContext('maya', dataset)
  let scoredCheckpoint = null as ReturnType<typeof createAcquisitionAnswerCheckpoint> | null
  for (let second = 1; second < 20 && !scoredCheckpoint; second += 1) {
    assert.ok(envelope.flow.prompt)
    const checkpoint = createAcquisitionAnswerCheckpoint({
      envelope,
      context,
      response: { correct: true, revealMethod: 'timer' },
      answeredPromptId: envelope.flow.prompt.id,
      sessionId: 'session-1',
      occurredAt: new Date(Date.parse('2026-09-29T16:00:00.000Z') + second * 1_000).toISOString(),
      random: () => 0,
    })
    const applied = applyAcquisitionCheckpointToAppState(state, checkpoint, context, true)
    assert.equal(applied.status, 'applied')
    state = applied.state
    envelope = applied.envelope
    if (checkpoint.scoredAttempt) scoredCheckpoint = checkpoint
  }
  assert.ok(scoredCheckpoint)
  assert.equal(state.results.length, 1)
  assert.equal(state.results[0].id, scoredCheckpoint.scoredAttempt?.id)
  assert.equal(state.acquisitionTransitionReceipts?.length, envelope.revision)
  assert.equal(state.acquisitionPendingCheckpoints?.length, envelope.revision)

  const retried = applyAcquisitionCheckpointToAppState(state, scoredCheckpoint, context, true)
  assert.equal(retried.status, 'idempotent')
  assert.equal(retried.state.results.length, 1)
  assert.equal(retried.state.acquisitionPendingCheckpoints?.length, envelope.revision)

  const committed = markAcquisitionCheckpointCommitted(state, scoredCheckpoint.transitionId)
  assert.equal(committed.acquisitionPendingCheckpoints?.some((item) => item.transitionId === scoredCheckpoint?.transitionId), false)

  const cloudBatch = buildCloudAcquisitionCheckpointWrites('family-maya', 'maya', envelope, scoredCheckpoint)
  assert.equal(cloudBatch.writes.length, 3)
  assert.deepEqual(cloudBatch.progressionParts.slice(-2), ['acquisitionProgressions', envelope.id])
  assert.deepEqual(cloudBatch.receiptParts.slice(-2), ['acquisitionTransitions', scoredCheckpoint.transitionId])
  assert.equal(acquisitionReceiptMatchesCheckpoint(envelope.lastAppliedTransition!, scoredCheckpoint), true)
  assert.equal(acquisitionReceiptMatchesCheckpoint({ ...envelope.lastAppliedTransition!, payloadFingerprint: 'different' }, scoredCheckpoint), false)
})

test('cloud hydration quarantines duplicate current progress instead of selecting by list order', () => {
  const cloudDataset = importWeeklyDatasets({
    presentationId: grade2DeckProfile.sourceDeckId,
    slides: [{ objectId: 'cloud-duplicate-slide', text: 'Week 9/28-10/2\nMandarin\nTier 1: 需要、部分' }],
  }, [], grade2DeckProfile).datasets[0]
  const fresh = prepareAcquisitionProgress({ ...createInitialState(), datasets: [cloudDataset] }, 'maya', cloudDataset, '2026-09-29T16:00:00.000Z', () => 0)
  assert.equal(fresh.status, 'ready')
  if (fresh.status !== 'ready') return
  const duplicate = { ...fresh.envelope, id: 'conflicting-cloud-path' }
  const hydrated = cloudDataToAppState([cloudDataset], [], [], [], 'maya', 'Grade 2', undefined, [fresh.envelope, duplicate], [], '2026–2027')
  assert.equal(hydrated.acquisitionProgressEnvelopes?.length, 0)
  assert.equal(hydrated.acquisitionProgressQuarantine?.length, 1)
  assert.deepEqual(hydrated.acquisitionProgressQuarantine?.[0].raw, [fresh.envelope, duplicate])
  const reopened = prepareAcquisitionProgress(hydrated, 'maya', cloudDataset, '2026-09-29T16:05:00.000Z', () => 0)
  assert.equal(reopened.status, 'blocked')
})

test('cloud hydration keeps separate activity modules for the same dataset', () => {
  const cloudDataset = importWeeklyDatasets({
    presentationId: grade2DeckProfile.sourceDeckId,
    slides: [{ objectId: 'cloud-separate-activities', text: 'Week 9/28-10/2\nMandarin\nTier 1: 需要、部分' }],
  }, [], grade2DeckProfile).datasets[0]
  const writing = prepareAcquisitionProgress({ ...createInitialState(), datasets: [cloudDataset] }, 'maya', cloudDataset, '2026-09-29T16:00:00.000Z', () => 0)
  assert.equal(writing.status, 'ready')
  if (writing.status !== 'ready') return
  const alternateContext = acquisitionPersistenceContext('maya', cloudDataset, cloudDataset.grade, undefined, 'alternate-dojo')
  const alternate = createAcquisitionProgressEnvelope(
    alternateContext,
    startAcquisition(alternateContext.targetSet, alternateContext.strategy, () => 0),
    '2026-09-29T16:00:00.000Z',
  )
  const hydrated = cloudDataToAppState(
    [cloudDataset], [], [], [], 'maya', 'Grade 2', undefined, [writing.envelope, alternate], [], '2026–2027',
  )
  assert.equal(hydrated.acquisitionProgressEnvelopes?.length, 2)
  assert.equal(hydrated.acquisitionProgressQuarantine?.length, 0)
})

test('cloud hydration gives same-dataset activity conflicts distinct quarantine identities', () => {
  const cloudDataset = importWeeklyDatasets({
    presentationId: grade2DeckProfile.sourceDeckId,
    slides: [{ objectId: 'cloud-conflict-identities', text: 'Week 9/28-10/2\nMandarin\nTier 1: 需要、部分' }],
  }, [], grade2DeckProfile).datasets[0]
  const writing = prepareAcquisitionProgress({ ...createInitialState(), datasets: [cloudDataset] }, 'maya', cloudDataset, '2026-09-29T16:00:00.000Z', () => 0)
  assert.equal(writing.status, 'ready')
  if (writing.status !== 'ready') return
  const alternateContext = acquisitionPersistenceContext('maya', cloudDataset, cloudDataset.grade, undefined, 'alternate-dojo')
  const alternate = createAcquisitionProgressEnvelope(
    alternateContext,
    startAcquisition(alternateContext.targetSet, alternateContext.strategy, () => 0),
    '2026-09-29T16:00:00.000Z',
  )
  const hydrated = cloudDataToAppState(
    [cloudDataset], [], [], [], 'maya', 'Grade 2', undefined,
    [writing.envelope, { ...writing.envelope, id: 'writing-conflict' }, alternate, { ...alternate, id: 'alternate-conflict' }], [], '2026–2027',
  )
  const ids = hydrated.acquisitionProgressQuarantine?.map((record) => record.id) || []
  assert.equal(ids.length, 2)
  assert.equal(new Set(ids).size, ids.length)
})

test('the local pending journal preserves malformed raw data and deduplicates exact retries', () => {
  const values = new Map<string, string>()
  const storage = {
    getItem(key: string) { return values.get(key) || null },
    setItem(key: string, value: string) { values.set(key, value) },
  } as Storage
  const prepared = prepareAcquisitionProgress(stateWithDataset(), 'maya', dataset, '2026-09-29T16:00:00.000Z', () => 0)
  assert.equal(prepared.status, 'ready')
  if (prepared.status !== 'ready' || !prepared.envelope.flow.prompt) return
  const checkpoint = createAcquisitionAnswerCheckpoint({
    envelope: prepared.envelope,
    context: prepared.context,
    response: { correct: true, revealMethod: 'timer' },
    answeredPromptId: prepared.envelope.flow.prompt.id,
    sessionId: 'session-1',
    occurredAt: '2026-09-29T16:00:01.000Z',
    random: () => 0,
  })
  appendPendingAcquisitionCheckpoint(storage, checkpoint, prepared.envelope)
  appendPendingAcquisitionCheckpoint(storage, checkpoint, prepared.envelope)
  assert.equal(readPendingAcquisitionJournal(storage).entries.length, 1)
  removePendingAcquisitionCheckpoint(storage, checkpoint.transitionId)
  assert.equal(readPendingAcquisitionJournal(storage).entries.length, 0)

  values.set(ACQUISITION_PENDING_JOURNAL_KEY, '{not-json')
  const malformed = readPendingAcquisitionJournal(storage)
  assert.match(malformed.error || '', /preserved/)
  assert.equal(values.get(ACQUISITION_PENDING_JOURNAL_KEY), '{not-json')
})

test('a brand-new cloud progression can be reconstructed from its pending base envelope', () => {
  const prepared = prepareAcquisitionProgress(stateWithDataset(), 'maya', dataset, '2026-09-29T16:00:00.000Z', () => 0)
  assert.equal(prepared.status, 'ready')
  if (prepared.status !== 'ready' || !prepared.envelope.flow.prompt) return
  const checkpoint = createAcquisitionAnswerCheckpoint({
    envelope: prepared.envelope,
    context: prepared.context,
    response: { correct: true, revealMethod: 'timer' },
    answeredPromptId: prepared.envelope.flow.prompt.id,
    sessionId: 'session-1',
    occurredAt: '2026-09-29T16:00:01.000Z',
    random: () => 0,
  })
  const recovered = recoverAcquisitionCheckpoints(stateWithDataset(), [{ checkpoint, baseEnvelope: prepared.envelope }])
  assert.equal(recovered.status, 'recovered', recovered.reason)
  assert.equal(recovered.state.acquisitionProgressEnvelopes?.[0].revision, 1)
  assert.equal(recovered.state.acquisitionProgressEnvelopes?.[0].lastAppliedTransition?.transitionId, checkpoint.transitionId)
})

test('a verified backup restores versioned progress and its pending recovery entry exactly', () => {
  const prepared = prepareAcquisitionProgress(stateWithDataset(), 'maya', dataset, '2026-09-29T16:00:00.000Z', () => 0, true)
  assert.equal(prepared.status, 'ready')
  if (prepared.status !== 'ready' || !prepared.envelope.flow.prompt) return
  const checkpoint = createAcquisitionAnswerCheckpoint({
    envelope: prepared.envelope,
    context: prepared.context,
    response: { correct: true, revealMethod: 'timer' },
    answeredPromptId: prepared.envelope.flow.prompt.id,
    sessionId: 'session-1',
    occurredAt: '2026-09-29T16:00:01.000Z',
    random: () => 0,
  })
  const applied = applyAcquisitionCheckpointToAppState(prepared.state, checkpoint, prepared.context, true)
  assert.equal(applied.status, 'applied')
  const pending = [{ checkpoint, baseEnvelope: prepared.envelope }]
  const serialized = createApplicationBackup(applied.state, pending, '2026-09-29T17:00:00.000Z')
  assert.doesNotMatch(serialized, /refreshToken|idToken|accessToken/)
  const restored = restoreApplicationBackup(serialized)
  assert.deepEqual(restored.state, JSON.parse(JSON.stringify(applied.state)))
  assert.deepEqual(restored.pendingAcquisition, JSON.parse(JSON.stringify(pending)))
  assert.ok(restored.state.acquisitionProgressEnvelopes![0].lessonSnapshot)
})

test('cloud hydration resolves an existing pinned lesson without reinterpreting corrected words', () => {
  const original = importWeeklyDatasets({ presentationId: grade2DeckProfile.sourceDeckId,
    slides: [{ objectId: 'cloud-pinned-slide', text: 'Week 9/28-10/2\nMandarin\nTier 1: 需要、部分' }] }, [], grade2DeckProfile).datasets[0]
  const first = prepareAcquisitionProgress({ ...createInitialState(), datasets: [original] }, 'maya', original,
    '2026-09-29T16:00:00.000Z', () => 0, true)
  assert.equal(first.status, 'ready')
  if (first.status !== 'ready') return
  const changed = { ...original, words: original.words.map(word => ({ ...word, text: '改正' })) }
  const hydrated = cloudDataToAppState([changed], [], [], [], 'maya', 'Grade 2', undefined,
    [first.envelope], [], '2026–2027')
  assert.equal(hydrated.acquisitionProgressQuarantine?.length, 0)
  assert.deepEqual(hydrated.acquisitionProgressEnvelopes?.[0], first.envelope)
})
