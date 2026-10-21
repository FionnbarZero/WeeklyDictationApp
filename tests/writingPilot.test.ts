import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { createSharedWorkspace } from '../src/activity/sharedWorkspace.ts'
import { acquisitionPersistenceContext } from '../src/application/acquisitionPersistence.ts'
import { recordPracticeAnswer } from '../src/application/practice/recordPracticeAnswer.ts'
import { startPractice } from '../src/application/practice/startPractice.ts'
import { primaryStartState, skipWarmup } from '../src/application/practice/warmupTransitions.ts'
import {
  createWritingLesson,
  FIVE_STEP_WRITING_POLICY,
  TRACE_INDEPENDENT_PREVIEW_POLICY,
} from '../src/application/writingAcquisition/lesson.ts'
import * as pilot from '../src/application/writingAcquisition/pilot.ts'
import { createWritingProgress, teachingPosition } from '../src/application/writingAcquisition/progress.ts'
import { type AppState, createInitialState, resolveDatasetLifecycles, revealAcquisitionPrompt } from '../src/domain.ts'
import { createDeviceSyncRepository } from '../src/familyBeta/deviceSync.ts'
import {
  practiceWorkspaceKey,
  practiceWorkspaceStorage,
  practiceWorkspaceSyncAdapter,
} from '../src/familyBeta/practiceWorkspaceStorage.ts'
import { chooseWritingPayload } from '../src/familyBeta/writingCheckpoint.ts'
import { documentValue, plainValue } from '../src/firestoreClient.ts'
import { writingPreviewLesson } from '../src/writingAcquisition/previewLesson.ts'
import { writingRefinementStrategy } from '../src/writingAcquisition/refinementStrategy.ts'

const dataset = writingPreviewLesson().dataset
const date = new Date('2026-10-01T16:00:00.000Z')
const persistence = {
  cloud: false,
  saveLocalState: () => true,
  journalWarmup() {},
  acknowledgeWarmup() {},
  journalAcquisition() {
    throw new Error('Pilot must not write a legacy answer journal')
  },
  acknowledgeAcquisition() {},
}
const fresh = (): AppState => ({ ...createInitialState(), datasets: [dataset] })

test('new-attempt policy selection is Grade 2-only and preserves existing and retired attempts', async () => {
  const base = acquisitionPersistenceContext('pilot-child', dataset)
  assert.equal(pilot.prepareContext(fresh(), base).strategy, writingRefinementStrategy)
  const otherGrade = { ...base, identity: { ...base.identity, grade: 'Grade 5' } }
  assert.equal(pilot.prepareContext(fresh(), otherGrade), otherGrade)
  const old = await launch(fresh(), false)
  if (old.status !== 'started') throw new Error('Fixture failed')
  const bytes = JSON.stringify(old.state)
  assert.equal(pilot.prepareContext(old.state, base), base)
  const restart = {
    ...base,
    identity: { ...base.identity, activityModule: 'mandarin-tier1-writing:restart-1234567890abcdef' },
  }
  assert.equal(pilot.prepareContext(old.state, restart).strategy, writingRefinementStrategy)
  assert.equal(JSON.stringify(old.state), bytes)
})
function launchInput(state = fresh(), enabled = true): Parameters<typeof startPractice>[0] {
  return {
    state,
    child: { id: 'pilot-child', grade: 'Grade 2', schoolYear: '2026–2027' },
    target: { dataset, phase: 'acquisition' },
    primaryDatasets: [dataset],
    lifecycleResolution: resolveDatasetLifecycles([dataset], date),
    sessionId: 'pilot-session',
    startedAt: date,
    persistence,
    writingPilot: enabled ? pilot : undefined,
  }
}
async function launch(state = fresh(), enabled = true) {
  return startPractice(launchInput(state, enabled))
}
function memory() {
  const records = new Map<string, string>()
  return {
    records,
    get length() {
      return records.size
    },
    key: (i: number) => [...records.keys()][i] ?? null,
    getItem: (k: string) => records.get(k) ?? null,
    setItem: (k: string, v: string) => {
      records.set(k, v)
    },
    removeItem: (k: string) => {
      records.delete(k)
    },
  }
}

