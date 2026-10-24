import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { inspectSnapshot } from '../src/familyBeta/curriculum.ts'
import { reinforcementGames } from '../src/familyBeta/gamePools.ts'
import { acquireGameView, discardUnopenedGame } from '../src/familyBeta/gameRecovery.ts'
import { createGameProgressStore, type GameStorage } from '../src/ninjaSkills/progressStore.ts'
import { checkpointGameAnswer, startGameCheckpoint } from '../src/ninjaSkills/progress.ts'

const now = '2026-10-23T20:00:00.000Z'
function setup() {
  const records = new Map<string, string>()
  const storage: GameStorage = {
    get length() {
      return records.size
    },
    key: (index) => [...records.keys()][index] || null,
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => {
      records.set(key, value)
    },
    removeItem: (key) => {
      records.delete(key)
    },
  }
  const data = JSON.parse(
    readFileSync(new URL('./fixtures/dojo-launch-2026-10-16/grade5.json', import.meta.url), 'utf8'),
  )
  const datasets = inspectSnapshot(data).datasets
  const capability = reinforcementGames(datasets, '2026-10-19', 'Grade 5').find(
    (game) =>
      game.capability.moduleId === 'memory-flip' ||
      (game.capability.status === 'ready' && game.capability.pack.moduleId === 'memory-flip'),
  )!.capability
  if (capability.status !== 'ready' || capability.pack.moduleId !== 'memory-flip') throw new Error('Invalid fixture')
  const scope = { childId: 'synthetic', grade: 'Grade 5' as const, week: '2026-10-19', gameId: 'memory-flip' as const }
  const checkpoint = startGameCheckpoint(scope, capability.pack, 'run-one', 'writer', now)
  const store = createGameProgressStore(storage, 'test-family')
  store.saveCheckpoint(checkpoint, null)
  return { records, storage, scope, checkpoint, store, pair: capability.pack.pairs[0] }
}

test('unopened discard is exact, leaves unrelated records intact and can retry a partial retirement', async () => {
  const f = setup()
  f.records.set('unrelated-score', 'unchanged')
  let releaseCount = 0
  const options = {
    storage: f.storage,
    familyId: 'test-family',
    scope: f.scope,
    expected: f.checkpoint,
    stillOwner: () => true,
    now: () => now,
    acquire: async () => () => {
      releaseCount++
    },
    write: async <T>(_name: string, operation: () => T | Promise<T>) => operation(),
  }
  const remove = f.storage.removeItem
  f.storage.removeItem = () => {}
  await assert.rejects(discardUnopenedGame(options), /could not be confirmed/)
  const retired = [...f.records].find(([key]) => key.includes(':retirement:'))!
  f.storage.removeItem = remove
  await discardUnopenedGame({ ...options, now: () => '2026-10-24T20:00:00.000Z' })
  assert.equal(f.store.checkpoint(f.scope), null)
  assert.equal(f.records.get(retired[0]), retired[1])
  assert.equal(f.records.get('unrelated-score'), 'unchanged')
  assert.equal(releaseCount, 2)
})

test('unopened discard refuses a newer turn, a newer run, an owner change and a live competing view', async () => {
  for (const race of ['turn', 'run', 'owner', 'view'] as const) {
    const f = setup()
    const options = {
      storage: f.storage,
      familyId: 'test-family',
      scope: f.scope,
      expected: f.checkpoint,
      stillOwner: () => race !== 'owner',
      now: () => now,
      acquire: async () => {
        if (race === 'view') throw new Error('live view')
        return () => {}
      },
      write: async <T>(_name: string, operation: () => T | Promise<T>) => operation(),
    }
    if (race === 'turn')
      f.store.saveCheckpoint(
        checkpointGameAnswer(
          f.checkpoint,
          {
            gameId: 'memory-flip',
            promptId: f.pair.id,
            targetId: f.pair.targetId,
            correct: true,
            response: [`${f.pair.id}:left`, `${f.pair.id}:right`],
            assessmentMode: 'automatic',
          },
          now,
        ),
        f.checkpoint,
      )
    if (race === 'run')
      f.store.saveCheckpoint(startGameCheckpoint(f.scope, f.checkpoint.pack, 'new-run', 'writer', now), f.checkpoint)
    const before = [...f.records]
    await assert.rejects(discardUnopenedGame(options))
    assert.deepEqual([...f.records], before)
  }
})

test('a frame without an original checkpoint cannot discard a subsequently created run', async () => {
  const f = setup()
  const before = [...f.records]
  await assert.rejects(
    discardUnopenedGame({
      storage: f.storage,
      familyId: 'test-family',
      scope: f.scope,
      expected: null,
      stillOwner: () => true,
      now: () => now,
      acquire: async () => () => {},
      write: async (_name, operation) => operation(),
    }),
    /Saved work changed/,
  )
  assert.deepEqual([...f.records], before)
})

test('view ownership fails closed when locks are unavailable or already held', async () => {
  const f = setup()
  await assert.rejects(acquireGameView('test', f.scope, null), /cannot safely coordinate/)
  const locks = {
    request: async (_name: string, _options: unknown, callback: (lock: null) => Promise<void>) => callback(null),
  } as Pick<LockManager, 'request'>
  await assert.rejects(acquireGameView('test', f.scope, locks), /open in another window/)
})
