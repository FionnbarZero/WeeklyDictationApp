import assert from 'node:assert/strict'
import test from 'node:test'
import { createInitialState, type Dataset } from '../src/domain.ts'
import {
  readChildWorkspace,
  recoverPendingTransitions,
  synchronizeChildWorkspace,
  type ChildWorkspaceCapabilities,
  type ChildWorkspaceScope,
} from '../src/application/workspace/index.ts'
import type { ChildWorkspaceReadPort } from '../src/application/workspace/contracts.ts'
import type { CloudSession } from '../src/persistence/cloudRecords.ts'
import { collectionGroupStructuredQuery, INITIAL_WORKSPACE_RECORD_BUDGETS } from '../src/firestoreClient.ts'
import {
  acquisitionPersistenceContext,
  createAcquisitionAnswerCheckpoint,
  prepareAcquisitionProgress,
} from '../src/application/acquisitionPersistence.ts'

const scope: ChildWorkspaceScope = {
  familyId: 'family-maya',
  childId: 'maya',
  grade: 'Grade 2',
  schoolYear: '2026–2027',
}

const dataset: Dataset = {
  id: 'week-1',
  dateRange: '9/28–10/2',
  startDate: '2026-09-28',
  endDate: '2026-10-02',
  grade: 'Grade 2',
  schoolYear: '2026–2027',
  description: 'Week 1',
  words: [],
}

function session(id: string, status: CloudSession['status'], primaryPhase: CloudSession['primaryPhase']): CloudSession {
  return {
    id,
    childId: scope.childId,
    familyId: scope.familyId,
    sessionDate: '2026-10-01T16:00:00.000Z',
    localDate: '2026-10-01',
    startedAt: '2026-10-01T16:00:00.000Z',
    primaryPhase,
    datasetId: dataset.id,
    status,
    warmupStatus: 'in_progress',
    applicationVersion: 'test',
  }
}

function readPort(overrides: Partial<ChildWorkspaceReadPort> = {}): ChildWorkspaceReadPort {
  return {
    listDatasets: async () => [],
    listDatasetWords: async () => [],
    listSessions: async () => [],
    listAttempts: async () => [],
    listScores: async () => [],
    readAdaptiveState: async () => null,
    listAcquisitionProgressions: async () => [],
    listDistractorTargetObservations: async () => [],
    listTier2ReadingProgress: async () => [],
    listWarmupVisits: async () => [],
    listWarmupQueueEntries: async () => [],
    listWarmupMastery: async () => [],
    listWarmupReceipts: async () => [],
    listWarmupAttempts: async () => [],
    listWarmupGraphPoints: async () => [],
    listWarmupRotations: async () => [],
    ...overrides,
  }
}

function capabilities(
  input: {
    reads?: ChildWorkspaceReadPort
    events?: string[]
    sessions?: CloudSession[]
    markAcquisitionPartial?: ChildWorkspaceCapabilities['reconciliation']['markAcquisitionPartial']
  } = {},
): ChildWorkspaceCapabilities {
  const events = input.events || []
  return {
    reads: input.reads || readPort({ listSessions: async () => input.sessions || [] }),
    assembly: {
      assembleCloudState: () => {
        events.push('assemble')
        return createInitialState()
      },
    },
    reconciliation: {
      markAcquisitionPartial:
        input.markAcquisitionPartial ||
        (async () => {
          events.push('reconcile-acquisition')
        }),
      abandonTestReview: async () => {
        events.push('reconcile-test-review')
      },
    },
    recovery: {
      readPendingAcquisition: () => {
        events.push('recover-acquisition')
        return { entries: [] }
      },
      acquisitionAlreadyCommitted: async () => false,
      commitAcquisitionCheckpoint: async () => 'applied',
      acknowledgeAcquisition: () => undefined,
      readPendingWarmup: () => ({ entries: [] }),
      warmupTransitionAlreadyCommitted: async () => false,
      ensureWarmupSeed: async () => undefined,
      commitWarmupTransition: async () => 'applied',
      acknowledgeWarmup: () => undefined,
      resolveLifecycle: () => {
        events.push('resolve-lifecycle')
        return null
      },
    },
  }
}