test('actual launch inserts teaching after optional Warmup, and disabled build cannot bypass a saved pilot', async () => {
  const opened = await launch()
  assert.equal(opened.status, 'started')
  if (opened.status !== 'started') return
  assert.equal(opened.session.stage, 'warmup-intro')
  assert.equal(opened.state.writingAcquisitionProgress![0].lesson.policy, TRACE_INDEPENDENT_PREVIEW_POLICY)
  assert.equal(teachingPosition(opened.state.writingAcquisitionProgress![0])?.step, 0)
  const rejected = await launch(opened.state, false)
  assert.equal(rejected.status, 'blocked')
  assert.deepEqual(opened.state.results, [])
})

for (const partialWarmup of [false, true]) {
  test(`reviewed prototype resumes a confirmed writing step atomically with ${partialWarmup ? 'partial legacy' : 'empty'} Warmup`, async () => {
    const mastered = {
      ...dataset,
      id: 'mastered-week',
      startDate: '2026-09-01',
      endDate: '2026-09-04',
      words: ['天', '月', '日'].map((text, index) => ({
        ...dataset.words[0],
        id: `mastered-${index}`,
        datasetId: 'mastered-week',
        text,
      })),
    }
    const input = {
      ...launchInput({ ...fresh(), datasets: [mastered, dataset] }),
      primaryDatasets: [mastered, dataset],
      lifecycleResolution: {
        ...resolveDatasetLifecycles([mastered, dataset], date),
        mastered: [mastered],
        lifecycleByDatasetId: { [mastered.id]: 'mastered' as const, [dataset.id]: 'acquisition' as const },
      },
    }
    const first = await pilot.createConfirmedWritingLaunch().start('first', input, () => true, true)
    if (first.status !== 'started') throw new Error('Fixture failed')
    assert.equal(first.session.stage, 'warmup-intro', 'a genuinely new lesson keeps its optional Warmup')
    const skipped = skipWarmup({ state: first.state, session: first.session, occurredAt: date, persistence })
    if (skipped.status !== 'applied') throw new Error('Fixture skip failed')
    let before = pilot.completeStep(skipped.state, skipped.session, 0, date.toISOString())
    const legacy = await startPractice({ ...input, state: before, sessionId: 'legacy-reopen' })
    if (legacy.status !== 'started') throw new Error('Fixture reopen failed')
    assert.equal(legacy.session.stage, 'warmup-intro', 'ordinary unflagged behavior is unchanged')
    before = legacy.state
    if (partialWarmup) {
      const answered = recordPracticeAnswer({
        state: before,
        session: { ...legacy.session, stage: 'review' },
        correct: true,
        occurredAt: date,
        persistence,
        writingPilot: pilot,
      })
      if (answered.status !== 'advanced') throw new Error('Fixture answer failed')
      before = answered.state
    }
    const original = structuredClone(before)
    const launcher = pilot.createConfirmedWritingLaunch()
    const retryInput = {
      ...input,
      state: before,
      sessionId: 'reviewed-reopen',
      persistence: {
        ...persistence,
        saveLocalState: () => assert.fail('No intermediate write'),
        journalWarmup: () => assert.fail('No intermediate journal'),
        acknowledgeWarmup: () => assert.fail('No intermediate acknowledgement'),
      },
    }
    const candidates: AppState[] = []
    const save = (_before: AppState, next: AppState) => {
      candidates.push(next)
      return candidates.length > 1
    }
    assert.equal((await launcher.start('resume', retryInput, save, true)).status, 'blocked')
    assert.deepEqual(before, original, 'failed confirmation cannot mutate existing progress')
    const resumed = await launcher.start('resume', retryInput, save, true)
    if (resumed.status !== 'started') throw new Error(resumed.message)
    assert.equal(candidates[0], candidates[1], 'retry retains the exact candidate')
    assert.equal(resumed.session.segment, 'primary')
    assert.notEqual(resumed.session.stage, 'warmup-intro')
    assert.deepEqual(resumed.state.writingAcquisitionProgress, before.writingAcquisitionProgress)
    assert.deepEqual(resumed.state.warmupAttemptsV1, before.warmupAttemptsV1)
    assert.deepEqual(resumed.state.results, before.results)
    const visit = resumed.state.warmupVisitsV1!.find((v) => v.id === legacy.session.adaptiveWarmupVisitId)!
    assert.equal(visit.status, partialWarmup ? 'partial' : 'skipped')
    assert.equal(visit.attemptedCount, partialWarmup ? 1 : 0)
  })
}

