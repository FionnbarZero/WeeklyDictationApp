import assert from 'node:assert/strict'
import test from 'node:test'
import {
  acquisitionPersistenceContext,
  applyAcquisitionCheckpointToAppState,
  createAcquisitionAnswerCheckpoint,
  prepareAcquisitionProgress,
} from '../src/application/acquisitionPersistence.ts'
import { retainGrade2Editions } from '../src/curriculum/grade2Revisions.ts'
import { withoutStrokeOrderLabels } from '../src/curriculum/instructionLabels.ts'
import { APP_STATE_KEY, createInitialState } from '../src/domain.ts'
import { isAcquisitionRetired, retirementKey } from '../src/familyBeta/acquisitionRetirement.ts'
import { correctedWritingAttempts, startCorrectedWritingAttempt } from '../src/familyBeta/correctedWritingAttempt.ts'
import { grade2WritingDatasets } from '../src/familyBeta/grade2LessonSelection.ts'
import { hydrateLocalStateFromReadOnlySource } from '../src/localHydration.ts'
import { grade2DeckProfile } from '../src/slidesImporter.ts'

function fixture(targets = '走、最、哪里、家、住', labels = ['strokeorder']) {
  const incoming = hydrateLocalStateFromReadOnlySource(createInitialState(), {
    presentationId: grade2DeckProfile.sourceDeckId,
    slides: [{ objectId: 'week', text: `Week 10/13-10/16\nMandarin\nTier 1: ${targets}\nTier 2: 城市、上班` }],
  }).state.datasets
  const corrected = incoming[0]
  const words = [...labels, ...corrected.words.map((w) => w.text)].map((text, i) => ({
    ...corrected.words[0],
    id: `${corrected.id}-${i + 1}`,
    text,
  }))
  const old = { ...corrected, words, vocabulary: { ...corrected.vocabulary!, tier1: words } }
  const prepared = prepareAcquisitionProgress(
    createInitialState([old]),
    'child',
    old,
    '2026-10-14T10:00:00.000Z',
    () => 0,
    true,
  )
  assert.equal(prepared.status, 'ready')
  if (prepared.status !== 'ready') throw new Error('Fixture did not prepare')
  const state = retainGrade2Editions(prepared.state, incoming)
  const records = new Map([
    [`family-beta-activity:child:${APP_STATE_KEY}`, JSON.stringify(state)],
    ['unrelated-child', 'leave alone'],
    ['family-beta-problem-report-v1:test', 'leave alone'],
  ])
  const storage = {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value)
    },
  }
  return { incoming, state, records, storage, envelope: prepared.envelope }
}

for (const labels of [['strokeorder'], ['STROKE', 'ORDER'], ['stroke', 'order'], [' Stroke ', ' Order: ']])
  test(`invalid pinned ${labels.join('/')} is repaired only after explicit action; original records are byte-identical`, () => {
    const { incoming, state, records, storage, envelope } = fixture(undefined, labels)
    assert.equal(grade2WritingDatasets(state, incoming, 'child')[0].words[0].text, labels[0])
    const before = new Map(records)
    assert.equal(correctedWritingAttempts(state, incoming, 'child', storage).length, 1)
    startCorrectedWritingAttempt(storage, state, incoming, 'child', envelope.id)
    for (const [key, value] of before) assert.equal(records.get(key), value)
    assert.equal(records.size, before.size + 1)
    assert.equal(isAcquisitionRetired(storage, envelope), true)
    assert.deepEqual(
      grade2WritingDatasets(state, incoming, 'child', (e) => isAcquisitionRetired(storage, e))[0].words.map(
        (w) => w.text,
      ),
      ['走', '最', '哪里', '家', '住'],
    )
    assert.equal(correctedWritingAttempts(state, incoming, 'child', storage).length, 0)
    assert.throws(
      () => startCorrectedWritingAttempt(storage, state, incoming, 'child', envelope.id),
      /no longer available/,
    )
  })

for (const labels of [['strokeorder'], ['STROKE', 'ORDER']])
  for (const change of ['owner', 'stale', 'wrong-source', 'write-failure', 'readback-failure'] as const)
    test(`${labels.join('/')}: corrected attempt refuses ${change} without altering history`, () => {
      const { incoming, state, records, storage, envelope } = fixture(undefined, labels)
      if (change === 'stale') {
        const current = structuredClone(state)
        current.acquisitionProgressEnvelopes![0].revision++
        storage.setItem(`family-beta-activity:child:${APP_STATE_KEY}`, JSON.stringify(current))
      }
      const before = new Map(records)
      const store =
        change === 'write-failure'
          ? {
              ...storage,
              setItem() {
                throw new Error('quota')
              },
            }
          : change === 'readback-failure'
            ? { ...storage, setItem() {} }
            : storage
      assert.throws(() =>
        startCorrectedWritingAttempt(
          store,
          state,
          change === 'wrong-source' ? [] : incoming,
          change === 'owner' ? 'other' : 'child',
          envelope.id,
        ),
      )
      assert.deepEqual(records, before)
      assert.equal(storage.getItem(retirementKey('child', envelope.id)), null)
    })

