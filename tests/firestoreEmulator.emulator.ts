import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore'
import { readFile } from 'node:fs/promises'
import { createResultRepository } from '../src/familyBeta/cloud.ts'
import { createDeviceSyncRepository } from '../src/familyBeta/deviceSync.ts'
import { practiceWorkspaceKey, practiceWorkspaceStorage } from '../src/familyBeta/practiceWorkspaceStorage.ts'
import { createHash } from 'node:crypto'
import { openAcquisitionStore } from '../src/familyBeta/acquisitionStore.ts'
import { retireAcquisition } from '../src/familyBeta/acquisitionRetirement.ts'
import { listSavedLessons, rememberLessonLaunch } from '../src/familyBeta/lessonLaunch.ts'
import { inspectSnapshot, validateCurriculum } from '../src/familyBeta/curriculum.ts'
import { reinforcementGames } from '../src/familyBeta/gamePools.ts'
import { createGameCloudRepository } from '../src/ninjaSkills/gameCloud.ts'
import {
  checkpointGameAnswer,
  completeGameCheckpoint,
  gameScopeKey,
  retireGameCheckpoint,
  serializeGameRecord,
  startGameCheckpoint,
} from '../src/ninjaSkills/progress.ts'
import { grade2AcquisitionStrategy } from '../src/acquisition/strategies/grade2.ts'
import type { AcquisitionPersistenceContext } from '../src/acquisition/persistence/contracts.ts'
import { makeResult } from '../src/familyBeta/model.ts'
import { grade2Tier1WritingAdaptiveWarmupProfile } from '../src/warmup/adaptive/profiles/grade2.ts'
import { childMasteryStateId, createMasteryOccurrence, masteryRotationStateId } from '../src/warmup/adaptive/identity.ts'
import { buildWarmupAnswerTransition, createWarmupVisit } from '../src/warmup/visits/reducer.ts'
import type { ChildMasteryState } from '../src/warmup/adaptive/contracts.ts'
import { encodeChangedCloudWarmupQueueEntry, encodeCloudWarmupVisit } from '../src/persistence/warmup/cloudCodec.ts'

let environment: RulesTestEnvironment
const candidateFamilyGameRules = process.env.FAMILY_SYNC_RULES_FILE?.endsWith('firestore-family-sync.rules') ?? false

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'weekly-dictation-test',
    firestore: { rules: await readFile(process.env.FAMILY_SYNC_RULES_FILE || new URL('../firestore.rules', import.meta.url), 'utf8') },
  })
  await environment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore()
    await setDoc(doc(database, 'users/parent'), { familyId: 'family-parent', role: 'parent' })
    await setDoc(doc(database, 'families/family-parent'), { ownerParentId: 'parent' })
    await setDoc(doc(database, 'families/family-parent/children/maya'), { id: 'maya', active: true, grade: 'Grade 2' })
    await setDoc(doc(database, 'families/family-parent/children/maya/sessions/session-1'), {
      id: 'session-1', childId: 'maya', familyId: 'family-parent', datasetId: 'dataset-1', status: 'in_progress', primaryPhase: 'acquisition',
    })
    await setDoc(doc(database, 'families/family-parent/children/maya/sessions/session-1/attempts/seed-attempt'), {
      id: 'seed-attempt', sessionId: 'session-1', wordId: 'word-1', sourceDatasetId: 'dataset-1',
      phase: 'acquisition', correct: true, reviewedAt: '2026-09-29T15:59:00.000Z', completionStatus: 'complete',
    })
    await setDoc(doc(database, 'datasets/dataset-1'), { id: 'dataset-1', dateRange: '9/28–10/2' })
    await setDoc(doc(database, 'datasets/dataset-1/words/word-1'), { id: 'word-1' })
    await setDoc(doc(database, 'users/intruder'), { familyId: 'family-intruder', role: 'parent' })
    await setDoc(doc(database, 'families/family-intruder'), { ownerParentId: 'intruder' })
    await setDoc(doc(database, 'families/family-intruder/children/other'), { id: 'other', active: true })
    await setDoc(doc(database, 'families/family-intruder/children/other/sessions/other-session/attempts/other-attempt'), {
      id: 'other-attempt', sessionId: 'other-session', wordId: 'word-1', sourceDatasetId: 'dataset-1',
      phase: 'acquisition', correct: true, reviewedAt: '2026-09-29T15:59:00.000Z', completionStatus: 'complete',
    })
  })
})

after(async () => {
  await environment?.cleanup()
})

function receipt(transitionId: string, expectedRevision: number) {
  return {
    progressionId: 'progression-1',
    transitionId,
    payloadFingerprint: `fingerprint-${transitionId}`,
    operation: 'answer',
    promptId: `prompt-${expectedRevision}`,
    expectedRevision,
    appliedRevision: expectedRevision + 1,
    appliedAt: `2026-09-29T16:00:0${expectedRevision + 1}.000Z`,
  }
}

function mockToken(uid: string) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    iss: 'https://securetoken.google.com/weekly-dictation-test',
    aud: 'weekly-dictation-test',
    iat: 0,
    exp: 3600,
    auth_time: 0,
    sub: uid,
    user_id: uid,
    firebase: { sign_in_provider: 'custom', identities: {} },
  })}.`
}

test('family beta results persist across independent clients, retry once, and reject unauthorized changes', async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST!
  const config = { projectId: 'weekly-dictation-test', familyId: 'family-parent', endpoint: `http://${host}`, token: async () => mockToken('parent') }
  const firstDevice = createResultRepository(config)
  const secondDevice = createResultRepository(config)
  const result = makeResult({ id: 'maya', nickname: 'Synthetic learner', grade: 'Grade 2', active: true }, { id: 'beta-emulator-result', activity: 'Writing review', channel: 'writing', datasetIds: ['dataset-1'], correct: 2, attempted: 3 })
  await firstDevice.save(result)
  await firstDevice.save(result)
  assert.deepEqual(await secondDevice.list('maya'), [result])
  await assert.rejects(firstDevice.save({ ...result, correct: 3 }))
  const intruder = createResultRepository({ ...config, token: async () => mockToken('intruder') })
  await assert.rejects(intruder.list('maya'))
  await assert.rejects(intruder.save({ ...result, id: 'unauthorized' }))
  const owner = environment.authenticatedContext('parent').firestore()
  const anonymous = environment.unauthenticatedContext().firestore()
  const path = 'families/family-parent/children/maya/betaResults'
  await assertFails(getDoc(doc(anonymous, `${path}/${result.id}`)))
  await assertFails(setDoc(doc(owner, `${path}/audio`), { ...result, id: 'audio', recording: 'forbidden' }))
  await assertFails(setDoc(doc(owner, `${path}/nested`), { ...result, id: 'nested', datasetIds: [{ recording: 'forbidden' }] }))
  await assertFails(setDoc(doc(owner, `${path}/number`), { ...result, id: 'number', datasetIds: [123] }))
  await assertFails(setDoc(doc(owner, `${path}/grade`), { ...result, id: 'grade', grade: 'Grade 5' }))
  await assertFails(setDoc(doc(owner, `${path}/score`), { ...result, id: 'score', correct: 10 }))
})

