import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test, { after, before } from 'node:test'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { recordPracticeAnswer } from '../src/application/practice/recordPracticeAnswer.ts'
import { startPractice } from '../src/application/practice/startPractice.ts'
import { primaryStartState } from '../src/application/practice/warmupTransitions.ts'
import * as pilot from '../src/application/writingAcquisition/pilot.ts'
import { teachingPosition } from '../src/application/writingAcquisition/progress.ts'
import { type AppState, createInitialState, resolveDatasetLifecycles, revealAcquisitionPrompt } from '../src/domain.ts'
import { createDeviceSyncRepository } from '../src/familyBeta/deviceSync.ts'
import { practiceWorkspaceKey, practiceWorkspaceStorage } from '../src/familyBeta/practiceWorkspaceStorage.ts'
import { writingPreviewLesson } from '../src/writingAcquisition/previewLesson.ts'

const host = process.env.FIRESTORE_EMULATOR_HOST || ''
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error('Writing checks require a local Firestore emulator.')
const projectId = 'weekly-dictation-test'
const key = 'weekly-dictation-state-v2'
let environment: RulesTestEnvironment

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: await readFile(process.env.FAMILY_SYNC_RULES_FILE || 'deployment/firestore-family-sync.rules', 'utf8'),
    },
  })
  await environment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore()
    await setDoc(doc(database, 'users/writing-parent'), { familyId: 'family-writing', role: 'parent' })
    await setDoc(doc(database, 'families/family-writing'), { ownerParentId: 'writing-parent' })
    await setDoc(doc(database, 'users/writing-intruder'), { familyId: 'family-other', role: 'parent' })
    await setDoc(doc(database, 'families/family-other'), { ownerParentId: 'writing-intruder' })
  })
})
after(async () => {
  await environment?.cleanup()
})

function token(uid: string) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ iss: `https://securetoken.google.com/${projectId}`, aud: projectId, iat: 0, exp: 3600, auth_time: 0, sub: uid, user_id: uid, firebase: { sign_in_provider: 'custom', identities: {} } })}.`
}
function device() {
  const records = new Map<string, string>()
  return {
    get length() {
      return records.size
    },
    key: (i: number) => [...records.keys()][i] ?? null,
    getItem: (name: string) => records.get(name) ?? null,
    setItem: (name: string, raw: string) => {
      records.set(name, raw)
    },
    removeItem: (name: string) => {
      records.delete(name)
    },
  }
}
const repository = (fetchImpl: typeof fetch = fetch, uid = 'writing-parent') =>
  createDeviceSyncRepository({
    projectId,
    familyId: 'family-writing',
    endpoint: `http://${host}`,
    token: async () => token(uid),
    fetchImpl,
  })
const persistence = {
  cloud: false,
  saveLocalState: () => true,
  journalWarmup() {},
  acknowledgeWarmup() {},
  journalAcquisition() {
    throw new Error('Teacher may not create an answer journal')
  },
  acknowledgeAcquisition() {},
}
async function fixture(childId: string) {
  await environment.withSecurityRulesDisabled((context) =>
    setDoc(doc(context.firestore(), `families/family-writing/children/${childId}`), {
      id: childId,
      active: true,
      grade: 'Grade 2',
    }),
  )
  const dataset = writingPreviewLesson().dataset
  const date = new Date('2026-10-01T16:00:00.000Z')
  const opened = await startPractice({
    state: { ...createInitialState(), datasets: [dataset] },
    child: { id: childId, grade: 'Grade 2', schoolYear: '2026–2027' },
    target: { dataset, phase: 'acquisition' },
    primaryDatasets: [dataset],
    lifecycleResolution: resolveDatasetLifecycles([dataset], date),
    sessionId: `session-${childId}`,
    startedAt: date,
    persistence,
    writingPilot: pilot,
  })
  assert.equal(opened.status, 'started')
  if (opened.status !== 'started') throw new Error('Writing fixture could not start')
  const disk = device()
  const storage = practiceWorkspaceStorage(disk, childId)
  storage.setItem(key, JSON.stringify(opened.state))
  let state = opened.state
  let tick = Date.now() - 10_000
  const session = primaryStartState(opened.session)
  return {
    disk,
    storage,
    session,
    state: () => state,
    step() {
      const position = teachingPosition(state.writingAcquisitionProgress![0])!
      state = pilot.completeStep(state, session, position.step, new Date(++tick).toISOString())
      storage.setItem(key, JSON.stringify(state))
      return state
    },
  }
}
function read(disk: ReturnType<typeof device>, child: string) {
  return JSON.parse(practiceWorkspaceStorage(disk, child).getItem(key)!) as AppState
}

