import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { inspectSnapshot } from '../src/familyBeta/curriculum.ts'
import { reinforcementGames } from '../src/familyBeta/gamePools.ts'
import { ownedPracticeRecord } from '../src/familyBeta/deviceSync.ts'
import type { LearningModuleAttempt, LearningModulePack } from '../src/ninjaSkills/contracts.ts'
import {
  checkpointGameAnswer,
  checkpointGameTimer,
  completeGameCheckpoint,
  continueGameCheckpoint,
  gameCheckpointComplete,
  reconcileGameCheckpoints,
  retireGameCheckpoint,
  retryTimedGame,
  serializeGameRecord,
  startGameCheckpoint,
  validateGameCheckpoint,
  validateGameCompletion,
  type GameCheckpoint,
  type GameCompletion,
  type GameRetirement,
} from '../src/ninjaSkills/progress.ts'
import {
  createGameProgressStore,
  createLockedGameProgressStore,
  type GameWriteLock,
} from '../src/ninjaSkills/progressStore.ts'
import { syncGameProgress, type GameProgressRemote } from '../src/ninjaSkills/progressSync.ts'
import { reconcileGameHistory, type GameHistoryRemote } from '../src/ninjaSkills/gameHistory.ts'
import { openGameSession } from '../src/ninjaSkills/gameSession.ts'
import { saveGameAggregate } from '../src/familyBeta/gameResultBridge.ts'
import { readResultLedger, RESULT_KEY, PENDING_KEY } from '../src/familyBeta/resultLedger.ts'

const now = '2026-10-09T01:00:00.000Z'
const later = '2026-10-09T01:01:00.000Z'
const grades = [
  ['kindergarten', 'Kindergarten'],
  ['grade2', 'Grade 2'],
  ['grade5', 'Grade 5'],
] as const
const games = ['memory-flip', 'speed-match', 'context-gap-dash', 'sentence-scramble'] as const
function fixture(gameId: (typeof games)[number] = 'memory-flip', grade: (typeof grades)[number] = grades[2]) {
  const datasets = inspectSnapshot(
    JSON.parse(readFileSync(new URL(`../public/curriculum/beta/${grade[0]}.json`, import.meta.url), 'utf8')),
  ).datasets
  const capability = reinforcementGames(datasets, '2026-10-05', grade[1]).find(
    ({ capability: c }) => c.status === 'ready' && c.pack.moduleId === gameId,
  )!.capability
  assert.equal(capability.status, 'ready')
  if (capability.status !== 'ready') throw new Error('Missing fixture game.')
  const checkpoint = startGameCheckpoint(
    { childId: 'child', grade: grade[1], week: '2026-10-05', gameId },
    capability.pack,
    'attempt-one',
    'writer-one',
    now,
  )
  return checkpoint
}
function answers(pack: LearningModulePack): LearningModuleAttempt[] {
  if ('pairs' in pack)
    return pack.pairs.map((pair) => ({
      gameId: pack.moduleId,
      promptId: pair.id,
      targetId: pair.targetId,
      correct: true,
      assessmentMode: 'automatic',
      response:
        pack.moduleId === 'memory-flip' ? [`${pair.id}:left`, `${pair.id}:right`] : [pair.left.id, pair.right.id],
    }))
  if (pack.moduleId === 'context-gap-dash')
    return pack.rounds.map((round) => ({
      gameId: pack.moduleId,
      promptId: round.id,
      targetId: round.targetId,
      correct: true,
      assessmentMode: 'automatic',
      response: round.correctChoiceId,
    }))
  if (pack.moduleId === 'sentence-scramble')
    return pack.rounds.map((round) => ({
      gameId: pack.moduleId,
      promptId: round.id,
      targetId: round.targetId,
      correct: true,
      assessmentMode: 'automatic',
      response: round.correctTokenIds,
    }))
  throw new Error('Unsupported fixture.')
}
const finish = (value: GameCheckpoint) =>
  answers(value.pack)
    .filter((answer) => !value.cleared.includes(answer.promptId))
    .reduce((checkpoint, answer) => checkpointGameAnswer(checkpoint, answer, later), value)
