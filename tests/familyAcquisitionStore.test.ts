import assert from 'node:assert/strict'
import test from 'node:test'
import { openAcquisitionStore } from '../src/familyBeta/acquisitionStore.ts'
import { grade5AcquisitionStrategy } from '../src/acquisition/strategies/grade5.ts'
import { kindergartenAcquisitionStrategy } from '../src/acquisition/strategies/kindergarten.ts'
import { grade2Tier2ReadingProfile } from '../src/tier2/profiles/grade2.ts'
import { grade5Tier2ReadingProfile } from '../src/tier2/profiles/grade5.ts'
import { kindergartenTier2ReadingProfile } from '../src/tier2/profiles/kindergarten.ts'
import type { AcquisitionPersistenceContext } from '../src/acquisition/persistence/contracts.ts'

function memory() {
  const records = new Map<string, string>()
  return {
    records,
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value)
    },
  }
}
function context(
  strategy = grade5AcquisitionStrategy as AcquisitionPersistenceContext['strategy'],
): AcquisitionPersistenceContext {
  const tier = strategy.id.includes('reading') ? 'tier-2' : 'tier-1'
  return {
    identity: {
      childId: 'test-child',
      grade: 'Grade 5',
      schoolYear: '2026-27',
      datasetId: 'test-week',
      activityModule: 'test-dojo',
      tier,
    },
    targetSet: {
      id: 'test-week',
      targets: [
        {
          id: 'test-word',
          datasetId: 'test-week',
          text: '一',
          sentence: '',
          language: 'mandarin',
          tier,
          activityType: tier === 'tier-2' ? 'reading' : 'dictation',
        },
      ],
    },
    strategy,
    lifecycleStage: { kind: 'acquisition' },
    applicationVersion: 'test',
  }
}
for (const strategy of [
  grade5AcquisitionStrategy,
  kindergartenAcquisitionStrategy,
  grade2Tier2ReadingProfile.acquisitionStrategy,
  grade5Tier2ReadingProfile.acquisitionStrategy,
  kindergartenTier2ReadingProfile.acquisitionStrategy,
]) {
  test(`${strategy.id}: reviewed response and exact unfinished prompt survive reopening`, () => {
    const storage = memory()
    const ctx = context(strategy)
    const first = openAcquisitionStore(storage, ctx, { random: () => 0 })
    for (let i = 0; i < 10; i++) {
      const saved = first.answer(i !== 4, 'test-comparison')
      const reopened = openAcquisitionStore(storage, ctx)
      assert.deepEqual(reopened.current, JSON.parse(JSON.stringify(saved)))
      assert.equal(reopened.current.envelope.flow.prompt?.revealed, false)
    }
    assert.ok(first.current.assessments.length > 0)
    const before = first.current.envelope
    const sessionId = first.current.sessionId
    first.finishSession()
    assert.deepEqual(first.current.envelope, before)
    assert.notEqual(first.current.sessionId, sessionId)
    assert.deepEqual(first.current.assessments, [])
  })
}
test('child and activity identities isolate records; stale tabs do not overwrite', () => {
  const storage = memory()
  const ctx = context()
  const one = openAcquisitionStore(storage, ctx)
  const stale = openAcquisitionStore(storage, ctx)
  one.answer(true, 'timer')
  const preserved = storage.getItem(one.key)
  assert.throws(() => stale.answer(false, 'timer'), /another tab/)
  assert.equal(storage.getItem(one.key), preserved)
  const otherActivity = openAcquisitionStore(storage, {
    ...ctx,
    identity: { ...ctx.identity, activityModule: 'stroke-order' },
  })
  const otherChild = openAcquisitionStore(storage, { ...ctx, identity: { ...ctx.identity, childId: 'other-child' } })
  assert.notEqual(otherActivity.key, one.key)
  assert.notEqual(otherChild.key, one.key)
  assert.equal(otherActivity.current.envelope.revision, 0)
})
test('malformed records and changed curricula fail without erasing earlier data', () => {
  const storage = memory()
  const ctx = context()
  const original = openAcquisitionStore(storage, ctx)
  const before = storage.getItem(original.key)
  assert.throws(
    () =>
      openAcquisitionStore(storage, {
        ...ctx,
        targetSet: { ...ctx.targetSet, targets: ctx.targetSet.targets.map((target) => ({ ...target, text: '二' })) },
      }),
    /Nothing was erased/,
  )
  assert.equal(storage.getItem(original.key), before)
  storage.setItem(original.key, '{broken')
  assert.throws(() => openAcquisitionStore(storage, ctx), /Nothing was erased/)
  assert.equal(storage.getItem(original.key), '{broken')
})
test('quota failure does not advance the in-memory response or checkpoint', () => {
  const storage = memory()
  const store = openAcquisitionStore(storage, context())
  const before = store.current
  storage.setItem = () => {
    throw new Error('Quota exceeded')
  }
  assert.throws(() => store.answer(true, 'timer'), /Quota exceeded/)
  assert.equal(store.current, before)
})
test('finishing completed teaching preserves its history and resumes earned practice', () => {
  const storage = memory(),
    ctx = context()
  const store = openAcquisitionStore(storage, ctx, { random: () => 0 })
  let guard = 0
  while (!store.current.envelope.flow.complete && guard++ < 150) store.answer(true, 'timer')
  assert.ok(store.current.envelope.flow.complete)
  const reviewed = store.current.reviewedTrials
  store.finishSession()
  assert.equal(store.current.envelope.flow.complete, false)
  assert.equal(store.current.envelope.flow.teachingComplete, true)
  assert.deepEqual(store.current.reviewedTrials, reviewed)
  assert.deepEqual(store.current.assessments, [])
  assert.deepEqual(openAcquisitionStore(storage, ctx).current, JSON.parse(JSON.stringify(store.current)))
})
