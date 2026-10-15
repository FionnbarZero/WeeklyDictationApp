import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { createDeviceSyncRepository } from '../src/familyBeta/deviceSync.ts'
import { documentValue, plainValue } from '../src/firestoreClient.ts'
import { startPractice } from '../src/application/practice/startPractice.ts'
import { recordPracticeAnswer } from '../src/application/practice/recordPracticeAnswer.ts'
import { primaryStartState } from '../src/application/practice/warmupTransitions.ts'
import * as pilot from '../src/application/writingAcquisition/pilot.ts'
import { teachingPosition } from '../src/application/writingAcquisition/progress.ts'
import { createInitialState, resolveDatasetLifecycles, revealAcquisitionPrompt, type AppState } from '../src/domain.ts'
import { writingPreviewLesson } from '../src/writingAcquisition/previewLesson.ts'
import { createSharedWorkspace } from '../src/activity/sharedWorkspace.ts'
import {
  practiceWorkspaceStorage,
  practiceWorkspaceKey,
  practiceWorkspaceSyncAdapter,
} from '../src/familyBeta/practiceWorkspaceStorage.ts'
import { chooseWritingPayload } from '../src/familyBeta/writingCheckpoint.ts'

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
async function launch(state = fresh(), enabled = true) {
  return startPractice({
    state,
    child: { id: 'pilot-child', grade: 'Grade 2', schoolYear: '2026–2027' },
    target: { dataset, phase: 'acquisition' },
    primaryDatasets: [dataset],
    lifecycleResolution: resolveDatasetLifecycles([dataset], date),
    sessionId: 'pilot-session',
    startedAt: date,
    persistence,
    writingPilot: enabled ? pilot : undefined,
  })
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
  assert.equal(teachingPosition(opened.state.writingAcquisitionProgress![0])?.step, 0)
  const rejected = await launch(opened.state, false)
  assert.equal(rejected.status, 'blocked')
  assert.deepEqual(opened.state.results, [])
})

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
    dataset.words.reduce((sum, word) => sum + [...word.text].length * 6, 0),
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