test('real application completes all characters and all targets with the normal scoring checkpoint exactly once', async () => {
  const opened = await launch()
  assert.equal(opened.status, 'started')
  if (opened.status !== 'started') return
  let state = opened.state,
    session = primaryStartState(opened.session),
    steps = 0,
    answers = 0
  const initial = structuredClone(state)
  const blocked = recordPracticeAnswer({
    state,
    session: { ...session, stage: 'review', acquisition: revealAcquisitionPrompt(session.acquisition!) },
    correct: true,
    occurredAt: date,
    persistence,
    writingPilot: pilot,
  })
  assert.equal(blocked.status, 'error')
  assert.deepEqual(state, initial)
  for (let guard = 0; guard < 500 && !session.acquisition?.teachingComplete; guard++) {
    const progress = state.writingAcquisitionProgress![0]
    const position = teachingPosition(progress)
    if (position) {
      const before = state
      state = pilot.completeStep(state, session, position.step, date.toISOString())
      assert.deepEqual(state.results, before.results)
      assert.deepEqual(state.acquisitionProgressEnvelopes, before.acquisitionProgressEnvelopes)
      steps++
    } else {
      const result = recordPracticeAnswer({
        state,
        session: { ...session, stage: 'review', acquisition: revealAcquisitionPrompt(session.acquisition!) },
        correct: true,
        occurredAt: date,
        persistence,
        writingPilot: pilot,
      })
      assert.equal(result.status, 'writing-ready', result.status === 'error' ? result.message : '')
      if (result.status !== 'writing-ready') return
      state = result.state
      session = result.session
      answers++
    }
  }
  assert.equal(session.acquisition?.teachingComplete, true)
  assert.equal(
    steps,
    dataset.words.reduce((sum, word) => sum + [...word.text].length * 5, 0),
  )
  assert.equal(state.writingAcquisitionProgress![0].revision, steps + answers)
  assert.equal(state.acquisitionProgressEnvelopes![0].revision, answers)
  assert.deepEqual(state.writingAcquisitionProgress![0].acquisition, state.acquisitionProgressEnvelopes![0])
  assert.ok(state.results.length > 0)
  const reopened = await launch(state)
  assert.equal(reopened.status, 'started')
  if (reopened.status === 'started') {
    assert.equal(teachingPosition(reopened.state.writingAcquisitionProgress![0]), null)
    assert.deepEqual(reopened.state.results, state.results)
  }
  // The resumed DT checkpoint is also prepared and confirmed as one launch.
  const writer = pilot.createConfirmedWritingLaunch()
  const input = launchInput(state)
  const candidates: AppState[] = []
  const save = (_before: AppState, next: AppState) => {
    candidates.push(next)
    return candidates.length > 1
  }
  assert.equal((await writer.start('resume', input, save)).status, 'blocked')
  const resumed = await writer.start('resume', { ...input, sessionId: 'must-not-replace-original' }, save)
  assert.equal(resumed.status, 'started')
  if (resumed.status !== 'started') return
  assert.equal(candidates[0], candidates[1])
  assert.equal(resumed.session.id, input.sessionId)
  assert.equal(resumed.state.writingAcquisitionProgress![0].revision, state.writingAcquisitionProgress![0].revision + 1)
  assert.deepEqual(resumed.state.results, state.results)
})

