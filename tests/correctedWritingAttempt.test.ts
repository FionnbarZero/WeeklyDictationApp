import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareAcquisitionProgress } from '../src/application/acquisitionPersistence.ts'
import { retainGrade2Editions } from '../src/curriculum/grade2Revisions.ts'
import { APP_STATE_KEY, createInitialState } from '../src/domain.ts'
import { isAcquisitionRetired, retirementKey } from '../src/familyBeta/acquisitionRetirement.ts'
import { correctedWritingAttempts, startCorrectedWritingAttempt } from '../src/familyBeta/correctedWritingAttempt.ts'
import { grade2WritingDatasets } from '../src/familyBeta/grade2LessonSelection.ts'
import { hydrateLocalStateFromReadOnlySource } from '../src/localHydration.ts'
import { grade2DeckProfile } from '../src/slidesImporter.ts'

function fixture(targets = '走、最、哪里、家、住') {
  const incoming = hydrateLocalStateFromReadOnlySource(createInitialState(), {
    presentationId: grade2DeckProfile.sourceDeckId,
    slides: [{ objectId: 'week', text: `Week 10/13-10/16\nMandarin\nTier 1: ${targets}\nTier 2: 城市、上班` }],
  }).state.datasets
  const corrected = incoming[0]
  const words = ['strokeorder', ...corrected.words.map((w) => w.text)].map((text, i) => ({
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

test('invalid pinned word is replaced only after explicit action; every original record is byte-identical', () => {
  const { incoming, state, records, storage, envelope } = fixture()
  assert.equal(grade2WritingDatasets(state, incoming, 'child')[0].words[0].text, 'strokeorder')
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

for (const change of ['owner', 'stale', 'wrong-source', 'write-failure', 'readback-failure'] as const)
  test(`corrected attempt refuses ${change} without altering history`, () => {
    const { incoming, state, records, storage, envelope } = fixture()
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

test('a corrected edition with a missing guide never retires the original', () => {
  const { incoming, state, storage, records, envelope } = fixture('龘')
  const before = new Map(records)
  assert.throws(() => startCorrectedWritingAttempt(storage, state, incoming, 'child', envelope.id), /stroke guide/)
  assert.deepEqual(records, before)
})

test('a lost marker readback preserves history and reload safely selects the corrected edition', () => {
  const { incoming, state, storage, records, envelope } = fixture()
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
