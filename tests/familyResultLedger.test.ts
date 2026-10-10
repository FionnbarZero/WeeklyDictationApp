import assert from 'node:assert/strict'
import test from 'node:test'
import { createResultRepository } from '../src/familyBeta/cloud.ts'
import { makeResult } from '../src/familyBeta/model.ts'
import { isConnectionFailure, isFamilyAccessDenied } from '../src/familyBeta/offlineFamily.ts'
import {
  acknowledgeCompletedResult,
  PENDING_KEY,
  RESULT_KEY,
  readResultLedger,
} from '../src/familyBeta/resultLedger.ts'
import { syncCompletedBeforePractice } from '../src/familyBeta/syncProgress.ts'

const MAX_RESULT_LEDGER_RESULTS = 500

function memory() {
  const records = new Map<string, string>()
  return {
    records,
    get length() {
      return records.size
    },
    key: (i: number) => [...records.keys()][i] ?? null,
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, raw: string) => {
      records.set(key, raw)
    },
    removeItem: (key: string) => {
      records.delete(key)
    },
  }
}
const result = makeResult(
  { id: 'child', nickname: 'Synthetic', grade: 'Grade 5', active: true },
  {
    id: 'first',
    activity: 'Writing',
    channel: 'writing',
    datasetIds: ['week'],
    correct: 1,
    attempted: 2,
  },
  new Date('2026-10-07T18:00:00.000Z'),
)

test('an oversized legacy result ledger fails closed without changing either copy', () => {
  const storage = memory()
  const oversized = Array.from({ length: MAX_RESULT_LEDGER_RESULTS + 1 }, (_, index) => ({
    ...result,
    id: `result-${index}`,
  }))
  storage.setItem(RESULT_KEY, JSON.stringify(oversized))
  const before = [...storage.records]
  assert.throws(() => readResultLedger(storage, RESULT_KEY), /Invalid scores/)
  assert.deepEqual([...storage.records], before)
})

test('an oversized keyed result ledger fails closed without changing either copy', () => {
  const storage = memory()
  for (let index = 0; index <= MAX_RESULT_LEDGER_RESULTS; index++)
    storage.setItem(`${RESULT_KEY}:result-${index}`, JSON.stringify({ ...result, id: `result-${index}` }))
  const before = [...storage.records]
  assert.throws(() => readResultLedger(storage, RESULT_KEY), /Invalid scores/)
  assert.deepEqual([...storage.records], before)
})

for (const key of [RESULT_KEY, PENDING_KEY]) {
  test(`${key}: conflicting keyed and legacy copies cannot hide each other`, () => {
    const storage = memory()
    storage.setItem(key, JSON.stringify([result]))
    storage.setItem(`${key}:${result.id}`, JSON.stringify({ ...result, correct: 2 }))
    const before = [...storage.records]
    assert.throws(() => readResultLedger(storage, key), /disagree/)
    assert.deepEqual([...storage.records], before)
  })
  test(`${key}: conflicting legacy duplicates are preserved, identical retries deduplicate`, () => {
    const storage = memory()
    storage.setItem(key, JSON.stringify([result, { ...result, correct: 2 }]))
    assert.throws(() => readResultLedger(storage, key), /disagree/)
    storage.setItem(key, JSON.stringify([result, result]))
    storage.setItem(`${key}:${result.id}`, JSON.stringify(result))
    assert.deepEqual(readResultLedger(storage, key), [result])
  })
}

test('acknowledgement repairs an interrupted ledger write before removing the confirmed outbox fact', () => {
  const storage = memory()
  const other = { ...result, id: 'second' }
  storage.setItem(PENDING_KEY, JSON.stringify([result, other]))
  storage.setItem(`${PENDING_KEY}:${result.id}`, JSON.stringify(result))
  acknowledgeCompletedResult(storage, result)
  assert.deepEqual(readResultLedger(storage, RESULT_KEY), [result])
  assert.deepEqual(readResultLedger(storage, PENDING_KEY), [other])
  acknowledgeCompletedResult(storage, result)
  assert.deepEqual(readResultLedger(storage, PENDING_KEY), [other])
})

for (const key of [PENDING_KEY, RESULT_KEY]) {
  test(`changed ${key} during cloud readback is not acknowledged or overwritten`, () => {
    const storage = memory()
    storage.setItem(`${PENDING_KEY}:${result.id}`, JSON.stringify(result))
    storage.setItem(`${key}:${result.id}`, JSON.stringify({ ...result, correct: 2 }))
    const before = [...storage.records]
    assert.throws(() => acknowledgeCompletedResult(storage, result), /disagree/)
    assert.deepEqual([...storage.records], before)
  })
}

for (const mode of ['throws', 'ignored'] as const) {
  test(`${mode} result-ledger write leaves the outbox retry intact`, () => {
    const storage = memory()
    storage.setItem(`${PENDING_KEY}:${result.id}`, JSON.stringify(result))
    const write = storage.setItem
    storage.setItem = (key, raw) => {
      if (key === `${RESULT_KEY}:${result.id}`) {
        if (mode === 'throws') throw new Error('quota')
        return
      }
      write(key, raw)
    }
    assert.throws(() => acknowledgeCompletedResult(storage, result))
    assert.deepEqual(readResultLedger(storage, PENDING_KEY), [result])
  })
}

