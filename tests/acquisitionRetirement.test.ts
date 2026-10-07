import assert from 'node:assert/strict'
import test from 'node:test'
import { acquisitionPersistenceContext, prepareAcquisitionProgress } from '../src/application/acquisitionPersistence.ts'
import { retainGrade2Editions } from '../src/curriculum/grade2Revisions.ts'
import { createInitialState } from '../src/domain.ts'
import {
  currentAcquisitionContext,
  isAcquisitionRetired,
  retireAcquisition,
} from '../src/familyBeta/acquisitionRetirement.ts'
import { openAcquisitionStore } from '../src/familyBeta/acquisitionStore.ts'
import { grade2WritingDatasets } from '../src/familyBeta/grade2LessonSelection.ts'
import { hydrateLocalStateFromReadOnlySource } from '../src/localHydration.ts'
import { grade2DeckProfile } from '../src/slidesImporter.ts'

function memory() {
  const records = new Map<string, string>()
  return {
    records,
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, raw: string) => {
      records.set(key, raw)
    },
  }
}
function fixture() {
  const datasets = hydrateLocalStateFromReadOnlySource(createInitialState(), {
    presentationId: grade2DeckProfile.sourceDeckId,
    slides: [{ objectId: 'week', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' }],
  }).state.datasets
  return { datasets, context: acquisitionPersistenceContext('child', datasets[0]), storage: memory() }
}

test('confirmed discard retains all reviewed responses and starts a different, repeatable progression', () => {
  const { context, storage } = fixture()
  const old = openAcquisitionStore(storage, context)
  for (let i = 0; i < 4; i++) old.answer(true, 'test')
  const before = storage.getItem(old.key)
  retireAcquisition(storage, context.identity)
  assert.equal(storage.getItem(old.key), before)
  const restarted = openAcquisitionStore(storage, context)
  assert.notEqual(restarted.key, old.key)
  assert.notEqual(restarted.current.envelope.id, old.current.envelope.id)
  assert.equal(restarted.current.envelope.revision, 0)
  assert.equal(restarted.current.reviewedTrials.length, 0)
  assert.throws(() => old.answer(true, 'test'), /discarded/)
  assert.equal(openAcquisitionStore(storage, context).key, restarted.key)
  assert.equal(storage.getItem(old.key), before)
  retireAcquisition(storage, restarted.context.identity)
  assert.notEqual(openAcquisitionStore(storage, context).key, restarted.key)
})

test('a downloaded discard stops a stale device even when its old checkpoint has newer answers', () => {
  const { context, storage } = fixture()
  const staleStorage = memory()
  const original = openAcquisitionStore(storage, context)
  for (const [key, value] of storage.records) staleStorage.setItem(key, value)
  const stale = openAcquisitionStore(staleStorage, context)
  stale.answer(true, 'test')
  const staleHistory = staleStorage.getItem(stale.key)
  retireAcquisition(storage, original.context.identity)
  for (const [key, value] of storage.records)
    if (key.includes(':lesson-retirement-v1:')) staleStorage.setItem(key, value)
  assert.throws(() => stale.answer(true, 'test'), /discarded/)
  assert.notEqual(openAcquisitionStore(staleStorage, context).key, stale.key)
  assert.equal(staleStorage.getItem(stale.key), staleHistory)
})

test('simultaneous discard markers are identical and cannot retire another child', () => {
  const { context, storage } = fixture()
  const other = memory()
  retireAcquisition(storage, context.identity)
  retireAcquisition(other, context.identity)
  assert.deepEqual([...storage.records], [...other.records])
  assert.equal(isAcquisitionRetired(storage, { ...context.identity, childId: 'other-child' }), false)
  assert.throws(
    () => retireAcquisition({ ...storage, getItem: () => null, setItem: () => {} }, context.identity),
    /could not be confirmed/,
  )
})

test('Grade 2 restart keeps old envelopes/history and does not select the retired lesson after a correction', () => {
  const { context, storage, datasets } = fixture()
  const original = prepareAcquisitionProgress(
    createInitialState(datasets),
    'child',
    datasets[0],
    '2026-10-07T10:00:00.000Z',
    () => 0,
    true,
  )
  assert.equal(original.status, 'ready')
  if (original.status !== 'ready') return
  retireAcquisition(storage, original.envelope)
  const next = prepareAcquisitionProgress(
    original.state,
    'child',
    datasets[0],
    '2026-10-07T11:00:00.000Z',
    () => 0,
    true,
    (ctx) => currentAcquisitionContext(storage, ctx),
  )
  assert.equal(next.status, 'ready')
  if (next.status !== 'ready') return
  assert.notEqual(next.envelope.id, original.envelope.id)
  assert.deepEqual(next.state.acquisitionProgressEnvelopes?.[0], original.envelope)
  assert.equal(next.state.acquisitionProgressEnvelopes?.length, 2)
  assert.equal(
    acquisitionPersistenceContext('child', datasets[0], 'Grade 2', next.envelope).identity.activityModule,
    next.envelope.activityModule,
  )
  const corrected = structuredClone(datasets)
  corrected[0].words[0].text = '新的'
  const revised = retainGrade2Editions(original.state, corrected)
  assert.notEqual(
    grade2WritingDatasets(revised, corrected, 'child', (e) => isAcquisitionRetired(storage, e))[0].id,
    context.identity.datasetId,
  )
})