test('valid pinned work and arbitrary word edits are not offered this label-only repair', () => {
  const { incoming, state, storage } = fixture()
  state.datasets[0].words[0].text = '未知'
  assert.deepEqual(correctedWritingAttempts(state, incoming, 'child', storage), [])
  state.datasets[0].words[0].text = 'strokeorder'
  state.datasets[0].words[1].text = '不同'
  assert.deepEqual(correctedWritingAttempts(state, incoming, 'child', storage), [])
})

for (const labels of [
  ['STROKE'],
  ['ORDER'],
  ['ORDER', 'STROKE'],
  ['STROKE', '未知', 'ORDER'],
  ['STROKES', 'ORDER'],
  ['STROKE', 'ORDERING'],
])
  test(`ambiguous ${labels.join('/')} is not deleted or offered automatic correction`, () => {
    const { incoming, state, storage, records, envelope } = fixture(undefined, labels)
    const before = new Map(records)
    assert.deepEqual(correctedWritingAttempts(state, incoming, 'child', storage), [])
    assert.throws(
      () => startCorrectedWritingAttempt(storage, state, incoming, 'child', envelope.id),
      /no longer available/,
    )
    assert.deepEqual(records, before)
  })

test('split-label correction refuses an unrelated vocabulary change or changed week', () => {
  const { incoming, state, storage, records, envelope } = fixture(undefined, ['STROKE', 'ORDER'])
  state.datasets[0].words[2].text = '不同'
  assert.deepEqual(correctedWritingAttempts(state, incoming, 'child', storage), [])
  state.datasets[0].words[2].text = '走'
  state.datasets[0].endDate = '2026-10-15'
  assert.deepEqual(correctedWritingAttempts(state, incoming, 'child', storage), [])
  const before = new Map(records)
  assert.throws(
    () => startCorrectedWritingAttempt(storage, state, incoming, 'child', envelope.id),
    /no longer available/,
  )
  assert.deepEqual(records, before)
})

for (const labels of [['strokeorder'], ['STROKE', 'ORDER']])
  test(`${labels.join('/')}: a corrected edition with a missing guide never retires the original`, () => {
    const { incoming, state, storage, records, envelope } = fixture('龘', labels)
    const before = new Map(records)
    assert.throws(() => startCorrectedWritingAttempt(storage, state, incoming, 'child', envelope.id), /stroke guide/)
    assert.deepEqual(records, before)
  })

for (const labels of [['strokeorder'], ['STROKE', 'ORDER']])
  test(`${labels.join('/')}: lost marker readback preserves history and reload selects the corrected edition`, () => {
    const { incoming, state, storage, records, envelope } = fixture(undefined, labels)
    const before = new Map(records)
    let lost = false
    const uncertain = {
      getItem(key: string) {
        if (lost && key === retirementKey('child', envelope.id)) {
          lost = false
          return null
        }
        return storage.getItem(key)
      },
      setItem(key: string, value: string) {
        storage.setItem(key, value)
        lost = true
      },
    }
    assert.throws(() => startCorrectedWritingAttempt(uncertain, state, incoming, 'child', envelope.id), /confirmed/)
    for (const [key, value] of before) assert.equal(records.get(key), value)
    assert.equal(records.size, before.size + 1)
    assert.equal(correctedWritingAttempts(state, incoming, 'child', storage).length, 0)
    assert.equal(
      grade2WritingDatasets(state, incoming, 'child', (e) => isAcquisitionRetired(storage, e))[0].words[0].text,
      '走',
    )
  })

test('label matching preserves the order, duplicates and spelling of all actual targets', () => {
  assert.deepEqual(withoutStrokeOrderLabels(['走', 'STROKE', 'ORDER', '走', '最', 'strokeorder', '哪里']), [
    '走',
    '走',
    '最',
    '哪里',
  ])
  assert.deepEqual(withoutStrokeOrderLabels(['走', 'STROKE', '最', 'ORDER', '家']), [
    '走',
    'STROKE',
    '最',
    'ORDER',
    '家',
  ])
})

test('split-label repair preserves real reviewed scores, receipts and the exact old checkpoint', () => {
  const f = fixture(undefined, ['STROKE', 'ORDER'])
  let state = f.state
  let envelope = f.envelope
  const context = acquisitionPersistenceContext('child', state.datasets[0], 'Grade 2', envelope)
  for (let count = 0; count < 10 && state.results.length === 0; count += 1) {
    assert.ok(envelope.flow.prompt)
    const checkpoint = createAcquisitionAnswerCheckpoint({
      envelope,
      context,
      response: { correct: true, revealMethod: 'timer' },
      answeredPromptId: envelope.flow.prompt.id,
      sessionId: 'reviewed-before-repair',
      occurredAt: '2026-10-14T10:01:00.000Z',
      random: () => 0,
    })
    const applied = applyAcquisitionCheckpointToAppState(state, checkpoint, context, false)
    assert.equal(applied.status, 'applied')
    state = applied.state
    envelope = applied.envelope
  }
  assert.equal(state.results.length, 1)
  assert.ok(state.acquisitionTransitionReceipts!.length > 0)
  f.storage.setItem(`family-beta-activity:child:${APP_STATE_KEY}`, JSON.stringify(state))
  const before = new Map(f.records)
  startCorrectedWritingAttempt(f.storage, state, f.incoming, 'child', envelope.id)
  for (const [key, value] of before) assert.equal(f.records.get(key), value)
  assert.equal(f.records.size, before.size + 1)
  assert.equal(correctedWritingAttempts(state, f.incoming, 'child', f.storage).length, 0)
})