test('legacy acknowledgement failure preserves the keyed retry; a later retry completes', () => {
  const storage = memory()
  storage.setItem(PENDING_KEY, JSON.stringify([result]))
  storage.setItem(`${PENDING_KEY}:${result.id}`, JSON.stringify(result))
  const write = storage.setItem
  storage.setItem = (key, raw) => {
    if (key !== PENDING_KEY) write(key, raw)
  }
  assert.throws(() => acknowledgeCompletedResult(storage, result), /acknowledgement/)
  assert.equal(storage.getItem(`${PENDING_KEY}:${result.id}`), JSON.stringify(result))
  storage.setItem = write
  acknowledgeCompletedResult(storage, result)
  assert.deepEqual(readResultLedger(storage, PENDING_KEY), [])
})

test('silent outbox removal failure reports unconfirmed acknowledgement and preserves retry', () => {
  const storage = memory()
  storage.setItem(`${PENDING_KEY}:${result.id}`, JSON.stringify(result))
  storage.removeItem = () => {}
  assert.throws(() => acknowledgeCompletedResult(storage, result), /acknowledgement/)
  assert.deepEqual(readResultLedger(storage, PENDING_KEY), [result])
})

test('practice conflicts cannot block two distinct completed attempts, even at the same time', async () => {
  const storage = memory()
  for (const item of [result, { ...result, id: 'second' }])
    storage.setItem(`${PENDING_KEY}:${item.id}`, JSON.stringify(item))
  const order: string[] = []
  await assert.rejects(
    syncCompletedBeforePractice({
      isCurrent: () => true,
      pending: () => readResultLedger(storage, PENDING_KEY),
      belongsToFamily: () => true,
      validate: () => {},
      save: async (item) => {
        order.push(item.id)
      },
      acknowledge: (item) => acknowledgeCompletedResult(storage, item),
      syncPractice: async () => {
        order.push('practice')
        throw new Error('competing checkpoints')
      },
    }),
    /competing checkpoints/,
  )
  assert.deepEqual(order, ['first', 'second', 'practice'])
  assert.deepEqual(readResultLedger(storage, PENDING_KEY), [])
  assert.equal(readResultLedger(storage, RESULT_KEY).length, 2)
})

for (const stage of ['upload', 'acknowledge'] as const) {
  test(`failed ${stage} prevents checkpoint replacement`, async () => {
    let practice = false
    await assert.rejects(
      syncCompletedBeforePractice({
        isCurrent: () => true,
        pending: () => [result],
        belongsToFamily: () => true,
        validate: () => {},
        save: async () => {
          if (stage === 'upload') throw new Error('unconfirmed')
        },
        acknowledge: () => {
          if (stage === 'acknowledge') throw new Error('unconfirmed')
        },
        syncPractice: async () => {
          practice = true
        },
      }),
      /unconfirmed/,
    )
    assert.equal(practice, false)
  })
}

for (const when of ['before', 'during'] as const) {
  test(`account/child change ${when} saving prevents stale acknowledgement and practice`, async () => {
    let current = when !== 'before'
    let saved = 0,
      acknowledged = 0,
      practice = 0
    const done = await syncCompletedBeforePractice({
      isCurrent: () => current,
      pending: () => [result],
      belongsToFamily: () => true,
      validate: () => {},
      save: async () => {
        saved++
        current = false
      },
      acknowledge: () => {
        acknowledged++
      },
      syncPractice: async () => {
        practice++
      },
    })
    assert.equal(done, false)
    assert.equal(saved, when === 'before' ? 0 : 1)
    assert.equal(acknowledged, 0)
    assert.equal(practice, 0)
  })
}

test('outbox entries belonging to another family are never uploaded or acknowledged', async () => {
  let saves = 0,
    acknowledgements = 0
  assert.equal(
    await syncCompletedBeforePractice({
      isCurrent: () => true,
      pending: () => [result],
      belongsToFamily: () => false,
      validate: () => {},
      save: async () => {
        saves++
      },
      acknowledge: () => {
        acknowledgements++
      },
      syncPractice: async () => {},
    }),
    true,
  )
  assert.equal(saves, 0)
  assert.equal(acknowledgements, 0)
})

test('a conflicting durable score cannot be uploaded from a different pending copy', async () => {
  let saved = false,
    practice = false
  await assert.rejects(
    syncCompletedBeforePractice({
      isCurrent: () => true,
      pending: () => [result],
      belongsToFamily: () => true,
      validate: () => {
        throw new Error('copies disagree')
      },
      save: async () => {
        saved = true
      },
      acknowledge: () => {},
      syncPractice: async () => {
        practice = true
      },
    }),
    /copies disagree/,
  )
  assert.equal(saved, false)
  assert.equal(practice, false)
})

for (const status of [401, 403, 429, 503]) {
  test(`score-first sync retains HTTP ${status} classification for the existing offline/access policy`, async () => {
    const repository = createResultRepository({
      projectId: 'synthetic',
      familyId: 'family',
      token: async () => 'synthetic',
      fetchImpl: async () => new Response('{}', { status }),
    })
    for (const operation of [() => repository.save(result), () => repository.listPage('child')]) {
      await assert.rejects(operation(), (error: unknown) => {
        assert.ok(error instanceof Error && 'status' in error)
        assert.equal(error.status, status)
        assert.equal(Boolean(isFamilyAccessDenied(error)), status === 401 || status === 403)
        assert.equal(isConnectionFailure(error), status === 429 || status === 503)
        return true
      })
    }
  })
}