test('legacy in-progress target is not restarted; only subsequent new targets receive teaching', async () => {
  const legacy = await launch(fresh(), false)
  assert.equal(legacy.status, 'started')
  if (legacy.status !== 'started') return
  const opened = await launch(legacy.state)
  assert.equal(opened.status, 'started')
  if (opened.status !== 'started') return
  assert.equal(opened.state.writingAcquisitionProgress![0].firstTeacherTargetIndex, 1)
  assert.equal(teachingPosition(opened.state.writingAcquisitionProgress![0]), null)
  assert.equal(opened.state.writingAcquisitionProgress![0].lesson.policy, FIVE_STEP_WRITING_POLICY)
})

for (const policy of ['grade2-six-step-v4', FIVE_STEP_WRITING_POLICY] as const)
  test(`an existing ${policy} pilot retains its pinned progress and sequence when reopened`, async () => {
    const opened = await launch(fresh(), false)
    if (opened.status !== 'started') throw new Error('Fixture failed')
    const stepCount = policy === 'grade2-six-step-v4' ? 6 : 5
    const sixStep = createWritingProgress(
      createWritingLesson(dataset, policy),
      opened.session.childId,
      'six-step-fixture',
      date.toISOString(),
      { initial: opened.state.acquisitionProgressEnvelopes![0] },
    )
    let state = { ...opened.state, writingAcquisitionProgress: [sixStep] }
    const session = primaryStartState(opened.session)
    for (let i = 0; i < stepCount - 1; i++) state = pilot.completeStep(state, session, i, date.toISOString())
    const originalBytes = JSON.stringify(state.writingAcquisitionProgress)
    const reopened = await launch(state)
    assert.equal(reopened.status, 'started')
    if (reopened.status !== 'started') return
    assert.equal(JSON.stringify(reopened.state.writingAcquisitionProgress), originalBytes)
    assert.equal(teachingPosition(reopened.state.writingAcquisitionProgress![0])?.characterIndex, 0)
    assert.equal(teachingPosition(reopened.state.writingAcquisitionProgress![0])?.step, stepCount - 1)
    state = pilot.completeStep(state, session, stepCount - 1, date.toISOString())
    assert.equal(teachingPosition(state.writingAcquisitionProgress![0])?.characterIndex, 1)
    assert.equal(teachingPosition(state.writingAcquisitionProgress![0])?.step, 0)
  })

