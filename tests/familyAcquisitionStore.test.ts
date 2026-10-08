import assert from 'node:assert/strict'
import test from 'node:test'
import { openAcquisitionStore } from '../src/familyBeta/acquisitionStore.ts'
import { grade5AcquisitionStrategy } from '../src/acquisition/strategies/grade5.ts'
import { kindergartenAcquisitionStrategy } from '../src/acquisition/strategies/kindergarten.ts'
import { grade2Tier2ReadingProfile } from '../src/tier2/profiles/grade2.ts'
import { grade5Tier2ReadingProfile } from '../src/tier2/profiles/grade5.ts'
import { kindergartenTier2ReadingProfile } from '../src/tier2/profiles/kindergarten.ts'
import type { AcquisitionPersistenceContext } from '../src/acquisition/persistence/contracts.ts'
import { validateAcquisitionProgressEnvelope } from '../src/acquisition/persistence/validation.ts'
import { acquisitionDigest } from '../src/acquisition/persistence/identity.ts'

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

test('two devices continuing the same checkpoint produce distinct completed-attempt identities', () => {
  const firstDevice = memory(), ctx = context()
  const first = openAcquisitionStore(firstDevice, ctx, { writerId: 'device-one', random: () => 0 })
  first.answer(true, 'timer')
  const secondDevice = memory()
  for (const [key, raw] of firstDevice.records) secondDevice.setItem(key, raw)
  const second = openAcquisitionStore(secondDevice, ctx, { writerId: 'device-two', random: () => 0 })
  assert.equal(second.current.sessionId, first.current.sessionId, 'reading a checkpoint does not create an attempt')
  assert.deepEqual(second.current.envelope, JSON.parse(JSON.stringify(first.current.envelope)))
  const inheritedAssessments = [...second.current.assessments]
  first.answer(true, 'timer')
  second.answer(false, 'timer')
  assert.notEqual(second.current.sessionId, first.current.sessionId)
  assert.deepEqual(second.current.assessments.slice(0, inheritedAssessments.length), inheritedAssessments)
  const reopened = openAcquisitionStore(secondDevice, ctx, { writerId: 'device-two', random: () => 0 })
  const sameAttempt = reopened.current.sessionId
  reopened.answer(true, 'timer')
  assert.equal(reopened.current.sessionId, sameAttempt, 'same-device retry/reload does not create another result')
})