test('family game progress is private, conditional, immutable when completed, and permanently retired per run', {
  skip: candidateFamilyGameRules ? false : 'The published root policy does not include the candidate Stage B game collections.',
}, async () => {
  const datasets = inspectSnapshot(
    JSON.parse(await readFile(new URL('../public/curriculum/beta/grade2.json', import.meta.url), 'utf8')),
  ).datasets
  const capability = reinforcementGames(datasets, '2026-10-05', 'Grade 2').find(
    ({ capability: value }) => value.status === 'ready' && value.pack.moduleId === 'memory-flip',
  )!.capability
  if (capability.status !== 'ready') throw new Error('Missing emulator game fixture.')
  const checkpoint = startGameCheckpoint(
    { childId: 'maya', grade: 'Grade 2', week: '2026-10-05', gameId: 'memory-flip' },
    capability.pack,
    'game-attempt-one',
    'game-writer-one',
    '2026-10-09T01:00:00.000Z',
  )
  const host = process.env.FIRESTORE_EMULATOR_HOST!
  const config = {
    projectId: 'weekly-dictation-test',
    familyId: 'family-parent',
    endpoint: `http://${host}`,
    token: async () => mockToken('parent'),
    stillOwner: () => true,
  }
  const first = createGameCloudRepository(config)
  const second = createGameCloudRepository(config)
  const created = await first.writeCheckpoint(checkpoint, null)
  assert.deepEqual((await second.readCheckpoint(checkpoint.scope))?.value, checkpoint)

  const pair = 'pairs' in checkpoint.pack ? checkpoint.pack.pairs[0] : null
  if (!pair) throw new Error('Expected memory pair.')
  const reviewed = checkpointGameAnswer(
    checkpoint,
    {
      gameId: 'memory-flip',
      promptId: pair.id,
      targetId: pair.targetId,
      correct: true,
      assessmentMode: 'automatic',
      response: [`${pair.id}:left`, `${pair.id}:right`],
    },
    '2026-10-09T01:01:00.000Z',
  )
  const updated = await first.writeCheckpoint(reviewed, created.version)
  await assert.rejects(first.writeCheckpoint(checkpoint, created.version))

  const retirement = retireGameCheckpoint(reviewed, '2026-10-09T01:02:00.000Z')
  await first.saveRetirement(retirement)
  await first.saveRetirement(retirement)
  assert.deepEqual(await second.readRetirement(checkpoint.scope, checkpoint.runId), retirement)
  await assert.rejects(first.writeCheckpoint(reviewed, updated.version), /discarded game run/)

  const intruder = createGameCloudRepository({ ...config, token: async () => mockToken('intruder') })
  await assert.rejects(intruder.readCheckpoint(checkpoint.scope))
  await assert.rejects(intruder.saveRetirement({ ...retirement, runId: 'intruder-run' }))

  const owner = environment.authenticatedContext('parent').firestore()
  const anonymous = environment.unauthenticatedContext().firestore()
  const scopeId = createHash('sha256').update(gameScopeKey(checkpoint.scope)).digest('hex')
  const checkpointPath = `families/family-parent/children/maya/betaGameCheckpoints/${scopeId}`
  const retirementPath = `families/family-parent/children/maya/betaGameRetirements/${scopeId}_${checkpoint.runId}`
  await assertFails(getDoc(doc(anonymous, checkpointPath)))
  await assertFails(deleteDoc(doc(owner, retirementPath)))
  await assertFails(
    setDoc(doc(owner, checkpointPath), {
      schema: 1,
      kind: 'checkpoint',
      childId: 'maya',
      grade: 'Grade 2',
      scopeId,
      runId: 'fresh-run',
      recordId: scopeId,
      payload: '{"response":"must-not-be-stored"}',
    }),
  )

  let completed = startGameCheckpoint(
    { ...checkpoint.scope, week: '2026-09-28' },
    capability.pack,
    'game-attempt-two',
    'game-writer-one',
    '2026-10-09T01:03:00.000Z',
  )
  if (!('pairs' in completed.pack)) throw new Error('Expected memory pack.')
  for (const item of completed.pack.pairs) {
    completed = checkpointGameAnswer(
      completed,
      {
        gameId: 'memory-flip',
        promptId: item.id,
        targetId: item.targetId,
        correct: true,
        assessmentMode: 'automatic',
        response: [`${item.id}:left`, `${item.id}:right`],
      },
      '2026-10-09T01:04:00.000Z',
    )
  }
  const completion = completeGameCheckpoint(completed, '2026-10-09T01:04:00.000Z')
  await first.saveCompletion(completion)
  await first.saveCompletion(completion)
  assert.deepEqual(await second.readCompletion('maya', completion.result.id), completion)
  await first.writeCheckpoint(completed, null)
  const completionPath = `families/family-parent/children/maya/betaGameCompletions/${completion.result.id}`
  await assertFails(
    setDoc(doc(owner, completionPath), {
      schema: 1,
      kind: 'completion',
      childId: 'maya',
      grade: 'Grade 2',
      recordId: completion.result.id,
      payload: serializeGameRecord({ ...completion, targets: [] }),
    }),
  )
  await assertFails(deleteDoc(doc(owner, completionPath)))
})