test('launch confirms Warmup eligibility changes with writing, without intermediate writes or journal acknowledgements', async () => {
  const mastered = {
    ...dataset,
    id: 'mastered-week',
    startDate: '2026-09-01',
    endDate: '2026-09-04',
    words: ['天', '月', '日'].map((text, index) => ({
      ...dataset.words[0],
      id: `mastered-${index}`,
      datasetId: 'mastered-week',
      text,
    })),
  }
  const state = { ...fresh(), datasets: [mastered, dataset] }
  const input = {
    ...launchInput(state),
    primaryDatasets: state.datasets,
    lifecycleResolution: {
      ...resolveDatasetLifecycles(state.datasets, date),
      mastered: [mastered],
      lifecycleByDatasetId: { [mastered.id]: 'mastered' as const, [dataset.id]: 'acquisition' as const },
    },
  }
  const opened = await startPractice(input)
  if (opened.status !== 'started') throw new Error('Fixture failed')
  assert.ok(opened.session.queue.length > 0)
  const before = opened.state
  const launcher = pilot.createConfirmedWritingLaunch()
  const retryInput = {
    ...input,
    state: before,
    sessionId: 'warmup-resume',
    lifecycleResolution: {
      ...input.lifecycleResolution,
      mastered: [],
      lifecycleByDatasetId: {
        [mastered.id]: 'test-review' as const,
        [dataset.id]: 'acquisition' as const,
      },
    },
    persistence: {
      ...persistence,
      saveLocalState: () => assert.fail('No intermediate writes'),
      journalWarmup: () => assert.fail('No journal before combined confirmation'),
      acknowledgeWarmup: () => assert.fail('No acknowledgement before combined confirmation'),
    },
  }
  const candidates: AppState[] = []
  const save = (_base: AppState, next: AppState) => {
    candidates.push(next)
    return candidates.length > 1
  }
  assert.equal((await launcher.start('lesson', retryInput, save)).status, 'blocked')
  const result = await launcher.start('lesson', retryInput, save)
  assert.equal(result.status, 'started')
  if (result.status !== 'started') return
  assert.equal(candidates[0], candidates[1])
  assert.equal(result.state.warmupVisitsV1![0].nextPosition, opened.session.queue.length)
  assert.ok(result.state.warmupTransitionReceiptsV1!.length > (before.warmupTransitionReceiptsV1?.length || 0))
  assert.deepEqual(result.state.writingAcquisitionProgress, before.writingAcquisitionProgress)
  assert.deepEqual(result.state.results, before.results)
  assert.deepEqual(result.state.warmupAttemptsV1 || [], before.warmupAttemptsV1 || [])
})

test('schema-2 combined checkpoint round trips, transfers, and rejects an equal-acquisition-revision stale writer', async () => {
  const opened = await launch()
  if (opened.status !== 'started') throw new Error('Fixture failed')
  const disk = memory(),
    key = 'weekly-dictation-state-v2',
    child = 'pilot-child'
  const first = practiceWorkspaceStorage(disk, child)
  first.setItem(key, JSON.stringify(opened.state))
  const second = practiceWorkspaceStorage(disk, child)
  const next = pilot.completeStep(opened.state, primaryStartState(opened.session), 0, date.toISOString())
  first.setItem(key, JSON.stringify(next))
  const raw = disk.getItem(practiceWorkspaceKey(child))!
  assert.deepEqual(JSON.parse(first.getItem(key)!), JSON.parse(JSON.stringify(next)))
  const downgraded = { ...next }
  delete downgraded.writingAcquisitionProgress
  assert.throws(() => first.setItem(key, JSON.stringify(downgraded)), /preserved/)
  const stale = structuredClone(opened.state)
  stale.acquisitionProgressEnvelopes![0].updatedAt = '2026-10-01T16:00:01.000Z'
  stale.writingAcquisitionProgress![0].acquisition = stale.acquisitionProgressEnvelopes![0]
  assert.throws(() => second.setItem(key, JSON.stringify(stale)), /preserved/)
  assert.equal(disk.getItem(practiceWorkspaceKey(child)), raw)
  const remote = memory()
  practiceWorkspaceStorage(remote, child)
  const adapter = practiceWorkspaceSyncAdapter(disk, child)
  const receiver = practiceWorkspaceSyncAdapter(remote, child)!
  for (const record of adapter.keys()) receiver.stage(record, adapter.read(record)!)
  receiver.commit()
  assert.deepEqual(JSON.parse(practiceWorkspaceStorage(remote, child).getItem(key)!), JSON.parse(JSON.stringify(next)))
  assert.doesNotMatch(raw, /learnerInk|handwriting|data:audio|strokePath/)
})

