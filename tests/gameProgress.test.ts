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
  retryTimedGame,
  serializeGameRecord,
  startGameCheckpoint,
  validateGameCheckpoint,
  validateGameCompletion,
  type GameCheckpoint,
  type GameCompletion,
} from '../src/ninjaSkills/progress.ts'
import {
  createGameProgressStore,
  createLockedGameProgressStore,
  type GameWriteLock,
} from '../src/ninjaSkills/progressStore.ts'
import { syncGameProgress, type GameProgressRemote } from '../src/ninjaSkills/progressSync.ts'

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
    writeCheckpoint: async (value, expectedVersion) => {
      assert.equal(expectedVersion, version ? String(version) : null)
      checkpoint = structuredClone(value)
      version++
      return { value: structuredClone(value), version: String(version) }
    },
  }
  return { remote, completions, current: () => checkpoint }
}

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