test('family result history paginates by completion and stable identity without dropping same-time attempts', async () => {
  const childId = 'history-child'
  const expected = Array.from({ length: 55 }, (_, i) => makeResult({ id: childId, nickname: 'Synthetic', grade: 'Grade 2', active: true },
    { id: `history-${String(i).padStart(3, '0')}`, activity: 'Writing Dojo', channel: 'writing', datasetIds: ['dataset-1'], correct: 1, attempted: 2 },
    new Date('2026-10-06T15:00:00.000Z')))
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    const batch = writeBatch(db)
    batch.set(doc(db, `families/family-parent/children/${childId}`), { id: childId, active: true, grade: 'Grade 2' })
    for (const result of expected) batch.set(doc(db, `families/family-parent/children/${childId}/betaResults/${result.id}`), result)
    await batch.commit()
  })
  const config = { projectId: 'weekly-dictation-test', familyId: 'family-parent', endpoint: `http://${process.env.FIRESTORE_EMULATOR_HOST}`, token: async () => mockToken('parent') }
  const repository = createResultRepository(config)
  const first = await repository.listPage(childId)
  assert.equal(first.results.length, 50)
  assert.ok(first.nextPageToken)
  await repository.save({ ...expected[0], id: 'new-arrival', completedAt: '2026-10-06T16:00:00.000Z' })
  const second = await repository.listPage(childId, first.nextPageToken)
  assert.equal(second.results.length, 5)
  assert.equal(second.nextPageToken, '')
  assert.deepEqual([...first.results, ...second.results].map(r => r.id), expected.map(r => r.id).reverse())
  assert.equal((await repository.listPage(childId)).results[0].id, 'new-arrival')
  await assert.rejects(createResultRepository({ ...config, token: async () => mockToken('intruder') }).listPage(childId, first.nextPageToken))
})

test('family school-year scores save and retry across all grades while remaining private and immutable', async () => {
  const config = { projectId: 'weekly-dictation-test', familyId: 'family-parent', endpoint: `http://${process.env.FIRESTORE_EMULATOR_HOST}`, token: async () => mockToken('parent') }
  const first = createResultRepository(config), second = createResultRepository(config)
  const intruder = createResultRepository({ ...config, token: async () => mockToken('intruder') })
  const owner = environment.authenticatedContext('parent').firestore()
  const anonymous = environment.unauthenticatedContext().firestore()
  for (const [index, grade] of (['Kindergarten', 'Grade 2', 'Grade 5'] as const).entries()) {
    const child = { id: `school-year-child-${index}`, nickname: 'Synthetic', grade, active: true }
    await environment.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), `families/family-parent/children/${child.id}`), child))
    for (const channel of ['writing', 'reading', 'game'] as const) {
      const result = makeResult(child, { id: `school-year-${channel}`, activity: 'Policy regression', channel, datasetIds: ['dataset-1'], schoolYear: '2026-27', correct: 1, attempted: 2 })
      const path = `families/family-parent/children/${child.id}/betaResults`
      await first.save(result)
      await first.save(result)
      assert.deepEqual((await second.list(child.id)).filter(r => r.id === result.id), [result])
      await assert.rejects(first.save({ ...result, schoolYear: '2025-26' }))
      await assert.rejects(intruder.save({ ...result, id: `unauthorized-${channel}` }))
      await assertFails(getDoc(doc(anonymous, `${path}/${result.id}`)))
      await assertFails(deleteDoc(doc(owner, `${path}/${result.id}`)))
      for (const [valueIndex, schoolYear] of [null, 123, '', 'x'.repeat(33), [], {}].entries()) {
        const id = `invalid-${channel}-${valueIndex}`
        await assertFails(setDoc(doc(owner, `${path}/${id}`), { ...result, id, schoolYear }))
      }
      for (const field of ['recording', 'handwritingImage', 'response']) {
        const id = `forbidden-${channel}-${field}`
        await assertFails(setDoc(doc(owner, `${path}/${id}`), { ...result, id, [field]: 'forbidden' }))
      }
    }
    await assert.rejects(intruder.list(child.id))
  }
})