for (const interleaving of ['unchanged state', 'journal'] as const) {
  test(`an intervening ${interleaving} save cannot authorize stale teaching writes`, async () => {
    const opened = await launch()
    if (opened.status !== 'started') throw new Error('Fixture failed')
    const disk = memory(),
      key = 'weekly-dictation-state-v2',
      child = 'pilot-child'
    const first = practiceWorkspaceStorage(disk, child)
    first.setItem(key, JSON.stringify(opened.state))
    const second = practiceWorkspaceStorage(disk, child)
    const owner = createSharedWorkspace(opened.state, second, key)
    const session = primaryStartState(opened.session)
    let newer = opened.state
    for (let step = 0; step < 4; step++) newer = pilot.completeStep(newer, session, step, '2026-10-01T16:01:00.000Z')
    first.setItem(key, JSON.stringify(newer))
    if (interleaving === 'unchanged state') assert.equal(owner.save(opened.state, opened.state, false), true)
    else second.setItem('weekly-dictation-warmup-pending-v1', '[]')
    const retained = disk.getItem(practiceWorkspaceKey(child))
    let stale = opened.state
    // Lower, equal and higher revisions from the unseen fork must all fail.
    for (let step = 0; step < 5; step++) {
      stale = pilot.completeStep(stale, session, step, '2026-10-01T16:02:00.000Z')
      assert.equal(owner.save(opened.state, stale, false), false, `stale revision ${step + 1}`)
      assert.equal(owner.getSnapshot().state, opened.state)
      assert.equal(disk.getItem(practiceWorkspaceKey(child)), retained)
    }
    const continued = pilot.completeStep(newer, session, 4, '2026-10-01T16:03:00.000Z')
    first.setItem(key, JSON.stringify(continued))
    assert.equal(JSON.parse(first.getItem(key)!).writingAcquisitionProgress[0].revision, 5)
  })
}

test('a writer that observed newer teaching cannot roll its outer revision backward', async () => {
  const opened = await launch()
  if (opened.status !== 'started') throw new Error('Fixture failed')
  const disk = memory(),
    key = 'weekly-dictation-state-v2'
  const writer = practiceWorkspaceStorage(disk, 'pilot-child')
  writer.setItem(key, JSON.stringify(opened.state))
  const newer = pilot.completeStep(opened.state, primaryStartState(opened.session), 0, date.toISOString())
  writer.setItem(key, JSON.stringify(newer))
  const retained = disk.getItem(practiceWorkspaceKey('pilot-child'))
  assert.throws(() => writer.setItem(key, JSON.stringify(opened.state)), /preserved/)
  assert.equal(disk.getItem(practiceWorkspaceKey('pilot-child')), retained)
  writer.setItem(key, JSON.stringify(newer))
  assert.equal(disk.getItem(practiceWorkspaceKey('pilot-child')), retained)
})

test('failed saves never advance the owner; lost readback retries exact bytes, not a new milestone', () => {
  const disk = memory()
  let failRead = false,
    shouldFail = true
  const storage = {
    getItem(key: string) {
      if (failRead) {
        failRead = false
        throw new Error('read interrupted')
      }
      return disk.getItem(key)
    },
    setItem(key: string, raw: string) {
      disk.setItem(key, raw)
      if (shouldFail) {
        shouldFail = false
        failRead = true
      }
    },
  }
  const before = { revision: 0 },
    next = { revision: 1 }
  const owner = createSharedWorkspace(before, storage, 'test')
  const writer = pilot.createConfirmedWritingTransition<typeof before>()
  const save = (base: typeof before, state: typeof before) => owner.save(base, state, false)
  assert.throws(() => writer.commit('step', before, () => next, save), /could not be saved/)
  assert.equal(owner.getSnapshot().state, before)
  assert.equal(writer.pending, true)
  const bytes = disk.getItem('test')
  assert.equal(
    writer.commit(
      'step',
      before,
      () => {
        throw new Error('must not regenerate')
      },
      save,
    ),
    next,
  )
  assert.equal(writer.pending, false)
  assert.equal(disk.getItem('test'), bytes)
})