test('a legacy unowned attempt is claimed only with a successfully saved reviewed answer', () => {
  const storage = memory(), ctx = context()
  const legacy = openAcquisitionStore(storage, ctx, { random: () => 0 })
  legacy.answer(true, 'timer')
  const original = storage.getItem(legacy.key)
  const upgraded = openAcquisitionStore(storage, ctx, { writerId: 'new-device', random: () => 0 })
  assert.equal(storage.getItem(legacy.key), original)
  const write = storage.setItem
  storage.setItem = () => { throw new Error('quota') }
  assert.throws(() => upgraded.answer(true, 'timer'), /quota/)
  assert.equal(upgraded.current.sessionId, legacy.current.sessionId)
  storage.setItem = write
  upgraded.answer(true, 'timer')
  assert.notEqual(upgraded.current.sessionId, legacy.current.sessionId)
})
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
test('legacy records with changed curricula fail without erasing earlier data', () => {
  const storage = memory()
  const ctx = context()
  const original = openAcquisitionStore(storage, ctx)
  const legacy = JSON.parse(storage.getItem(original.key)!)
  delete legacy.envelope.lessonSnapshot
  storage.setItem(original.key, JSON.stringify(legacy))
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
for (const strategy of [grade5AcquisitionStrategy, kindergartenAcquisitionStrategy,
  grade2Tier2ReadingProfile.acquisitionStrategy, grade5Tier2ReadingProfile.acquisitionStrategy,
  kindergartenTier2ReadingProfile.acquisitionStrategy]) {
  test(`${strategy.id}: teacher and strategy updates cannot change an unfinished lesson`, () => {
    const storage = memory()
    const original = context(strategy)
    const store = openAcquisitionStore(storage, original, { random: () => 0 })
    store.answer(true, 'timer')
    const before = JSON.parse(JSON.stringify(store.current))
    const latest = { ...original,
      targetSet: { ...original.targetSet, targets: original.targetSet.targets.map(t => ({ ...t, text: '二', sentence: '二的例句' })) },
      strategy: { ...original.strategy, version: original.strategy.version + 1,
        timers: { ...original.strategy.timers, familiarDtSeconds: 99 } } }
    const resumed = openAcquisitionStore(storage, latest, { random: () => 0 })
    assert.deepEqual(resumed.current, before)
    assert.deepEqual(resumed.context.targetSet, original.targetSet)
    assert.deepEqual(resumed.context.strategy, original.strategy)
    resumed.answer(true, 'timer')
    assert.equal(resumed.current.envelope.strategyVersion, original.strategy.version)
    assert.equal(resumed.current.envelope.targetSetFingerprint, before.envelope.targetSetFingerprint)
    const other = openAcquisitionStore(storage, { ...latest, identity: { ...latest.identity, childId: 'new-child' } })
    assert.deepEqual(other.context.targetSet, latest.targetSet)
  })
}
test('compatible legacy records acquire a snapshot without moving the prompt or score', () => {
  const storage = memory(), ctx = context()
  const store = openAcquisitionStore(storage, ctx, { random: () => 0 })
  store.answer(true, 'timer')
  const legacy = JSON.parse(storage.getItem(store.key)!)
  delete legacy.envelope.lessonSnapshot
  legacy.envelope.applicationVersion = 'older-original-build'
  storage.setItem(store.key, JSON.stringify(legacy))
  const resumed = openAcquisitionStore(storage, ctx)
  assert.ok(resumed.current.envelope.lessonSnapshot)
  assert.equal(resumed.current.envelope.lessonSnapshot.applicationVersion, 'older-original-build')
  assert.deepEqual(resumed.current.envelope.flow, legacy.envelope.flow)
  assert.equal(resumed.current.sessionId, legacy.sessionId)
  assert.deepEqual(resumed.current.reviewedTrials, legacy.reviewedTrials)
})
test('a corrected lesson starts only after completed teaching is confirmed; the earlier lesson remains archived', () => {
  const storage = memory(), ctx = context()
  const store = openAcquisitionStore(storage, ctx, { random: () => 0 })
  let guard = 0
  while (!store.current.envelope.flow.complete && guard++ < 150) store.answer(true, 'timer')
  assert.ok(store.current.envelope.flow.teachingComplete)
  const original = storage.getItem(store.key)
  const latest = { ...ctx, targetSet: { ...ctx.targetSet,
    targets: ctx.targetSet.targets.map(t => ({ ...t, text: '二' })) } }
  const resumed = openAcquisitionStore(storage, latest)
  assert.equal(resumed.current.sessionId, store.current.sessionId)
  resumed.finishSession()
  assert.equal(resumed.current.envelope.flow.teachingComplete, false)
  assert.equal(resumed.current.envelope.revision, 0)
  assert.notEqual(resumed.current.sessionId, store.current.sessionId)
  assert.deepEqual(resumed.context.targetSet, latest.targetSet)
  assert.ok([...storage.records.entries()].some(([key, value]) => key !== store.key && value === original))
})
test('failed archive writes leave the old lesson and its score available', () => {
  const storage = memory(), ctx = context()
  const store = openAcquisitionStore(storage, ctx, { random: () => 0 })
  let guard = 0
  while (!store.current.envelope.flow.complete && guard++ < 150) store.answer(true, 'timer')
  const latest = { ...ctx, strategy: { ...ctx.strategy, version: ctx.strategy.version + 1 } }
  const resumed = openAcquisitionStore(storage, latest)
  const before = storage.getItem(store.key)
  storage.setItem = () => { throw new Error('Quota exceeded') }
  assert.throws(() => resumed.finishSession(), /Quota/)
  assert.equal(storage.getItem(store.key), before)
  assert.equal(resumed.current.sessionId, store.current.sessionId)
  assert.deepEqual(resumed.context.strategy, ctx.strategy)
})
for (const corruption of ['engine', 'future-target', 'timer', 'fingerprint', 'identity', 'missing-snapshot'] as const) {
  test(`invalid pinned ${corruption} is preserved and never replaced by today's lesson`, () => {
    const storage = memory(), ctx = context()
    const store = openAcquisitionStore(storage, ctx)
    const bad = JSON.parse(storage.getItem(store.key)!)
    if (corruption === 'engine') bad.envelope.lessonSnapshot.engineContract = 'future-engine-v99'
    if (corruption === 'future-target') bad.envelope.lessonSnapshot.targetSet.targets[0].text = '改正'
    if (corruption === 'timer') bad.envelope.lessonSnapshot.strategy.timers.familiarDtSeconds = -1
    if (corruption === 'fingerprint') bad.envelope.lessonSnapshot.fingerprint = 'bad'
    if (corruption === 'identity') bad.envelope.childId = 'another-child'
    if (corruption === 'missing-snapshot') bad.envelope.lessonSnapshot = null
    if (bad.envelope.lessonSnapshot && corruption !== 'fingerprint') {
      const { fingerprint: _fingerprint, ...payload } = bad.envelope.lessonSnapshot
      bad.envelope.lessonSnapshot.fingerprint = acquisitionDigest(payload)
    }
    const encoded = JSON.stringify(bad)
    storage.setItem(store.key, encoded)
    assert.throws(() => openAcquisitionStore(storage, ctx), /Nothing was erased/)
    assert.equal(storage.getItem(store.key), encoded)
  })
}
test('v1 rollback readers can read an unchanged lesson, and still reject changed curriculum without erasure', () => {
  const storage = memory(), ctx = context()
  const store = openAcquisitionStore(storage, ctx)
  assert.equal(validateAcquisitionProgressEnvelope(store.current.envelope, ctx).valid, true)
  const latest = { ...ctx, targetSet: { ...ctx.targetSet, targets: ctx.targetSet.targets.map(t => ({ ...t, text: '二' })) } }
  assert.equal(validateAcquisitionProgressEnvelope(store.current.envelope, latest).valid, false)
  const encoded = storage.getItem(store.key)
  openAcquisitionStore(storage, latest)
  assert.equal(storage.getItem(store.key), encoded)
})
for (const phase of ['correction', 'earned-dt'] as const) {
  test(`a pinned ${phase} prompt keeps its sequence and reviewed state after source replacement`, () => {
    const storage = memory(), ctx = context()
    let random = 0
    const store = openAcquisitionStore(storage, ctx, { random: () => random })
    let guard = 0
    if (phase === 'correction') {
      while (store.current.envelope.flow.phase !== 'correction' && guard++ < 100) store.answer(false, 'timer')
      assert.equal(store.current.envelope.flow.phase, 'correction')
    } else {
      while (!store.current.envelope.flow.complete && guard++ < 100) store.answer(true, 'timer')
      random = 0.99
      store.finishSession()
      assert.equal(store.current.envelope.flow.prompt?.kind, 'earned-dt')
    }
    const before = JSON.parse(storage.getItem(store.key)!)
    const latest = { ...ctx, targetSet: { ...ctx.targetSet, targets: ctx.targetSet.targets.map(t => ({ ...t, text: '二' })) } }
    const resumed = openAcquisitionStore(storage, latest, { random: () => 0 })
    assert.deepEqual(resumed.current, before)
    resumed.answer(true, 'timer')
    assert.deepEqual(resumed.context.targetSet, ctx.targetSet)
    assert.equal(resumed.current.envelope.revision, before.envelope.revision + 1)
  })
}
test('an interrupted active-record replacement can reuse its verified archive on retry', () => {
  const storage = memory(), ctx = context()
  const store = openAcquisitionStore(storage, ctx, { random: () => 0 })
  let guard = 0
  while (!store.current.envelope.flow.complete && guard++ < 150) store.answer(true, 'timer')
  const before = storage.getItem(store.key)
  const latest = { ...ctx, strategy: { ...ctx.strategy, version: ctx.strategy.version + 1 } }
  const resumed = openAcquisitionStore(storage, latest)
  const write = storage.setItem
  storage.setItem = (key, value) => {
    if (key === store.key) throw new Error('Interrupted active write')
    write(key, value)
  }
  assert.throws(() => resumed.finishSession(), /Interrupted/)
  assert.equal(storage.getItem(store.key), before)
  assert.equal(storage.records.size, 2)
  storage.setItem = write
  const retry = openAcquisitionStore(storage, latest)
  retry.finishSession()
  assert.equal(retry.current.envelope.revision, 0)
  assert.equal(storage.records.size, 2)
  assert.ok([...storage.records.values()].includes(before!))
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