test('family practice sync hydrates another device, preserves conflicts, and rejects cross-family and anonymous access', async () => {
  const config = { projectId: 'weekly-dictation-test', familyId: 'family-parent',
    endpoint: `http://${process.env.FIRESTORE_EMULATOR_HOST}`, token: async () => mockToken('parent') }
  const repository = createDeviceSyncRepository(config)
  const device = () => {
    const entries = new Map<string, string>()
    return { get length() { return entries.size }, key: (i: number) => [...entries.keys()][i] ?? null,
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => { entries.set(key, value) } }
  }
  const first = device(), second = device()
  const key = 'family-beta-activity:maya:test-checkpoint'
  first.setItem(key, JSON.stringify({ trial: 1 }))
  first.setItem('weekly-dictation-auth-v1', 'must-not-upload')
  await repository.sync(first, 'maya')
  await repository.sync(second, 'maya')
  assert.equal(second.getItem(key), first.getItem(key))
  assert.equal(second.getItem('weekly-dictation-auth-v1'), null)
  second.setItem(key, JSON.stringify({ trial: 2 }))
  await repository.sync(second, 'maya')
  await assert.rejects(repository.sync(first, 'maya', false), /open activity was not changed/)
  assert.equal(first.getItem(key), JSON.stringify({ trial: 1 }))
  await repository.sync(first, 'maya')
  assert.equal(first.getItem(key), JSON.stringify({ trial: 2 }))
  const interruptedKey = 'family-beta-activity:maya:interrupted-upload'
  first.setItem(interruptedKey, JSON.stringify({ trial: 1 }))
  const interrupted = createDeviceSyncRepository({ ...config, fetchImpl: async (url, init) => {
    const response = await fetch(url, init)
    if (String(url).endsWith('/documents:commit')) {
      assert.equal(response.ok, true)
      first.setItem(interruptedKey, JSON.stringify({ trial: 2 }))
      throw new Error('Synthetic dropped upload response')
    }
    return response
  } })
  await assert.rejects(interrupted.sync(first, 'maya'), /dropped upload response/)
  await repository.sync(first, 'maya')
  await repository.sync(second, 'maya')
  assert.equal(second.getItem(interruptedKey), JSON.stringify({ trial: 2 }))
  first.setItem(key, JSON.stringify({ trial: 3, correct: true }))
  second.setItem(key, JSON.stringify({ trial: 3, correct: false }))
  await repository.sync(first, 'maya')
  await assert.rejects(repository.sync(second, 'maya'), /both devices/)
  assert.equal(second.getItem(key), JSON.stringify({ trial: 3, correct: false }))
  const fresh = device()
  await repository.sync(fresh, 'maya')
  assert.equal(fresh.getItem(key), JSON.stringify({ trial: 3, correct: true }))
  await assert.rejects(createDeviceSyncRepository({ ...config, token: async () => mockToken('intruder') }).sync(device(), 'maya'))
  const db = environment.authenticatedContext('parent').firestore()
  const anonymous = environment.unauthenticatedContext().firestore()
  const id = 'a'.repeat(64)
  const path = `families/family-parent/children/maya/betaPractice/${id}`
  const record = { schema: 1, childId: 'maya', key, payload: '{}', generation: 1 }
  await assertSucceeds(setDoc(doc(db, path), record))
  await assertFails(getDoc(doc(anonymous, path)))
  await assertFails(setDoc(doc(db, path), record))
  await assertFails(setDoc(doc(db, path), { ...record, generation: 2, childId: 'other' }))
  await assertFails(setDoc(doc(db, path), { ...record, generation: 2, key: 'weekly-dictation-auth-v1' }))
  await assertFails(setDoc(doc(db, path), { ...record, generation: 2, recording: 'forbidden' }))
})

test('family protected workspace survives an older client updating its separate legacy record', async () => {
  const childId = 'protected-workspace'
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), `families/family-parent/children/${childId}`), { id: childId, active: true, grade: 'Grade 2' })
  })
  const repository = createDeviceSyncRepository({ projectId: 'weekly-dictation-test', familyId: 'family-parent',
    endpoint: `http://${process.env.FIRESTORE_EMULATOR_HOST}`, token: async () => mockToken('parent') })
  const device = () => {
    const records = new Map<string, string>()
    return { get length() { return records.size }, key: (i: number) => [...records.keys()][i] ?? null,
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => { records.set(key, value) } }
  }
  const first = device(), upgraded = device(), fresh = device()
  const logicalKey = 'weekly-dictation-state-v2'
  const legacy = `family-beta-activity:${childId}:${logicalKey}`
  const journal = `family-beta-activity:${childId}:weekly-dictation-acquisition-pending-v1`
  first.setItem(legacy, '{"edition":"original"}')
  first.setItem(journal, '{"transition":"pending-original"}')
  await repository.sync(first, childId)
  await repository.sync(upgraded, childId)
  const workspace = practiceWorkspaceStorage(upgraded, childId)
  assert.equal(workspace.getItem('weekly-dictation-acquisition-pending-v1'), first.getItem(journal))
  workspace.setItem(logicalKey, '{"edition":"corrected","reviewed":2}')
  await repository.sync(upgraded, childId)
  // Use the old protocol's authenticated, generation-checked write. The old
  // client has no knowledge of the protected namespace or its current payload.
  const db = environment.authenticatedContext('parent').firestore()
  const path = `families/family-parent/children/${childId}/betaPractice/${createHash('sha256').update(legacy).digest('hex')}`
  await assertSucceeds(setDoc(doc(db, path), { schema: 1, childId, key: legacy, payload: '{"edition":"old-client-later-answer"}', generation: 2 }))
  // Deliberately divergent old browser data must not block the new namespace.
  fresh.setItem(legacy, '{"edition":"another-old-device"}')
  await repository.sync(fresh, childId)
  assert.equal(fresh.getItem(practiceWorkspaceKey(childId)), upgraded.getItem(practiceWorkspaceKey(childId)))
  assert.equal(practiceWorkspaceStorage(fresh, childId).getItem(logicalKey), workspace.getItem(logicalKey))
  assert.equal(fresh.getItem(legacy), '{"edition":"another-old-device"}')
  assert.equal((await getDoc(doc(db, path))).data()!.payload, '{"edition":"old-client-later-answer"}')
  await repository.sync(upgraded, childId)
  assert.equal(upgraded.getItem(legacy), first.getItem(legacy))
  await assertFails(getDoc(doc(environment.authenticatedContext('intruder').firestore(), path)))
})