for (const failure of ['write', 'adapter readback', 'owner readback'] as const) {
  test(`initial launch retains its session and exact candidate after a failed ${failure}`, async () => {
    const disk = memory(),
      child = 'pilot-child',
      key = 'weekly-dictation-state-v2'
    let armed = false,
      failed = false,
      readsAfterWrite: number | null = null,
      prepares = 0
    const storage = {
      ...disk,
      getItem(name: string) {
        if (name === practiceWorkspaceKey(child) && readsAfterWrite !== null) {
          readsAfterWrite++
          if (readsAfterWrite === (failure === 'adapter readback' ? 1 : 2) && !failed) {
            failed = true
            throw new Error('Synthetic lost confirmation')
          }
        }
        return disk.getItem(name)
      },
      setItem(name: string, raw: string) {
        if (armed && name === practiceWorkspaceKey(child) && failure === 'write' && !failed) {
          failed = true
          throw new Error('Synthetic write failure')
        }
        disk.setItem(name, raw)
        if (armed && name === practiceWorkspaceKey(child) && failure !== 'write') readsAfterWrite = 0
      },
    }
    const adapter = practiceWorkspaceStorage(storage, child)
    const before = fresh()
    adapter.setItem(key, JSON.stringify(before))
    const owner = createSharedWorkspace(before, adapter, key)
    const launcher = pilot.createConfirmedWritingLaunch()
    const input = {
      ...launchInput(before),
      writingPilot: {
        ...pilot,
        prepare: (...args: Parameters<typeof pilot.prepare>) => {
          prepares++
          return pilot.prepare(...args)
        },
      },
      persistence: {
        ...persistence,
        saveLocalState: () => {
          throw new Error('No intermediate state may be written')
        },
      },
    }
    const candidates: AppState[] = []
    const save = (base: AppState, next: AppState) => {
      candidates.push(next)
      return owner.save(base, next, false)
    }
    armed = true
    assert.equal((await launcher.start('lesson', input, save)).status, 'blocked')
    assert.equal(launcher.pending, true)
    assert.equal(owner.getSnapshot().state, before)
    assert.equal(prepares, 1)
    const retained = disk.getItem(practiceWorkspaceKey(child))
    assert.equal((await launcher.start('another-lesson', input, save)).status, 'blocked')
    assert.equal((await launcher.start('lesson', { ...input, state: { ...before } }, save)).status, 'blocked')
    assert.equal(disk.getItem(practiceWorkspaceKey(child)), retained)
    assert.equal(candidates.length, 1)
    const retried = await launcher.start(
      'lesson',
      {
        ...input,
        sessionId: 'new-click-must-not-regenerate',
        startedAt: new Date(date.getTime() + 1000),
        writingTimestamp: new Date(date.getTime() + 1000).toISOString(),
      },
      save,
    )
    assert.equal(retried.status, 'started')
    if (retried.status !== 'started') return
    assert.equal(retried.session.id, input.sessionId)
    assert.equal(retried.session.startedAt, input.startedAt.toISOString())
    assert.equal(prepares, 1)
    assert.equal(candidates[0], candidates[1])
    assert.equal(retried.state, candidates[0])
    assert.equal(launcher.pending, false)
    assert.deepEqual(JSON.parse(adapter.getItem(key)!), JSON.parse(JSON.stringify(retried.state)))
    if (failure !== 'write') assert.equal(disk.getItem(practiceWorkspaceKey(child)), retained)
  })
}