test('five-step writing syncs confirmed teaching across independent stores and survives offline and lost acknowledgements', async () => {
  const child = 'writing-sync-child'
  const first = await fixture(child)
  const second = device()
  await repository().sync(first.disk, child)
  await repository().sync(second, child)
  first.step()
  first.step()
  await repository().sync(first.disk, child)
  await repository().sync(second, child)
  assert.deepEqual(read(second, child).writingAcquisitionProgress, read(first.disk, child).writingAcquisitionProgress)
  assert.equal(teachingPosition(read(second, child).writingAcquisitionProgress![0])?.step, 2)
  first.step()
  const offlineBytes = first.disk.getItem(practiceWorkspaceKey(child))
  await assert.rejects(
    repository(async () => {
      throw new TypeError('Synthetic offline connection')
    }).sync(first.disk, child),
  )
  assert.equal(first.disk.getItem(practiceWorkspaceKey(child)), offlineBytes)
  await repository().sync(first.disk, child)
  await repository().sync(second, child)
  assert.equal(teachingPosition(read(second, child).writingAcquisitionProgress![0])?.step, 3)
  first.step()
  let dropped = false
  await assert.rejects(
    repository(async (url, init) => {
      const response = await fetch(url, init)
      if (!dropped && String(url).endsWith('/documents:commit') && response.ok) {
        dropped = true
        throw new TypeError('Synthetic lost successful commit response')
      }
      return response
    }).sync(first.disk, child),
  )
  assert.equal(dropped, true)
  await repository().sync(first.disk, child)
  const fresh = device()
  await repository().sync(fresh, child)
  assert.deepEqual(read(fresh, child).writingAcquisitionProgress, read(first.disk, child).writingAcquisitionProgress)
  assert.equal(read(fresh, child).writingAcquisitionProgress![0].revision, 4)
  assert.deepEqual(read(fresh, child).results, [])
  assert.doesNotMatch(fresh.getItem(practiceWorkspaceKey(child))!, /learnerInk|handwriting|recordingUrl|data:audio/)
  await assert.rejects(repository(fetch, 'writing-intruder').sync(device(), child))
})

test('final character confirmation syncs atomically before a real scored acquisition checkpoint', async () => {
  const child = 'writing-handoff-child'
  const first = await fixture(child)
  const second = device()
  for (let i = 0; i < 9; i++) first.step()
  await repository().sync(first.disk, child)
  await repository().sync(second, child)
  assert.equal(teachingPosition(read(second, child).writingAcquisitionProgress![0])?.characterIndex, 1)
  assert.equal(teachingPosition(read(second, child).writingAcquisitionProgress![0])?.step, 4)
  first.step()
  await repository().sync(first.disk, child)
  await repository().sync(second, child)
  const handoff = read(second, child)
  assert.equal(teachingPosition(handoff.writingAcquisitionProgress![0]), null)
  assert.equal(handoff.writingAcquisitionProgress![0].completedTeachingSteps[0], 10)
  assert.equal(handoff.acquisitionProgressEnvelopes![0].revision, 0)
  const result = recordPracticeAnswer({
    state: first.state(),
    session: { ...first.session, stage: 'review', acquisition: revealAcquisitionPrompt(first.session.acquisition!) },
    correct: true,
    occurredAt: new Date(),
    persistence,
    writingPilot: pilot,
  })
  assert.equal(result.status, 'writing-ready')
  if (result.status !== 'writing-ready') return
  first.storage.setItem(key, JSON.stringify(result.state))
  await repository().sync(first.disk, child)
  await repository().sync(first.disk, child)
  await repository().sync(second, child)
  assert.deepEqual(read(second, child).writingAcquisitionProgress, read(first.disk, child).writingAcquisitionProgress)
  assert.equal(read(second, child).acquisitionProgressEnvelopes![0].revision, 1)
  assert.equal(read(second, child).writingAcquisitionProgress![0].revision, 11)
})