test('family pinned lessons and completed archives recover unchanged on a second device', async () => {
  const childId = 'pinning-child'
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), `families/family-parent/children/${childId}`), { id: childId, active: true, grade: 'Grade 2' })
  })
  const config = { projectId: 'weekly-dictation-test', familyId: 'family-parent',
    endpoint: `http://${process.env.FIRESTORE_EMULATOR_HOST}`, token: async () => mockToken('parent') }
  const repository = createDeviceSyncRepository(config)
  const device = () => {
    const entries = new Map<string, string>()
    return { entries, get length() { return entries.size }, key: (i: number) => [...entries.keys()][i] ?? null,
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => { entries.set(key, value) } }
  }
  const first = device(), second = device()
  const context: AcquisitionPersistenceContext = {
    identity: { childId, grade: 'Grade 2', datasetId: 'pin-week', schoolYear: '2026-27', activityModule: 'writing-dojo', tier: 'tier-1' },
    lifecycleStage: { kind: 'acquisition' }, applicationVersion: 'synthetic-pinning-test',
    strategy: grade2AcquisitionStrategy,
    targetSet: { id: 'pin-week', targets: [{ id: 'pin-word', datasetId: 'pin-week', text: '一', sentence: '', tier: 'tier-1' }] },
  }
  const latest = { ...context, targetSet: { ...context.targetSet, targets: context.targetSet.targets.map(t => ({ ...t, text: '二' })) } }
  const store = openAcquisitionStore(first, context, { random: () => 0 })
  store.answer(true, 'timer')
  await repository.sync(first, childId)
  await repository.sync(second, childId)
  const remoteResume = openAcquisitionStore(second, latest)
  assert.equal(second.getItem(store.key), first.getItem(store.key))
  assert.deepEqual(remoteResume.context.targetSet, context.targetSet)
  let guard = 0
  while (!store.current.envelope.flow.complete && guard++ < 150) store.answer(true, 'timer')
  assert.equal(store.current.envelope.flow.teachingComplete, true)
  const original = first.getItem(store.key)
  const corrected = openAcquisitionStore(first, latest)
  corrected.finishSession()
  await repository.sync(first, childId)
  await repository.sync(second, childId)
  assert.deepEqual(openAcquisitionStore(second, latest).context.targetSet, latest.targetSet)
  const archive = [...first.entries.keys()].find(key => key.startsWith(`${store.key}:completed:`))!
  assert.ok(archive)
  assert.equal(second.getItem(archive), original)
  await assert.rejects(createDeviceSyncRepository({ ...config, token: async () => mockToken('intruder') }).sync(device(), childId))
})

test('family saved-source routes reopen on a second device with no teacher request', async () => {
  const childId = 'lesson-route-child'
  const profile = { id: childId, grade: 'Grade 5' as const, nickname: 'Synthetic', active: true }
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), `families/family-parent/children/${childId}`), profile)
  })
  const loaded = await validateCurriculum(await readFile(new URL('../public/curriculum/beta/grade5.json', import.meta.url), 'utf8'), 'Grade 5')
  const dataset = loaded.datasets.find(d => d.words.length)!
  const context: AcquisitionPersistenceContext = {
    identity: { childId, grade: 'Grade 5', datasetId: dataset.id, schoolYear: '2026-27', activityModule: 'writing-dojo', tier: 'tier-1' },
    lifecycleStage: { kind: 'acquisition' }, applicationVersion: 'route-test', strategy: grade2AcquisitionStrategy,
    targetSet: { id: dataset.id, targets: dataset.words },
  }
  const device = () => {
    const entries = new Map<string, string>()
    return { get length() { return entries.size }, key: (i: number) => [...entries.keys()][i] ?? null,
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => { entries.set(key, value) } }
  }
  const first = device(), second = device()
  const store = openAcquisitionStore(first, context)
  rememberLessonLaunch(first, profile, store.current.envelope, loaded.snapshot, dataset.startDate)
  store.answer(false, 'test')
  const config = { projectId: 'weekly-dictation-test', familyId: 'family-parent',
    endpoint: `http://${process.env.FIRESTORE_EMULATOR_HOST}`, token: async () => mockToken('parent') }
  const repository = createDeviceSyncRepository(config)
  await repository.sync(first, childId)
  await repository.sync(second, childId)
  const restored = await listSavedLessons(second, profile)
  assert.deepEqual(restored.warnings, [])
  assert.equal(restored.lessons.length, 1)
  assert.deepEqual(restored.lessons[0].source, loaded.snapshot)
  assert.equal(second.getItem(store.key), first.getItem(store.key))
  await assert.rejects(createDeviceSyncRepository({ ...config, token: async () => mockToken('intruder') }).sync(device(), childId))
})

test('family discard reaches a stale second device before a checkpoint conflict and cannot resurrect old work', async () => {
  const childId = 'retirement-child'
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), `families/family-parent/children/${childId}`), { id: childId, active: true, grade: 'Grade 2' })
  })
  const repository = createDeviceSyncRepository({ projectId: 'weekly-dictation-test', familyId: 'family-parent', endpoint: `http://${process.env.FIRESTORE_EMULATOR_HOST}`, token: async () => mockToken('parent') })
  const device = () => {
    const entries = new Map<string, string>()
    return { get length() { return entries.size }, key: (i: number) => [...entries.keys()][i] ?? null, getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value) } }
  }
  const first = device(), second = device()
  const context: AcquisitionPersistenceContext = {
    identity: { childId, grade: 'Grade 2', datasetId: 'retired-week', schoolYear: '2026-27', activityModule: 'writing-dojo', tier: 'tier-1' }, lifecycleStage: { kind: 'acquisition' }, applicationVersion: 'retirement-test', strategy: grade2AcquisitionStrategy,
    targetSet: { id: 'retired-week', targets: [{ id: 'word', datasetId: 'retired-week', text: '一', sentence: '', tier: 'tier-1' }] },
  }
  const original = openAcquisitionStore(first, context, { random: () => 0 })
  await repository.sync(first, childId)
  await repository.sync(second, childId)
  const stale = openAcquisitionStore(second, context)
  original.answer(true, 'timer')
  stale.answer(false, 'timer')
  const retained = first.getItem(original.key), staleRetained = second.getItem(stale.key)
  retireAcquisition(first, original.context.identity)
  await repository.sync(first, childId)
  // A reviewed answer is a trusted unfinished-attempt checkpoint. The later
  // device answer wins automatically; the retirement marker still prevents
  // the discarded activity from continuing or resurrecting its old lesson.
  await repository.sync(second, childId)
  assert.throws(() => stale.answer(true, 'timer'), /discarded/)
  const fresh = openAcquisitionStore(second, context)
  assert.notEqual(fresh.key, original.key)
  assert.equal(fresh.current.envelope.revision, 0)
  assert.equal(first.getItem(original.key), retained)
  assert.equal(second.getItem(stale.key), staleRetained)
  const third = device()
  await repository.sync(third, childId)
  assert.equal(openAcquisitionStore(third, context).key, fresh.key)
})