test('workspace reads do not reconcile sessions and skip abandoned-session attempts', async () => {
  let attemptReadCount = 0
  const reads = readPort({
    listDatasets: async () => [dataset],
    listDatasetWords: async () => [
      {
        id: 'word-1',
        text: '需要',
        sentence: '',
        datasetId: dataset.id,
        language: 'mandarin',
        tier: 'tier-1',
        activityType: 'dictation',
      },
    ],
    listSessions: async () => [
      session('open-acquisition', 'in_progress', 'acquisition'),
      session('abandoned-review', 'abandoned', 'test-review'),
    ],
    listAttempts: async () => {
      attemptReadCount += 1
      return [
        {
          id: 'kept-attempt',
          sessionId: 'open-acquisition',
          wordId: 'word-1',
          sourceDatasetId: dataset.id,
          phase: 'acquisition',
          correct: true,
          reviewedAt: '2026-10-01T16:01:00.000Z',
          completionStatus: 'complete',
        },
        {
          id: 'ignored-attempt',
          sessionId: 'abandoned-review',
          wordId: 'word-1',
          sourceDatasetId: dataset.id,
          phase: 'test-review',
          correct: false,
          reviewedAt: '2026-10-01T16:02:00.000Z',
          completionStatus: 'temporary',
        },
      ]
    },
  })

  const records = await readChildWorkspace(scope, reads, new AbortController().signal)

  assert.deepEqual(
    records.sessions.map((item) => item.id),
    ['open-acquisition'],
  )
  assert.equal(attemptReadCount, 1)
  assert.deepEqual(
    records.attempts.map((attempt) => attempt.id),
    ['kept-attempt'],
  )
  assert.equal(records.datasets[0].words.length, 1)
})

test('initial workspace hydration uses one vocabulary read and one attempt read regardless of history size', async () => {
  let wordReads = 0
  let attemptReads = 0
  let readOperations = 0
  const configuredReads = readPort({
    listDatasets: async () => [dataset, { ...dataset, id: 'week-2' }, { ...dataset, id: 'week-3' }],
    listDatasetWords: async () => {
      wordReads += 1
      return []
    },
    listSessions: async () => [
      session('session-1', 'completed', 'acquisition'),
      session('session-2', 'completed', 'test-review'),
      session('session-3', 'partial', 'acquisition'),
    ],
    listAttempts: async () => {
      attemptReads += 1
      return []
    },
  })
  const reads = new Proxy(configuredReads, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => {
        readOperations += 1
        return value(...args)
      }
    },
  }) as ChildWorkspaceReadPort

  await readChildWorkspace(scope, reads, new AbortController().signal)

  assert.equal(wordReads, 1)
  assert.equal(attemptReads, 1)
  assert.equal(readOperations, 16)
})

test('collection-group hydration queries request one overflow record beyond their hard budgets', () => {
  assert.deepEqual(collectionGroupStructuredQuery('words', INITIAL_WORKSPACE_RECORD_BUDGETS.datasetWords), {
    structuredQuery: {
      from: [{ collectionId: 'words', allDescendants: true }],
      limit: 10_001,
    },
  })
  assert.throws(() => collectionGroupStructuredQuery('attempts', 0), /positive record budget/)
})

test('synchronization preserves reconciliation-before-assembly-and-recovery ordering', async () => {
  const events: string[] = []
  const configured = capabilities({
    events,
    sessions: [
      session('open-acquisition', 'in_progress', 'acquisition'),
      session('open-review', 'in_progress', 'test-review'),
      session('partial-acquisition', 'partial', 'acquisition'),
    ],
  })

  await synchronizeChildWorkspace({
    scope,
    capabilities: configured,
    synchronizedAt: new Date('2026-10-01T16:00:00.000Z'),
    signal: new AbortController().signal,
  })

  assert.deepEqual(events, [
    'reconcile-acquisition',
    'reconcile-test-review',
    'assemble',
    'recover-acquisition',
    'resolve-lifecycle',
  ])
})

test('an aborted read cannot reconcile or assemble a stale child workspace', async () => {
  let finishDatasetRead!: (datasets: Dataset[]) => void
  const delayedDatasets = new Promise<Dataset[]>((resolve) => {
    finishDatasetRead = resolve
  })
  const events: string[] = []
  const configured = capabilities({
    events,
    reads: readPort({ listDatasets: async () => delayedDatasets }),
  })
  const controller = new AbortController()
  const synchronization = synchronizeChildWorkspace({
    scope,
    capabilities: configured,
    synchronizedAt: new Date('2026-10-01T16:00:00.000Z'),
    signal: controller.signal,
  })

  controller.abort()
  finishDatasetRead([])

  await assert.rejects(synchronization, { name: 'AbortError' })
  assert.deepEqual(events, [])
})