function memory() {
  const values = new Map<string, string>()
  const storage = {
    get length() {
      return values.size
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  }
  return { values, storage, store: createGameProgressStore(storage, 'family') }
}

function sessionOptions(store: ReturnType<typeof memory>['store']) {
  const checkpoint = fixture()
  let id = 0
  return {
    store,
    scope: checkpoint.scope,
    pack: checkpoint.pack,
    writerId: checkpoint.writerId,
    uuid: () => `new-attempt-${++id}`,
    now: () => now,
    delivered: () => false,
  }
}

test('game session resumes reviewed turns and pinned pack without retaining answers', async () => {
  const { store, values } = memory()
  const options = sessionOptions(store)
  const first = await openGameSession(options)
  const answer = answers(first.initial.pack)[0]
  await first.review(answer)
  const reopened = await openGameSession(options)
  assert.deepEqual(reopened.initial, first.checkpoint())
  assert.equal(reopened.initial.attemptId, first.initial.attemptId)
  assert.equal(reopened.initial.prompts[0].attempted, 1)
  for (const raw of values.values()) assert.ok(!raw.includes('"response"'))
})

test('game session holds a failed turn for exact retry and rejects a replacement answer', async () => {
  const { store, storage } = memory()
  const session = await openGameSession(sessionOptions(store))
  const original = storage.setItem
  storage.setItem = () => {
    throw new Error('quota')
  }
  const turns = answers(session.initial.pack)
  await assert.rejects(session.review(turns[0]), /quota/)
  assert.equal(session.checkpoint().revision, 0)
  await assert.rejects(session.review(turns[1]), /pending turn/)
  storage.setItem = original
  await session.review(turns[0])
  assert.equal(session.checkpoint().revision, 1)
  assert.equal(session.checkpoint().prompts[0].attempted, 1)
})

test('timed sessions restore the saved clock, retain counts across expiry and retry, and finish once', async () => {
  const { store, values } = memory()
  const checkpoint = fixture('speed-match')
  const options = { ...sessionOptions(store), scope: checkpoint.scope, pack: checkpoint.pack }
  let session = await openGameSession(options)
  const turns = answers(session.initial.pack)
  await session.review(turns[0])
  const reviewedAt = session.checkpoint().reviewedAt
  await session.timer(1000)
  assert.equal(session.checkpoint().reviewedAt, reviewedAt)
  session = await openGameSession(options)
  assert.equal(session.initial.remainingMs, 1000)
  await session.timer(0)
  await assert.rejects(session.review(turns[1]))
  await session.restartTimed()
  assert.equal(session.checkpoint().remainingMs, 60000)
  assert.equal(session.checkpoint().cycle, 1)
  assert.deepEqual(session.checkpoint().cleared, [])
  assert.equal(session.checkpoint().prompts[0].attempted, 1)
  for (const turn of turns) await session.review(turn)
  await assert.rejects(session.timer(0))
  await assert.rejects(session.restartTimed())
  assert.equal(store.completions('child').length, 1)
  assert.equal(store.completions('child')[0].result.attempted, turns.length + 1)
  assert.equal(store.completions('child')[0].targets[0].correct, 2)
  for (const raw of values.values()) assert.ok(!raw.includes('"response"'))
})

test('timer partial writes require exact retry before answers or restart', async () => {
  const { store, storage } = memory()
  const checkpoint = fixture('speed-match')
  const session = await openGameSession({ ...sessionOptions(store), scope: checkpoint.scope, pack: checkpoint.pack })
  const original = storage.setItem
  storage.setItem = (key, value) => {
    original(key, value)
    throw new Error('Interrupted readback')
  }
  await assert.rejects(session.timer(50000), /Interrupted/)
  await assert.rejects(session.timer(49000), /pending turn/)
  await assert.rejects(session.review(answers(checkpoint.pack)[0]), /pending turn/)
  await assert.rejects(session.restartTimed(), /pending turn/)
  storage.setItem = original
  await session.timer(50000)
  assert.equal(session.checkpoint().revision, 1)
  assert.equal(session.checkpoint().reviewedAt, null)
  await session.review(answers(checkpoint.pack)[0])
  assert.equal(session.checkpoint().revision, 2)
})

test('a timer write in flight excludes an answer and an expiry restart retries exactly once', async () => {
  const { store, storage } = memory()
  const checkpoint = fixture('speed-match')
  const session = await openGameSession({ ...sessionOptions(store), scope: checkpoint.scope, pack: checkpoint.pack })
  const ticking = session.timer(0)
  await assert.rejects(session.review(answers(checkpoint.pack)[0]), /not available/)
  await ticking
  const original = storage.setItem
  storage.setItem = () => {
    throw new Error('quota')
  }
  await assert.rejects(session.restartTimed(), /quota/)
  assert.equal(session.checkpoint().remainingMs, 0)
  storage.setItem = original
  await session.restartTimed()
  assert.equal(session.checkpoint().cycle, 1)
  assert.equal(session.checkpoint().revision, 2)
})

test('game session recovers completion written before interrupted final checkpoint', async () => {
  const { store, storage } = memory()
  const options = sessionOptions(store)
  const session = await openGameSession(options)
  const turns = answers(session.initial.pack)
  for (const turn of turns.slice(0, -1)) await session.review(turn)
  const original = storage.setItem
  storage.setItem = (key, value) => {
    if (key.includes(':checkpoint:')) throw new Error('quota')
    original(key, value)
  }
  await assert.rejects(session.review(turns.at(-1)!), /quota/)
  assert.equal(store.completions('child', true).length, 1)
  storage.setItem = original
  const recovered = await openGameSession(options)
  assert.ok(gameCheckpointComplete(recovered.initial))
  assert.deepEqual(recovered.initial, store.completions('child')[0].checkpoint)
})

test('game aggregate bridge retries exact totals and timestamps without duplicate graph points', async () => {
  const { store, storage } = memory()
  const session = await openGameSession(sessionOptions(store))
  for (const turn of answers(session.initial.pack)) await session.review(turn)
  const completion = store.completions('child')[0]
  const original = storage.setItem
  storage.setItem = (key, value) => {
    if (key.startsWith(RESULT_KEY)) throw new Error('quota')
    original(key, value)
  }
  assert.throws(() => saveGameAggregate(storage, completion), /quota/)
  assert.deepEqual(readResultLedger(storage, PENDING_KEY), [completion.result])
  storage.setItem = original
  saveGameAggregate(storage, completion)
  saveGameAggregate(storage, completion)
  assert.deepEqual(readResultLedger(storage, RESULT_KEY), [completion.result])
  assert.equal(store.completions('child', true).length, 1, 'aggregate delivery never acknowledges detailed outbox')
  storage.setItem(`${RESULT_KEY}:${completion.result.id}`, JSON.stringify({ ...completion.result, correct: 0 }))
  assert.throws(() => saveGameAggregate(storage, completion), /disagree/)
})

test('competing mounted games cannot overwrite each other or discard the newer turn', async () => {
  const { store } = memory()
  const options = sessionOptions(store)
  const first = await openGameSession(options)
  const second = await openGameSession(options)
  const turns = answers(first.initial.pack)
  await first.review(turns[0])
  await assert.rejects(second.review(turns[1]), /another tab/)
  await assert.rejects(second.discard(), /another tab/)
  assert.deepEqual(store.checkpoint(options.scope), first.checkpoint())
  await first.discard()
  assert.equal(store.checkpoint(options.scope), null)
  await assert.rejects(first.review(turns[1]), /not available/)
})

test('an interrupted discard retries the identical durable retirement before removing the checkpoint', async () => {
  const f = memory()
  let clock = 0
  const options = {
    ...sessionOptions(f.store),
    now: () => (clock++ === 0 ? now : later),
  }
  const session = await openGameSession(options)
  const originalRemove = f.storage.removeItem
  f.storage.removeItem = (key) => {
    if (!key.includes(':checkpoint:')) originalRemove(key)
  }
  await assert.rejects(session.discard(), /could not be confirmed/)
  const retirement = f.store.retirement(options.scope)
  assert.ok(retirement)
  assert.equal(retirement.retiredAt, later)
  assert.equal(f.store.checkpoint(options.scope), null, 'the interrupted checkpoint remains hidden')
  f.storage.removeItem = originalRemove
  await session.discard()
  assert.deepEqual(f.store.retirement(options.scope), retirement, 'retry does not invent a new retirement')
  assert.equal(f.store.checkpoint(options.scope), null)
})

test('completed rounds reopen until delivered, then use a distinct immutable attempt', async () => {
  const { store, storage } = memory()
  const options = sessionOptions(store)
  const first = await openGameSession(options)
  for (const turn of answers(first.initial.pack)) await first.review(turn)
  const completion = store.completions('child')[0]
  const recovery = await openGameSession(options)
  assert.equal(recovery.initial.attemptId, completion.result.id)
  saveGameAggregate(storage, completion)
  const next = await openGameSession({ ...options, delivered: () => true })
  assert.notEqual(next.initial.attemptId, completion.result.id)
  assert.equal(next.initial.revision, 0)
  assert.deepEqual(store.completions('child')[0], completion)
})

function testWriteLock(): GameWriteLock {
  let tail: Promise<unknown> = Promise.resolve()
  return (_name, operation) => {
    const next = tail.then(operation)
    tail = next.catch(() => {})
    return next
  }
}

test('browser write adapter serializes simultaneous tabs and rechecks ownership inside its lock', async () => {
  const f = memory()
  const initial = fixture()
  f.store.saveCheckpoint(initial, null)
  const lock = testWriteLock()
  const one = createLockedGameProgressStore(f.storage, 'family', () => true, lock)
  const two = createLockedGameProgressStore(f.storage, 'family', () => true, lock)
  const first = checkpointGameAnswer(initial, answers(initial.pack)[0], later)
  const second = checkpointGameAnswer(initial, answers(initial.pack)[1], later)
  const results = await Promise.allSettled([one.saveCheckpoint(first, initial), two.saveCheckpoint(second, initial)])
  assert.deepEqual(
    results.map((result) => result.status),
    ['fulfilled', 'rejected'],
  )
  assert.deepEqual(f.store.checkpoint(initial.scope), first)
  let owner = true
  const owned = createLockedGameProgressStore(f.storage, 'family', () => owner, lock)
  const write = owned.saveCheckpoint(second, first)
  owner = false
  await assert.rejects(Promise.resolve(write), /owner changed/)
  assert.deepEqual(f.store.checkpoint(initial.scope), first)
})

test('a game opened while hydration waits for the write lock cannot be replaced', async () => {
  const f = memory()
  const initial = fixture()
  f.store.saveCheckpoint(initial, null)
  const reviewed = checkpointGameAnswer(initial, answers(initial.pack)[0], later)
  let replace = true
  const store = createLockedGameProgressStore(f.storage, 'family', () => true, testWriteLock())
  const write = store.saveCheckpoint(reviewed, initial, () => replace)
  replace = false
  await assert.rejects(Promise.resolve(write), /no longer allowed/)
  assert.deepEqual(f.store.checkpoint(initial.scope), initial)
})

for (const grade of grades)
  for (const game of games)
    test(`${grade[1]} ${game}: reload retains pinned reviewed progress and private per-target completion`, () => {
      const value = fixture(game, grade)
      const f = memory()
      f.store.saveCheckpoint(value, null)
      const first = checkpointGameAnswer(value, answers(value.pack)[0], later)
      f.store.saveCheckpoint(first, value)
      const reloaded = createGameProgressStore(f.storage, 'family').checkpoint(value.scope)!
      assert.deepEqual(reloaded, first)
      assert.deepEqual(reloaded.pack, value.pack)
      const done = finish(reloaded)
      assert.equal(gameCheckpointComplete(done), true)
      assert.throws(() => f.store.saveCheckpoint(done, reloaded), /immutable completion/)
      const completion = f.store.finishCheckpoint(done, reloaded)
      assert.deepEqual(validateGameCompletion(completion), completion)
      assert.deepEqual(f.store.completions('child', true), [completion])
      assert.equal(completion.result.id, done.attemptId)
      assert.equal(completion.result.correct, done.prompts.length)
      assert.equal(completion.targets.length, done.prompts.length)
      for (const raw of f.values.values()) {
        assert.equal(/"(response|recording|selectedIds|blob|drawing)"/.test(raw), false)
        assert.ok(new TextEncoder().encode(raw).length <= 200_000)
      }
      f.store.finishCheckpoint(done, done)
      assert.equal(f.store.completions('child').length, 1)
      f.store.acknowledgeCompletion(completion)
      assert.equal(f.store.completions('child', true).length, 0)
      assert.deepEqual(f.store.completions('child'), [completion])
    })

test('rejects dishonest scores, duplicate reviews, skipped prompts and unsupported game schemas', () => {
  const value = fixture()
  const answer = answers(value.pack)[0]
  assert.throws(() => checkpointGameAnswer(value, { ...answer, correct: false }, later), /verified/)
  const first = checkpointGameAnswer(value, answer, later)
  assert.throws(() => checkpointGameAnswer(first, answer, later), /no longer available/)
  const context = fixture('context-gap-dash')
  assert.throws(() => checkpointGameAnswer(context, answers(context.pack)[1], later), /current game prompt/)
  assert.throws(() => completeGameCheckpoint(first, later), /Finish/)
  assert.throws(() => validateGameCheckpoint({ ...first, schema: 'future' } as unknown as GameCheckpoint), /identity/)
  assert.throws(() => validateGameCheckpoint({ ...first, response: 'secret' } as GameCheckpoint), /Unsupported/)
  const nested = structuredClone(value)
  Object.assign(nested.pack.cohort.terms[0], { meaning: { response: 'secret' } })
  assert.throws(() => validateGameCheckpoint(nested), /text/)
  const missingSource = structuredClone(value)
  Reflect.deleteProperty(missingSource.pack.cohort.provenance[0].source, 'sourceDocumentId')
  assert.throws(() => validateGameCheckpoint(missingSource), /text/)
  assert.throws(
    () => validateGameCheckpoint({ ...first, prompts: first.prompts.map((p) => ({ ...p, attempted: 100001 })) }),
    /pinned prompts/,
  )
})

test('wrong Context answers remain reviewed, advance once and are not retained as responses', () => {
  const value = fixture('context-gap-dash')
  assert.equal(value.pack.moduleId, 'context-gap-dash')
  if (value.pack.moduleId !== 'context-gap-dash') return
  const round = value.pack.rounds[0]
  const wrong = checkpointGameAnswer(
    value,
    {
      ...answers(value.pack)[0],
      correct: false,
      response: round.choices.find((choice) => choice.id !== round.correctChoiceId)!.id,
    },
    later,
  )
  assert.deepEqual(wrong.cleared, [round.id])
  assert.equal(wrong.prompts[0].correct, 0)
  const completion = completeGameCheckpoint(finish(wrong), later)
  assert.equal(completion.result.correct, completion.result.attempted - 1)
})

test('Shuriken timers cannot increase through pause/reload; retry keeps errors and resets only the board', () => {
  const value = fixture('speed-match')
  const first = checkpointGameAnswer(value, answers(value.pack)[0], later, 50_000)
  assert.throws(() => checkpointGameTimer(first, 55_000), /timer transition/)
  const expired = checkpointGameTimer(first, 0)
  assert.equal(expired.reviewedAt, first.reviewedAt)
  const retry = retryTimedGame(expired)
  assert.deepEqual(retry.prompts, first.prompts)
  assert.deepEqual(retry.cleared, [])
  assert.equal(retry.remainingMs, 60_000)
  assert.equal(retry.cycle, 1)
  assert.throws(() => retryTimedGame(first), /expired/)
  assert.equal(reconcileGameCheckpoints(first, expired, later), expired)
  assert.equal(reconcileGameCheckpoints(expired, first, later), expired)
})

test('record size and structural bounds fail before changing stored data', () => {
  const f = memory()
  const value = fixture()
  f.store.saveCheckpoint(value, null)
  const before = [...f.values]
  const huge = structuredClone(value)
  Object.assign(huge.pack, { scopeNote: 'x'.repeat(200_001) })
  assert.throws(() => f.store.saveCheckpoint(huge, value), /safe storage limit/)
  assert.deepEqual([...f.values], before)
  const forged = structuredClone(value)
  forged.prompts[0].correct = 1
  forged.prompts[0].attempted = 1
  forged.reviewedAt = later
  forged.revision = 1
  assert.throws(() => validateGameCheckpoint(forged), /cleared prompts/)
  assert.deepEqual([...f.values], before)
})

test('checkpoint-count limits preserve existing records instead of pruning older work', () => {
  const f = memory()
  const original = fixture()
  for (let day = 0; day < 64; day++) {
    const date = new Date('2026-10-05T00:00:00Z')
    date.setUTCDate(date.getUTCDate() + day)
    const value = { ...original, scope: { ...original.scope, week: date.toISOString().slice(0, 10) } }
    f.store.saveCheckpoint(value, null)
  }
  const before = [...f.values]
  assert.throws(
    () => f.store.saveCheckpoint({ ...original, scope: { ...original.scope, week: '2027-01-01' } }, null),
    /Too many/,
  )
  assert.deepEqual([...f.values], before)
  assert.equal(f.store.checkpoints('child').length, 64)
})

test('new writers fork completion identities; whole newest-reviewed checkpoints win without merging', () => {
  const value = fixture()
  const first = checkpointGameAnswer(value, answers(value.pack)[0], now)
  const secondWriter = continueGameCheckpoint(first, 'writer-two', 'attempt-two')
  assert.equal(secondWriter.runId, first.runId)
  assert.equal(continueGameCheckpoint(first, first.writerId, 'unused'), first)
  assert.throws(() => continueGameCheckpoint(first, 'writer-two', first.attemptId), /fresh/)
  assert.throws(() => continueGameCheckpoint(finish(first), 'writer-two', 'attempt-two'), /completed game/)
  const remote = checkpointGameAnswer(secondWriter, answers(value.pack)[1], later)
  assert.equal(reconcileGameCheckpoints(first, remote, later), remote)
  const f = memory()
  f.store.saveCompletion(completeGameCheckpoint(finish(first), later))
  f.store.saveCompletion(completeGameCheckpoint(finish(remote), later))
  assert.equal(f.store.completions('child').length, 2)
  const future = { ...remote, reviewedAt: '2099-01-01T00:00:00.000Z' }
  assert.equal(reconcileGameCheckpoints(first, future, later), first)
  const unopened = continueGameCheckpoint(value, 'other-writer', 'other-attempt')
  assert.deepEqual(reconcileGameCheckpoints(value, unopened, later), reconcileGameCheckpoints(unopened, value, later))
  assert.throws(
    () => reconcileGameCheckpoints(future, { ...first, reviewedAt: future.reviewedAt }, later),
    /no trusted/,
  )
})

test('storage CAS, silent write failure and malformed records preserve previous data', () => {
  const f = memory()
  const value = fixture()
  f.store.saveCheckpoint(value, null)
  const next = checkpointGameAnswer(value, answers(value.pack)[0], later)
  f.store.saveCheckpoint(next, value)
  assert.throws(() => f.store.saveCheckpoint(value, value), /another tab/)
  const key = [...f.values.keys()][0]
  const corrupt = JSON.stringify({ ...next, schema: 'future' })
  f.values.set(key, corrupt)
  assert.throws(() => f.store.checkpoint(value.scope), /identity/)
  assert.equal(f.values.get(key), corrupt)
  const broken = createGameProgressStore({ ...f.storage, setItem: () => {} }, 'other-family')
  assert.throws(() => broken.saveCheckpoint(value, null), /could not be confirmed/)
  assert.equal(createGameProgressStore(f.storage, 'different-family').checkpoints('child').length, 0)
})

test('a completion interrupted between outbox/history writes remains recoverable and immutable', () => {
  const f = memory()
  const completion = completeGameCheckpoint(finish(fixture()), later)
  const broken = createGameProgressStore(
    {
      ...f.storage,
      get length() {
        return f.storage.length
      },
      setItem: (key, raw) => {
        if (key.includes(':completed:')) throw new Error('quota')
        f.storage.setItem(key, raw)
      },
    },
    'family',
  )
  assert.throws(() => broken.saveCompletion(completion), /quota/)
  assert.deepEqual(f.store.completions('child'), [completion])
  assert.throws(() => f.store.saveCompletion(completeGameCheckpoint(completion.checkpoint, now)), /identity conflict/)
  f.store.acknowledgeCompletion(completion)
  assert.deepEqual(f.store.completions('child'), [completion])
  assert.equal(f.store.completions('child', true).length, 0)
  for (const [key, raw] of f.values)
    assert.equal(ownedPracticeRecord(key, raw, 'child'), false, 'older practice sync ignores the new namespace')
})

function remoteFixture(initial: GameCheckpoint | null = null) {
  let checkpoint = initial
  let version = initial ? 1 : 0
  const completions = new Map<string, GameCompletion>()
  const retirements = new Map<string, GameRetirement>()
  const remote: GameProgressRemote = {
    saveCompletion: async (value) => {
      const old = completions.get(value.result.id)
      if (old && serializeGameRecord(old) !== serializeGameRecord(value)) throw new Error('immutable')
      completions.set(value.result.id, structuredClone(value))
      return structuredClone(value)
    },
    readCompletion: async (_, id) => completions.get(id) || null,
    readCheckpoint: async () =>
      checkpoint ? { value: structuredClone(checkpoint), version: String(version), serverTime: later } : null,
    saveRetirement: async (value) => {
      const old = retirements.get(value.runId)
      if (old && serializeGameRecord(old) !== serializeGameRecord(value)) throw new Error('immutable retirement')
      retirements.set(value.runId, structuredClone(value))
      return structuredClone(value)
    },
    readRetirement: async (_, runId) => structuredClone(retirements.get(runId) || null),
    writeCheckpoint: async (value, expectedVersion) => {
      assert.equal(expectedVersion, version ? String(version) : null)
      if (retirements.has(value.runId)) throw new Error('retired')
      checkpoint = structuredClone(value)
      version++
      return { value: structuredClone(value), version: String(version) }
    },
  }
  return { remote, completions, retirements, current: () => checkpoint }
}

test('cross-device retirement prevents a discarded run from returning after a newer run starts', async () => {
  const discardedDevice = memory()
  const initial = fixture()
  discardedDevice.store.saveCheckpoint(initial, null)
  const retirement = retireGameCheckpoint(initial, later)
  discardedDevice.store.discardCheckpoint(initial, retirement)
  const cloud = remoteFixture(initial)
  const options = {
    store: discardedDevice.store,
    remote: cloud.remote,
    childId: 'child',
    scopes: [initial.scope],
    stillOwner: () => true,
    canReplaceCheckpoint: () => true,
  }
  await syncGameProgress(options)
  assert.deepEqual(cloud.retirements.get(initial.runId), retirement)
  assert.equal(discardedDevice.store.retirement(initial.scope), null)

  const staleDevice = memory()
  staleDevice.store.saveCheckpoint(initial, null)
  await syncGameProgress({ ...options, store: staleDevice.store })
  assert.equal(staleDevice.store.checkpoint(initial.scope), null)

  const freshDevice = memory()
  await syncGameProgress({ ...options, store: freshDevice.store })
  assert.equal(freshDevice.store.checkpoint(initial.scope), null)

  const next = continueGameCheckpoint(initial, 'writer-two', 'run-two')
  next.runId = 'run-two'
  next.attemptId = 'attempt-two'
  freshDevice.store.saveCheckpoint(next, null)
  await syncGameProgress({ ...options, store: freshDevice.store })
  assert.deepEqual(cloud.current(), next)

  const oldAgain = memory()
  oldAgain.store.saveCheckpoint(initial, null)
  await syncGameProgress({ ...options, store: oldAgain.store })
  assert.equal(oldAgain.store.checkpoint(initial.scope), null)
  assert.deepEqual(cloud.current(), next, 'the old discarded run cannot replace the newer cloud run')
})

test('discarding a run completed elsewhere preserves its immutable completion', async () => {
  const local = memory()
  const initial = fixture()
  local.store.saveCheckpoint(initial, null)
  const retirement = retireGameCheckpoint(initial, later)
  local.store.discardCheckpoint(initial, retirement)
  const done = finish(initial)
  const completion = completeGameCheckpoint(done, later)
  const cloud = remoteFixture(done)
  cloud.completions.set(completion.result.id, completion)
  await syncGameProgress({
    store: local.store,
    remote: cloud.remote,
    childId: 'child',
    scopes: [initial.scope],
    stillOwner: () => true,
    canReplaceCheckpoint: () => true,
  })
  assert.deepEqual(local.store.completions('child'), [completion])
  assert.deepEqual(cloud.retirements.get(initial.runId), retirement)
  assert.equal(local.store.checkpoint(initial.scope), null)
})

test('bounded cloud history discovers a saved game and caches acknowledged detail before reconciliation', async () => {
  const fresh = memory()
  const done = finish(fixture())
  const completion = completeGameCheckpoint(done, later)
  const cloud = remoteFixture(done)
  cloud.completions.set(completion.result.id, completion)
  const remote: GameHistoryRemote = {
    ...cloud.remote,
    listCheckpointPage: async (_childId, cursor = '') => {
      assert.equal(cursor, '')
      return { checkpoints: [done], nextPageToken: '' }
    },
    listCompletionPage: async (_childId, cursor = '') => {
      assert.equal(cursor, '')
      return { completions: [completion], nextPageToken: '' }
    },
  }
  const result = await reconcileGameHistory({
    store: fresh.store,
    remote,
    childId: 'child',
    stillOwner: () => true,
    canReplaceCheckpoint: () => true,
  })
  assert.equal(result.source, 'cloud')
  assert.deepEqual(fresh.store.checkpoint(done.scope), done)
  assert.deepEqual(fresh.store.completions('child'), [completion])
  assert.equal(fresh.store.completions('child', true).length, 0)
})

test('failed or repeated cloud history pages leave the existing device cache unchanged', async () => {
  const local = memory()
  const initial = fixture()
  local.store.saveCheckpoint(initial, null)
  const cloud = remoteFixture()
  const offline: GameHistoryRemote = {
    ...cloud.remote,
    listCheckpointPage: async () => {
      throw new Error('offline')
    },
    listCompletionPage: async () => {
      throw new Error('offline')
    },
  }
  await assert.rejects(
    reconcileGameHistory({
      store: local.store,
      remote: offline,
      childId: 'child',
      stillOwner: () => true,
      canReplaceCheckpoint: () => true,
    }),
    /offline/,
  )
  assert.deepEqual(local.store.checkpoint(initial.scope), initial)

  const staged = memory()
  const completion = completeGameCheckpoint(finish(initial), later)
  const repeated: GameHistoryRemote = {
    ...cloud.remote,
    listCheckpointPage: async () => ({ checkpoints: [], nextPageToken: '' }),
    listCompletionPage: async (_childId, cursor = '') =>
      cursor
        ? { completions: [completion], nextPageToken: '' }
        : { completions: [completion], nextPageToken: 'next' },
  }
  await assert.rejects(
    reconcileGameHistory({
      store: staged.store,
      remote: repeated,
      childId: 'child',
      stillOwner: () => true,
      canReplaceCheckpoint: () => true,
    }),
    /duplicate/,
  )
  assert.deepEqual(staged.store.completions('child'), [])
})

test('sync confirms completed results before a checkpoint failure and recovers a fresh device', async () => {
  const f = memory()
  const initial = fixture()
  const done = finish(initial)
  const completion = f.store.finishCheckpoint(done, null)
  const cloud = remoteFixture()
  const options = {
    store: f.store,
    remote: cloud.remote,
    childId: 'child',
    scopes: [initial.scope],
    stillOwner: () => true,
    canReplaceCheckpoint: () => true,
  }
  await syncGameProgress(options)
  assert.equal(f.store.completions('child', true).length, 0)
  assert.deepEqual(cloud.completions.get(completion.result.id), completion)
  const fresh = memory()
  await syncGameProgress({ ...options, store: fresh.store })
  assert.deepEqual(fresh.store.checkpoint(initial.scope), done)
  assert.deepEqual(fresh.store.completions('child'), [completion])
  const conflicting = memory()
  conflicting.store.saveCheckpoint(initial, null)
  conflicting.store.saveCompletion(completion)
  const noReview = remoteFixture(continueGameCheckpoint(initial, 'remote', 'another'))
  await assert.rejects(
    syncGameProgress({
      ...options,
      store: conflicting.store,
      remote: {
        ...noReview.remote,
        readCheckpoint: async () => {
          throw new Error('checkpoint failed')
        },
      },
    }),
    /checkpoint failed/,
  )
  assert.equal(conflicting.store.completions('child', true).length, 0)
  assert.deepEqual(noReview.completions.get(completion.result.id), completion)
})

test('sync does not replace an open game or an answer written while waiting for the network', async () => {
  const f = memory()
  const initial = fixture()
  f.store.saveCheckpoint(initial, null)
  const reviewed = checkpointGameAnswer(initial, answers(initial.pack)[0], later)
  const cloud = remoteFixture(reviewed)
  const options = {
    store: f.store,
    remote: cloud.remote,
    childId: 'child',
    scopes: [initial.scope],
    stillOwner: () => true,
    canReplaceCheckpoint: () => false,
  }
  await syncGameProgress(options)
  assert.deepEqual(f.store.checkpoint(initial.scope), initial)
  const duringWait = checkpointGameAnswer(initial, answers(initial.pack)[1], later)
  await syncGameProgress({
    ...options,
    canReplaceCheckpoint: () => true,
    remote: {
      ...cloud.remote,
      readCheckpoint: async (scope) => {
        f.store.saveCheckpoint(duringWait, initial)
        return cloud.remote.readCheckpoint(scope)
      },
    },
  })
  assert.deepEqual(f.store.checkpoint(initial.scope), duringWait)
})

test('offline failures and owner changes keep immutable completion retry records', async () => {
  const f = memory()
  const done = finish(fixture())
  const completion = f.store.finishCheckpoint(done, null)
  const cloud = remoteFixture()
  const options = {
    store: f.store,
    remote: cloud.remote,
    childId: 'child',
    scopes: [done.scope],
    stillOwner: () => true,
    canReplaceCheckpoint: () => true,
  }
  await assert.rejects(
    syncGameProgress({
      ...options,
      remote: {
        ...cloud.remote,
        saveCompletion: async () => {
          throw new Error('offline')
        },
      },
    }),
    /offline/,
  )
  let owner = true
  await syncGameProgress({
    ...options,
    stillOwner: () => owner,
    remote: {
      ...cloud.remote,
      saveCompletion: async (value) => {
        owner = false
        return value
      },
    },
  })
  assert.deepEqual(f.store.completions('child', true), [completion])
  await assert.rejects(
    syncGameProgress({
      ...options,
      remote: { ...cloud.remote, saveCompletion: async () => completeGameCheckpoint(done, now) },
    }),
    /differs/,
  )
  assert.deepEqual(f.store.completions('child', true), [completion])
})
