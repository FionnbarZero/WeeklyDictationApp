import assert from 'node:assert/strict'
import test from 'node:test'
import {
  answerNativeWarmup,
  nativeVisitWords,
  newNativeWarmupVisit,
  readNativeWarmupVisit,
  writeNativeWarmup,
} from '../src/warmupDesign/nativeVisit.ts'
import { advanceWarmupDesign, newWarmupDesign, reopenWarmupDesign } from '../src/warmupDesign/model.ts'
import type { Word } from '../src/domain.ts'
const pool = [
  { id: 'a', text: '英雄', datasetId: 'lesson' },
  { id: 'b', text: '走', datasetId: 'lesson' },
] as Word[]

test('native selection order and first failures survive correction and reopening without ink', () => {
  const visit = newNativeWarmupVisit([pool[1], pool[0], pool[1]], 'visit')
  let trial = advanceWarmupDesign(newWarmupDesign(), { type: 'compare' }, [1])
  trial = advanceWarmupDesign(trial, { type: 'answer', correct: false }, [1])
  trial = reopenWarmupDesign(trial)
  trial = advanceWarmupDesign(trial, { type: 'character-complete' }, [1])
  trial = advanceWarmupDesign(trial, { type: 'compare' }, [1])
  trial = advanceWarmupDesign(trial, { type: 'answer', correct: true }, [1])
  const saved = answerNativeWarmup(visit, 0, trial.firstAnswers[0])
  const reopened = readNativeWarmupVisit(JSON.stringify(saved), pool)!
  assert.deepEqual(reopened.answers, [false])
  assert.deepEqual(
    nativeVisitWords(reopened, pool).map((w) => w.text),
    ['走', '英雄', '走'],
  )
  assert.equal(JSON.stringify(reopened).includes('strokes'), false)
  assert.throws(() => answerNativeWarmup(reopened, 0, true), /moved ahead/)
})

test('corrupt, removed, changed and completed warmup visits cannot silently overwrite progress', () => {
  const visit = newNativeWarmupVisit(pool, 'v')
  assert.throws(() => readNativeWarmupVisit('{', pool))
  assert.throws(() => readNativeWarmupVisit(JSON.stringify(visit), [pool[0]]), /verified/)
  assert.throws(() => readNativeWarmupVisit(JSON.stringify(visit), [{ ...pool[0], text: '不同' }, pool[1]]), /verified/)
  assert.throws(() => readNativeWarmupVisit(JSON.stringify({ ...visit, answers: [true, false, true] }), pool))
  assert.throws(() => answerNativeWarmup({ ...visit, closed: true }, 0, true))
})

test('stale tabs and failed writes preserve the original native checkpoint', () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
  } as unknown as Storage
  const first = writeNativeWarmup(storage, 'v', null, newNativeWarmupVisit(pool, 'v'))
  assert.throws(() => writeNativeWarmup(storage, 'v', null, {}), /another tab/)
  assert.equal(values.get('v'), first)
  const broken = {
    ...storage,
    setItem: () => {
      throw new Error('quota')
    },
  } as Storage
  assert.throws(() => writeNativeWarmup(broken, 'v', first, {}), /quota/)
  assert.equal(values.get('v'), first)
})

test('a lost confirmation read retries the exact committed transition without resetting it', () => {
  let value: string | null = null
  let fail = true
  const storage = {
    getItem: () => {
      if (value && fail) {
        fail = false
        throw new Error('lost readback')
      }
      return value
    },
    setItem: (_key: string, next: string) => {
      value = next
    },
  } as unknown as Storage
  const next = newNativeWarmupVisit(pool, 'visit')
  assert.throws(() => writeNativeWarmup(storage, 'visit', null, next), /lost readback/)
  assert.equal(writeNativeWarmup(storage, 'visit', null, next), JSON.stringify(next))
  assert.throws(() => writeNativeWarmup(storage, 'visit', null, { ...next, id: 'other' }), /another tab/)
})