async function runCollectionGroupQuery(uid: string, parent: string, collectionId: string) {
  const host = process.env.FIRESTORE_EMULATOR_HOST
  assert.ok(host, 'The Firestore Emulator host must be configured.')
  return fetch(
    `http://${host}/v1/projects/weekly-dictation-test/databases/(default)/documents${parent}:runQuery`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mockToken(uid)}`,
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId, allDescendants: true }],
          limit: 100,
        },
      }),
    },
  )
}

function progression(revision: number, transitionId: string) {
  const applied = receipt(transitionId, revision - 1)
  return {
    schemaVersion: 1,
    contractId: 'acquisition-persistence-v1',
    id: 'progression-1',
    childId: 'maya',
    datasetId: 'dataset-1',
    grade: 'Grade 2',
    schoolYear: '2026-27',
    activityModule: 'mandarin-tier1-writing',
    tier: 'tier-1',
    lifecycleStageAtLastCheckpoint: { kind: 'acquisition' },
    applicationVersion: 'test',
    strategyId: 'grade-2-acquisition-v3',
    strategyVersion: 3,
    strategyFingerprint: 'strategy-fingerprint',
    targetSetFingerprint: 'target-fingerprint',
    targetOccurrenceIds: ['word-1'],
    revision,
    status: 'in-progress',
    flow: { datasetId: 'dataset-1' },
    lastAppliedTransition: applied,
    createdAt: '2026-09-29T16:00:00.000Z',
    updatedAt: applied.appliedAt,
  }
}

function atomicCheckpointBatch(uid: 'parent' | 'intruder', revision: number, transitionId: string, options: { attempt?: boolean; dtObservation?: boolean; changedDataset?: boolean; invalidStatus?: boolean; receiptPathId?: string } = {}) {
  const database = environment.authenticatedContext(uid).firestore()
  const batch = writeBatch(database)
  const next = progression(revision, transitionId)
  if (options.changedDataset) next.datasetId = 'other-dataset'
  if (options.invalidStatus) next.status = 'finished'
  batch.set(doc(database, 'families/family-parent/children/maya/acquisitionProgressions/progression-1'), next)
  batch.set(doc(database, `families/family-parent/children/maya/acquisitionTransitions/${options.receiptPathId || transitionId}`), receipt(transitionId, revision - 1))
  if (options.attempt) batch.set(doc(database, `families/family-parent/children/maya/sessions/session-1/attempts/attempt-${revision}`), {
    id: `attempt-${revision}`,
    sessionId: 'session-1',
    wordId: 'word-1',
    sourceDatasetId: 'dataset-1',
    phase: 'acquisition',
    correct: true,
    reviewedAt: receipt(transitionId, revision - 1).appliedAt,
    completionStatus: 'complete',
    transitionId,
  })
  if (options.dtObservation) batch.set(doc(database, `families/family-parent/children/maya/dtObservations/observation-${revision}`), {
    id: `observation-${revision}`,
    childId: 'maya',
    sessionId: 'session-1',
    datasetId: 'dataset-1',
    wordId: 'word-1',
    text: '需要',
    poolType: 'earned',
    correct: true,
    revealMethod: 'timer',
    reviewedAt: receipt(transitionId, revision - 1).appliedAt,
    transitionId,
  })
  return batch
}

const warmupMasteryTermId = createMasteryOccurrence({
  occurrenceId: 'word-1',
  datasetId: 'dataset-1',
  grade: 'Grade 2',
  schoolYear: '2026-27',
  text: '需要',
  activityModule: 'mandarin-tier1-writing',
  tier: 'tier-1',
  language: 'mandarin',
}).masteryTermId
const warmupMasteryState: ChildMasteryState = {
  version: 1,
  id: childMasteryStateId('maya', warmupMasteryTermId),
  childId: 'maya',
  masteryTermId: warmupMasteryTermId,
  evidence: 'unassessed',
  bucket: 'recent-entry',
  consecutiveCorrect: 0,
  schedulingProfile: { id: grade2Tier1WritingAdaptiveWarmupProfile.id, version: grade2Tier1WritingAdaptiveWarmupProfile.version, sourceOccurrenceId: 'word-1' },
  integratedOccurrences: [{ occurrenceId: 'word-1', evidence: 'none', eligibilityBasis: { kind: 'verified-mastery', lifecycleProfileId: 'grade2-replacement-2026-27', finalTestReviewCycle: 1 } }],
}
const warmupVisit = createWarmupVisit({
  id: 'warmup-visit-1',
  childId: 'maya',
  grade: 'Grade 2',
  schoolYear: '2026-27',
  profile: grade2Tier1WritingAdaptiveWarmupProfile,
  tier: 'tier-1',
  language: 'mandarin',
  selection: {
    visitType: 'standalone',
    profile: { id: grade2Tier1WritingAdaptiveWarmupProfile.id, version: grade2Tier1WritingAdaptiveWarmupProfile.version },
    configuredMaximum: 16,
    entries: [{ masteryTermId: warmupMasteryTermId, sourceBucket: 'recent-entry', occurrenceIds: ['word-1'] }],
    rotationCycle: 1,
    rotationAdvanced: false,
  },
  promptForEntry: () => ({ wordId: 'word-1', datasetId: 'dataset-1', text: '需要', sentence: '我需要帮助。' }),
  createdAt: '2026-09-30T16:00:00.000Z',
})
const warmupTransition = buildWarmupAnswerTransition({
  visit: warmupVisit,
  mastery: { revision: 0, state: warmupMasteryState },
  profile: grade2Tier1WritingAdaptiveWarmupProfile,
  correct: true,
  revealMethod: 'timer',
  occurredAt: '2026-09-30T16:01:00.000Z',
})
const encodedWarmupVisit = encodeCloudWarmupVisit(warmupVisit)

function warmupTransitionBatch(uid: 'parent' | 'intruder', transition = warmupTransition) {
  const database = environment.authenticatedContext(uid).firestore()
  const batch = writeBatch(database)
  const encoded = encodeCloudWarmupVisit(transition.nextVisit)
  batch.set(doc(database, `families/family-parent/children/maya/warmupVisits/${transition.visitId}`), encoded.visit)
  batch.set(doc(database, `families/family-parent/children/maya/warmupTransitions/${transition.transitionId}`), transition.nextVisit.lastAppliedTransition!)
  if (transition.queueEntryId) batch.set(doc(database, `families/family-parent/children/maya/warmupQueueEntries/${transition.queueEntryId}`), encodeChangedCloudWarmupQueueEntry(transition.nextVisit, transition.queueEntryId))
  if (transition.nextMastery) batch.set(doc(database, `families/family-parent/children/maya/warmupMastery/${transition.nextMastery.state.id}`), transition.nextMastery)
  if (transition.attempt) batch.set(doc(database, `families/family-parent/children/maya/warmupAttempts/${transition.attempt.id}`), transition.attempt)
  if (transition.graphPoint) batch.set(doc(database, `families/family-parent/children/maya/warmupGraphPoints/${transition.graphPoint.id}`), transition.graphPoint)
  return batch
}

test('an owner can atomically create a progression and immutable receipt', async () => {
  await assertSucceeds(atomicCheckpointBatch('parent', 1, 'transition-1').commit())
})

test('bounded collection-group hydration reads vocabulary and only the selected family child attempts', async () => {
  const words = await runCollectionGroupQuery('parent', '', 'words')
  assert.equal(words.status, 200, words.status === 200 ? undefined : await words.text())

  const attempts = await runCollectionGroupQuery(
    'parent',
    '/families/family-parent/children/maya',
    'attempts',
  )
  assert.equal(attempts.status, 200, attempts.status === 200 ? undefined : await attempts.text())
  const attemptRows = (await attempts.json()) as Array<{ document?: { name?: string } }>
  const names = attemptRows.flatMap((row) => (row.document?.name ? [row.document.name] : []))
  assert.ok(names.some((name) => name.endsWith('/attempts/seed-attempt')))
  assert.ok(names.every((name) => name.includes('/families/family-parent/children/maya/')))

  const crossFamily = await runCollectionGroupQuery(
    'intruder',
    '/families/family-parent/children/maya',
    'attempts',
  )
  assert.equal(crossFamily.status, 403)
})

test('the next revision, scored attempt, and DT observation require the same atomic receipt', async () => {
  await assertSucceeds(atomicCheckpointBatch('parent', 2, 'transition-2', { attempt: true, dtObservation: true }).commit())
  const database = environment.authenticatedContext('parent').firestore()
  await assertFails(setDoc(doc(database, 'families/family-parent/children/maya/sessions/session-1/attempts/unreceipted'), {
    id: 'unreceipted', sessionId: 'session-1', wordId: 'word-1', sourceDatasetId: 'dataset-1', phase: 'acquisition',
    correct: true, reviewedAt: '2026-09-29T16:00:03.000Z', completionStatus: 'complete', transitionId: 'missing-transition',
  }))
  await assertFails(setDoc(doc(database, 'families/family-parent/children/maya/dtObservations/unreceipted'), {
    id: 'unreceipted', childId: 'maya', sessionId: 'session-1', datasetId: 'dataset-1', wordId: 'word-1', text: '需要',
    poolType: 'earned', correct: true, revealMethod: 'timer', reviewedAt: '2026-09-29T16:00:03.000Z', transitionId: 'missing-transition',
  }))
})

test('Test Review cycle identity is accepted only on matching session, attempt, and score records', async () => {
  const database = environment.authenticatedContext('parent').firestore()
  const session = {
    id: 'test-review-2', childId: 'maya', familyId: 'family-parent', status: 'completed', primaryPhase: 'test-review',
    reviewCycle: 2, datasetId: 'dataset-1', sessionDate: '2026-09-30T16:00:00.000Z', localDate: '2026-09-30',
    startedAt: '2026-09-30T16:00:00.000Z', warmupStatus: 'skipped', applicationVersion: 'test',
  }
  const sessionReference = doc(database, 'families/family-parent/children/maya/sessions/test-review-2')
  await assertSucceeds(setDoc(sessionReference, { ...session, status: 'in_progress', warmupStatus: 'not_started' }))
  const scoreReference = doc(database, 'families/family-parent/children/maya/scores/review-score')
  const score = {
    id: 'review-score', childId: 'maya', datasetId: 'dataset-1', datasetDateRange: '9/28–10/2', sessionId: 'test-review-2', sessionDate: '2026-09-30',
    phase: 'test-review', reviewCycle: 2, percent: 100, correct: 1, wordCount: 1,
  }
  const completion = writeBatch(database)
  completion.set(sessionReference, session)
  completion.set(doc(database, 'families/family-parent/children/maya/sessions/test-review-2/attempts/review-attempt'), {
    id: 'review-attempt', sessionId: 'test-review-2', wordId: 'word-1', sourceDatasetId: 'dataset-1', phase: 'test-review',
    reviewCycle: 2, correct: true, reviewedAt: '2026-09-30T16:01:00.000Z', completionStatus: 'complete',
  })
  completion.set(scoreReference, score)
  await assertSucceeds(completion.commit())
  await assertSucceeds(setDoc(scoreReference, score))
  await assertFails(setDoc(scoreReference, { ...score, percent: 0, correct: 0 }))
  await assertFails(setDoc(sessionReference, { ...session, startedAt: '2026-09-30T17:00:00.000Z' }))
  await assertFails(setDoc(doc(database, 'families/family-parent/children/maya/scores/forged-path'), { ...score }))
  await assertFails(setDoc(doc(database, 'families/family-parent/children/maya/scores/forged-percent'), {
    ...score, id: 'forged-percent', percent: 100, correct: 0,
  }))
  await assertFails(setDoc(doc(database, 'families/family-parent/children/maya/scores/forged-date-range'), {
    ...score, id: 'forged-date-range', datasetDateRange: 'invented',
  }))
  await assertFails(setDoc(doc(database, 'families/family-parent/children/maya/sessions/test-review-2/attempts/extra-field'), {
    id: 'extra-field', sessionId: 'test-review-2', wordId: 'word-1', sourceDatasetId: 'dataset-1', phase: 'test-review',
    reviewCycle: 2, correct: true, reviewedAt: '2026-09-30T16:01:00.000Z', completionStatus: 'complete', unexpected: true,
  }))
  await assertFails(setDoc(doc(database, 'families/family-parent/children/maya/sessions/invalid-review-cycle'), { ...session, id: 'invalid-review-cycle', reviewCycle: 0 }))
  await assertFails(setDoc(doc(database, 'families/family-parent/children/maya/sessions/acquisition-with-review-cycle'), { ...session, id: 'acquisition-with-review-cycle', primaryPhase: 'acquisition' }))
  await assertFails(setDoc(doc(database, 'families/family-parent/children/maya/sessions/test-review-2/attempts/acquisition-with-review-cycle'), {
    id: 'acquisition-with-review-cycle', sessionId: 'test-review-2', wordId: 'word-1', sourceDatasetId: 'dataset-1', phase: 'acquisition',
    reviewCycle: 2, correct: true, reviewedAt: '2026-09-30T16:02:00.000Z', completionStatus: 'complete',
  }))
  await assertFails(setDoc(doc(database, 'families/family-parent/children/maya/sessions/test-review-2/attempts/wrong-review-cycle'), {
    id: 'wrong-review-cycle', sessionId: 'test-review-2', wordId: 'word-1', sourceDatasetId: 'dataset-1', phase: 'test-review',
    reviewCycle: 1, correct: true, reviewedAt: '2026-09-30T16:03:00.000Z', completionStatus: 'complete',
  }))
  await assertFails(setDoc(doc(database, 'families/family-parent/children/maya/scores/wrong-review-cycle'), {
    id: 'wrong-review-cycle', childId: 'maya', datasetId: 'dataset-1', sessionId: 'test-review-2', sessionDate: '2026-09-30',
    phase: 'test-review', reviewCycle: 1, percent: 100, correct: 1, wordCount: 1,
  }))
})

test('malformed IDs, statuses, stale revisions, immutable identity, and cross-family access fail', async () => {
  await assertFails(atomicCheckpointBatch('parent', 2, 'stale-transition').commit())
  await assertFails(atomicCheckpointBatch('parent', 3, 'changed-identity', { changedDataset: true }).commit())
  await assertFails(atomicCheckpointBatch('parent', 3, 'invalid-status', { invalidStatus: true }).commit())
  await assertFails(atomicCheckpointBatch('parent', 3, 'path-id-mismatch', { receiptPathId: 'different-path-id' }).commit())
  const owner = environment.authenticatedContext('parent').firestore()
  await assertFails(setDoc(doc(owner, 'families/family-parent/children/maya/acquisitionTransitions/transition-1'), receipt('transition-1', 0)))
  await assertFails(atomicCheckpointBatch('intruder', 3, 'intruder-transition').commit())
  const intruder = environment.authenticatedContext('intruder').firestore()
  await assertFails(getDoc(doc(intruder, 'families/family-parent/children/maya/acquisitionProgressions/progression-1')))
  assert.ok(true)
})

test('an owner can seed a versioned Warmup visit, mastery state, and rotation', async () => {
  const database = environment.authenticatedContext('parent').firestore()
  const batch = writeBatch(database)
  batch.set(doc(database, `families/family-parent/children/maya/warmupVisits/${warmupVisit.id}`), encodedWarmupVisit.visit)
  for (const entry of encodedWarmupVisit.queueEntries) batch.set(doc(database, `families/family-parent/children/maya/warmupQueueEntries/${entry.id}`), entry)
  batch.set(doc(database, `families/family-parent/children/maya/warmupMastery/${warmupMasteryState.id}`), { revision: 0, state: warmupMasteryState })
  const rotationId = masteryRotationStateId('maya', 'mandarin-tier1-writing')
  batch.set(doc(database, `families/family-parent/children/maya/warmupRotations/${rotationId}`), { version: 1, id: rotationId, childId: 'maya', activityModule: 'mandarin-tier1-writing', cycle: 1 })
  await assertSucceeds(batch.commit())
})

test('one Warmup batch atomically advances visit and mastery while creating its receipt, attempt, and graph point', async () => {
  await assertSucceeds(warmupTransitionBatch('parent').commit())
  const database = environment.authenticatedContext('parent').firestore()
  assert.equal((await getDoc(doc(database, `families/family-parent/children/maya/warmupVisits/${warmupVisit.id}`))).data()?.revision, 1)
  assert.equal((await getDoc(doc(database, `families/family-parent/children/maya/warmupMastery/${warmupMasteryState.id}`))).data()?.revision, 1)
})

test('Warmup rules reject duplicate, stale, malformed-ID, and cross-family operations', async () => {
  await assertFails(warmupTransitionBatch('parent').commit())
  const owner = environment.authenticatedContext('parent').firestore()
  await assertFails(setDoc(doc(owner, 'families/family-parent/children/maya/warmupAttempts/wrong-id'), { ...warmupTransition.attempt, id: 'different-id' }))
  const detachedAttemptId = 'warmup-attempt-v1-0000000000000000'
  await assertFails(setDoc(doc(owner, `families/family-parent/children/maya/warmupAttempts/${detachedAttemptId}`), { ...warmupTransition.attempt, id: detachedAttemptId }))
  const detachedGraphId = 'warmup-graph-v1-0000000000000000'
  await assertFails(setDoc(doc(owner, `families/family-parent/children/maya/warmupGraphPoints/${detachedGraphId}`), { ...warmupTransition.graphPoint, id: detachedGraphId }))
  const impossibleMasteryId = childMasteryStateId('maya', 'impossible-term')
  await assertFails(setDoc(doc(owner, `families/family-parent/children/maya/warmupMastery/${impossibleMasteryId}`), {
    revision: 0,
    state: { ...warmupMasteryState, id: impossibleMasteryId, masteryTermId: 'impossible-term', evidence: 'unassessed', bucket: 'recent-entry', consecutiveCorrect: 1 },
  }))
  await assertFails(warmupTransitionBatch('intruder').commit())
  const intruder = environment.authenticatedContext('intruder').firestore()
  await assertFails(getDoc(doc(intruder, `families/family-parent/children/maya/warmupVisits/${warmupVisit.id}`)))
})