test('cancellation waits for an initiated reconciliation write but prevents later UI assembly', async () => {
  let writeStarted!: () => void
  const started = new Promise<void>((resolve) => {
    writeStarted = resolve
  })
  let finishWrite!: () => void
  const writeFinished = new Promise<void>((resolve) => {
    finishWrite = resolve
  })
  const events: string[] = []
  const configured = capabilities({
    events,
    sessions: [session('open-acquisition', 'in_progress', 'acquisition')],
    markAcquisitionPartial: async () => {
      events.push('write-started')
      writeStarted()
      await writeFinished
      events.push('write-completed')
    },
  })
  const controller = new AbortController()
  const synchronization = synchronizeChildWorkspace({
    scope,
    capabilities: configured,
    synchronizedAt: new Date('2026-10-01T16:00:00.000Z'),
    signal: controller.signal,
  })

  await started
  controller.abort()
  finishWrite()

  await assert.rejects(synchronization, { name: 'AbortError' })
  assert.deepEqual(events, ['write-started', 'write-completed'])
})

test('repeated synchronization is idempotent at the application boundary', async () => {
  const configured = capabilities()
  const first = await synchronizeChildWorkspace({
    scope,
    capabilities: configured,
    synchronizedAt: new Date('2026-10-01T16:00:00.000Z'),
    signal: new AbortController().signal,
  })
  const second = await synchronizeChildWorkspace({
    scope,
    capabilities: configured,
    synchronizedAt: new Date('2026-10-01T16:00:00.000Z'),
    signal: new AbortController().signal,
  })

  assert.deepEqual(second.state, first.state)
  assert.deepEqual(second.records, first.records)
})

test('a cloud commit followed by failed journal acknowledgement is detected and acknowledged on retry', async () => {
  const acquisitionDataset: Dataset = {
    ...dataset,
    words: [
      {
        id: 'word-1',
        text: '需要',
        sentence: '我需要一本书。',
        datasetId: dataset.id,
        language: 'mandarin',
        tier: 'tier-1',
        activityType: 'dictation',
      },
    ],
  }
  const baseState = { ...createInitialState(), datasets: [acquisitionDataset] }
  const prepared = prepareAcquisitionProgress(
    baseState,
    scope.childId,
    acquisitionDataset,
    '2026-10-01T16:00:00.000Z',
    () => 0,
  )
  assert.equal(prepared.status, 'ready')
  if (prepared.status !== 'ready' || !prepared.envelope.flow.prompt) return
  const checkpoint = createAcquisitionAnswerCheckpoint({
    envelope: prepared.envelope,
    context: acquisitionPersistenceContext(scope.childId, acquisitionDataset),
    response: { correct: true, revealMethod: 'timer' },
    answeredPromptId: prepared.envelope.flow.prompt.id,
    sessionId: 'recovery-session',
    occurredAt: '2026-10-01T16:01:00.000Z',
    random: () => 0,
  })
  const entry = { checkpoint, baseEnvelope: prepared.envelope }
  let pending = true
  let committed = false
  let commitAttempts = 0
  let acknowledgementAttempts = 0
  const recovery = {
    ...capabilities().recovery,
    readPendingAcquisition: () => ({ entries: pending ? [entry] : [] }),
    acquisitionAlreadyCommitted: async () => committed,
    commitAcquisitionCheckpoint: async () => {
      commitAttempts += 1
      committed = true
      return 'applied' as const
    },
    acknowledgeAcquisition: () => {
      acknowledgementAttempts += 1
      if (acknowledgementAttempts === 1) throw new Error('storage unavailable')
      pending = false
    },
    resolveLifecycle: () => null,
  }
  const records = {
    datasets: [acquisitionDataset],
    sessions: [],
    attempts: [],
    scores: [],
    adaptiveState: null,
    acquisitionProgressions: [prepared.envelope],
    distractorTargetObservations: [],
    warmup: {
      visits: [],
      queueEntries: [],
      mastery: [],
      receipts: [],
      attempts: [],
      graphPoints: [],
      rotations: [],
    },
  }
  const input = {
    state: prepared.state,
    records,
    scope,
    recovery,
    synchronizedAt: new Date('2026-10-01T16:02:00.000Z'),
    signal: new AbortController().signal,
  }

  await assert.rejects(recoverPendingTransitions(input), /storage unavailable/)
  const retried = await recoverPendingTransitions(input)

  assert.equal(commitAttempts, 1)
  assert.equal(acknowledgementAttempts, 2)
  assert.equal(pending, false)
  assert.equal(
    retried.acquisitionPendingCheckpoints?.some((candidate) => candidate.transitionId === checkpoint.transitionId),
    false,
  )
})