test('teaching milestones choose an intact sync copy without inventing reviewed answers; skew/legacy conflicts block', async () => {
  const opened = await launch()
  if (opened.status !== 'started') throw new Error('Fixture failed')
  const session = primaryStartState(opened.session)
  const first = pilot.completeStep(opened.state, session, 0, '2026-10-01T16:01:00.000Z')
  const next = pilot.completeStep(first, session, 1, '2026-10-01T16:02:00.000Z')
  function payload(state: AppState) {
    const disk = memory(),
      child = 'pilot-child'
    practiceWorkspaceStorage(disk, child).setItem('weekly-dictation-state-v2', JSON.stringify(state))
    const sync = practiceWorkspaceSyncAdapter(disk, child)
    return sync.read(sync.keys().find((k) => decodeURIComponent(k).includes(':activity:'))!)!
  }
  assert.equal(chooseWritingPayload(payload(first), payload(next), 'pilot-child', '2026-10-01T16:02:01.000Z'), 'online')
  assert.equal(chooseWritingPayload(payload(next), payload(first), 'pilot-child', '2026-10-01T16:02:01.000Z'), 'local')
  assert.equal(chooseWritingPayload(payload(next), payload(first), 'pilot-child', '2026-10-01T15:00:00.000Z'), null)
  assert.equal(chooseWritingPayload(payload(first), '{"schema":1}', 'pilot-child', date.toISOString()), null)
  assert.deepEqual(next.results, [])
  assert.deepEqual(next.writingAcquisitionProgress![0].assessments, [])
})

test('the existing sync repository adopts the latest complete teaching record in either direction', async () => {
  const opened = await launch()
  if (opened.status !== 'started') throw new Error('Fixture failed')
  const session = primaryStartState(opened.session)
  const first = pilot.completeStep(opened.state, session, 0, '2026-10-01T16:01:00.000Z')
  const next = pilot.completeStep(first, session, 1, '2026-10-01T16:02:00.000Z')
  const child = 'pilot-child',
    key = 'weekly-dictation-state-v2'
  const hash = (value: string) => createHash('sha256').update(value).digest('hex')
  for (const localWins of [false, true]) {
    const disk = memory(),
      remoteDisk = memory()
    const local = practiceWorkspaceStorage(disk, child)
    local.setItem(key, JSON.stringify(opened.state))
    const base = practiceWorkspaceSyncAdapter(disk, child)!
    for (const name of base.keys())
      disk.setItem(`family-beta-sync-base-v1:family:${child}:${hash(name)}`, base.read(name)!)
    local.setItem(key, JSON.stringify(localWins ? next : first))
    practiceWorkspaceStorage(remoteDisk, child).setItem(key, JSON.stringify(localWins ? first : next))
    const online = practiceWorkspaceSyncAdapter(remoteDisk, child)!
    const records = new Map(online.keys().map((name) => [name, online.read(name)!]))
    const document = (name: string, raw: string) => ({
      name: `projects/synthetic/databases/(default)/documents/families/family/children/${child}/betaPractice/${hash(name)}`,
      updateTime: '2026-10-01T16:02:01.000Z',
      fields: Object.fromEntries(
        Object.entries({ schema: 1, childId: child, key: name, payload: raw, generation: 2 }).map(([field, value]) => [
          field,
          documentValue(value),
        ]),
      ),
    })
    let writes = 0
    const repository = createDeviceSyncRepository({
      projectId: 'synthetic',
      familyId: 'family',
      token: async () => 'synthetic',
      fetchImpl: async (url, init) => {
        if (String(url).includes('/betaPractice?'))
          return Response.json({ documents: [...records].map(([name, raw]) => document(name, raw)) })
        if (String(url).endsWith(':commit')) {
          for (const write of JSON.parse(String(init!.body)).writes) {
            records.set(
              plainValue(write.update.fields.key) as string,
              plainValue(write.update.fields.payload) as string,
            )
            writes++
          }
          return Response.json({})
        }
        const entry = [...records].find(([name]) => String(url).endsWith(hash(name)))
        return entry ? Response.json(document(...entry)) : new Response('', { status: 404 })
      },
    })
    await repository.sync(disk, child)
    assert.equal(writes, localWins ? 1 : 0)
    const saved = JSON.parse(practiceWorkspaceStorage(disk, child).getItem(key)!) as AppState
    assert.equal(saved.writingAcquisitionProgress![0].revision, 2)
    assert.deepEqual(
      saved.writingAcquisitionProgress![0].completedTeachingSteps,
      next.writingAcquisitionProgress![0].completedTeachingSteps,
    )
    assert.deepEqual(saved.results, [])
  }
})
