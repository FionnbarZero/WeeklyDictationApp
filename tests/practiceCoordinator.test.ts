import assert from 'node:assert/strict'
import test from 'node:test'
import {
  completePractice,
  leavePractice,
  prepareCloudCompletionAttempt,
  startPractice,
  type PracticeCompletionPersistence,
  type PracticeTransitionPersistence,
  type StartPracticePersistence,
} from '../src/application/practice/index.ts'
import {
  createInitialState,
  createPracticeSessionForTarget,
  resolveDatasetLifecycles,
  type Dataset,
  type PracticeSession,
  type PracticeTarget,
} from '../src/domain.ts'
import type { CloudSession } from '../src/persistence/cloudRecords.ts'

const dataset: Dataset = {
  id: 'grade2-coordinator-week',
  dateRange: '9/28–10/2',
  startDate: '2026-09-28',
  endDate: '2026-10-02',
  grade: 'Grade 2',
  schoolYear: '2026–2027',
  description: 'Coordinator fixture',
  words: [
    {
      id: 'grade2-coordinator-word',
      text: '需要',
      sentence: '我需要一本书。',
      datasetId: 'grade2-coordinator-week',
      language: 'mandarin',
      tier: 'tier-1',
      activityType: 'dictation',
    },
  ],
}
const target: PracticeTarget = { dataset, phase: 'acquisition' }
const startedAt = new Date('2026-10-01T16:00:00.000Z')

function stateWithDataset() {
  return { ...createInitialState(), datasets: [dataset] }
}

function startPersistence(cloud: boolean, overrides: Partial<StartPracticePersistence> = {}) {
  return {
    cloud,
    saveLocalState: () => true,
    journalWarmup: () => undefined,
    acknowledgeWarmup: () => undefined,
    journalAcquisition: () => undefined,
    acknowledgeAcquisition: () => undefined,
    ...overrides,
  } satisfies StartPracticePersistence
}

function cloudSession(primaryPhase: CloudSession['primaryPhase']): CloudSession {
  return {
    id: 'coordinator-session',
    childId: 'maya',
    familyId: 'family-maya',
    sessionDate: startedAt.toISOString(),
    localDate: '2026-10-01',
    startedAt: startedAt.toISOString(),
    primaryPhase,
    datasetId: dataset.id,
    status: 'in_progress',
    warmupStatus: 'in_progress',
    applicationVersion: 'test',
  }
}

test('local and cloud practice starts share one application operation with capability-specific writes', async () => {
  const state = stateWithDataset()
  const lifecycleResolution = resolveDatasetLifecycles([dataset], startedAt)
  let localSaves = 0
  const local = await startPractice({
    state,
    child: { id: 'maya', grade: 'Grade 2', schoolYear: '2026–2027' },
    target,
    primaryDatasets: [dataset],
    lifecycleResolution,
    sessionId: 'local-session',
    startedAt,
    persistence: startPersistence(false, {
      saveLocalState: () => {
        localSaves += 1
        return true
      },
    }),
  })
  assert.equal(local.status, 'started')
  assert.ok(localSaves > 0)
  if (local.status === 'started') assert.equal(local.session.cloudSessionId, undefined)

  let seeds = 0
  let cloudStarts = 0
  const cloud = await startPractice({
    state,
    child: { id: 'maya', grade: 'Grade 2', schoolYear: '2026–2027' },
    target,
    primaryDatasets: [dataset],
    lifecycleResolution,
    sessionId: 'coordinator-session',
    startedAt,
    persistence: startPersistence(true, {
      ensureWarmupSeed: async () => {
        seeds += 1
      },
      startCloudSession: async () => {
        cloudStarts += 1
        return cloudSession('acquisition')
      },
    }),
  })
  assert.equal(cloud.status, 'started')
  assert.equal(seeds, 1)
  assert.equal(cloudStarts, 1)
  if (cloud.status === 'started') assert.equal(cloud.session.cloudSessionId, 'coordinator-session')
})

test('a failed cloud session start blocks presentation without advancing local state', async () => {
  const state = stateWithDataset()
  const result = await startPractice({
    state,
    child: { id: 'maya', grade: 'Grade 2', schoolYear: '2026–2027' },
    target,
    primaryDatasets: [dataset],
    lifecycleResolution: resolveDatasetLifecycles([dataset], startedAt),
    sessionId: 'failed-session',
    startedAt,
    persistence: startPersistence(true, {
      ensureWarmupSeed: async () => undefined,
      startCloudSession: async () => {
        throw new Error('offline')
      },
    }),
  })

  assert.deepEqual(result, { status: 'blocked', message: 'Practice could not be saved: offline' })
  assert.deepEqual(state, stateWithDataset())
})

test('Reading and Stroke Order launches each create a fresh Warmup and separate Acquisition visit', async () => {
  const readingTarget = {
    id: 'grade2-coordinator-reading',
    text: '需要',
    sentence: '',
    datasetId: dataset.id,
    grade: 'Grade 2',
    language: 'mandarin' as const,
    tier: 'tier-2' as const,
    activityType: 'reading' as const,
  }
  const sharedDataset: Dataset = {
    ...dataset,
    vocabulary: { tier1: dataset.words, tier2: [readingTarget], tier3: [] },
  }
  const state = { ...createInitialState(), datasets: [sharedDataset] }
  const lifecycleResolution = resolveDatasetLifecycles([sharedDataset], startedAt)
  const reading = await startPractice({
    state,
    child: { id: 'maya', grade: 'Grade 2', schoolYear: '2026–2027' },
    target: { dataset: sharedDataset, phase: 'acquisition' },
    acquisition: { experienceId: 'reading', startNewVisit: true },
    primaryDatasets: [sharedDataset],
    lifecycleResolution,
    sessionId: 'reading-session',
    startedAt,
    persistence: startPersistence(false),
  })
  assert.equal(reading.status, 'started')
  if (reading.status !== 'started') return
  assert.equal(reading.session.acquisitionExperienceId, 'reading')
  assert.equal(reading.session.acquisitionVisitId, 'reading-session')
  assert.equal(reading.session.adaptiveWarmupVisitId, 'reading-session-warmup')
  assert.deepEqual(
    reading.session.primaryQueue.map((word) => word.id),
    [readingTarget.id],
  )

  const stroke = await startPractice({
    state: reading.state,
    child: { id: 'maya', grade: 'Grade 2', schoolYear: '2026–2027' },
    target: { dataset: sharedDataset, phase: 'acquisition' },
    acquisition: { experienceId: 'stroke-order', startNewVisit: true },
    primaryDatasets: [sharedDataset],
    lifecycleResolution,
    sessionId: 'stroke-session',
    startedAt: new Date('2026-10-01T16:01:00.000Z'),
    persistence: startPersistence(false),
  })
  assert.equal(stroke.status, 'started')
  if (stroke.status !== 'started') return
  assert.equal(stroke.session.acquisitionExperienceId, 'stroke-order')
  assert.equal(stroke.session.acquisitionVisitId, 'stroke-session')
  assert.equal(stroke.session.adaptiveWarmupVisitId, 'stroke-session-warmup')
  assert.notEqual(stroke.session.adaptiveWarmupVisitId, reading.session.adaptiveWarmupVisitId)
  assert.notEqual(stroke.session.acquisitionProgressionId, reading.session.acquisitionProgressionId)
})

test('leaving Acquisition preserves a partial cloud session while leaving Test Review abandons it', async () => {
  const state = stateWithDataset()
  const baseSession = createPracticeSessionForTarget({
    id: 'coordinator-session',
    childId: 'maya',
    grade: 'Grade 2',
    target,
    warmup: {
      words: [],
      randomRotationWordIds: [],
      recentReviewWordIds: [],
      erroredWordIds: [],
      rotationCycleId: 1,
    },
    startedAt: startedAt.toISOString(),
    random: () => 0,
  })
  const events: string[] = []
  const persistence: PracticeTransitionPersistence = {
    cloud: true,
    saveLocalState: () => true,
    journalWarmup: () => undefined,
    acknowledgeWarmup: () => undefined,
    updateCloudSession: async (_session, patch) => {
      events.push(`update:${patch.status}`)
      return { ...cloudSession('acquisition'), ...patch }
    },
    abandonCloudSession: async () => {
      events.push('abandon')
    },
  }

  const acquisition = leavePractice({
    state,
    session: baseSession,
    occurredAt: startedAt,
    persistence,
    cloudSession: cloudSession('acquisition'),
  })
  await Promise.all(acquisition.background.map((task) => task.promise))

  const review = leavePractice({
    state,
    session: { ...baseSession, primaryPhase: 'test-review', acquisition: undefined },
    occurredAt: startedAt,
    persistence,
    cloudSession: cloudSession('test-review'),
  })
  await Promise.all(review.background.map((task) => task.promise))

  assert.deepEqual(events, ['update:partial', 'abandon'])
})

test('local completion commits immediately while cloud completion uses the same derived attempts and scores', async () => {
  const reviewTarget: PracticeTarget = { dataset, phase: 'test-review' }
  const started = createPracticeSessionForTarget({
    id: 'coordinator-session',
    childId: 'maya',
    grade: 'Grade 2',
    target: reviewTarget,
    warmup: {
      words: [],
      randomRotationWordIds: [],
      recentReviewWordIds: [],
      erroredWordIds: [],
      rotationCycleId: 1,
    },
    startedAt: startedAt.toISOString(),
    random: () => 0,
  })
  const completed: PracticeSession = {
    ...started,
    segment: 'primary',
    stage: 'complete',
    queue: started.primaryQueue,
    warmupSkipped: true,
    primaryAnswers: started.primaryQueue.map((word) => ({
      word,
      correct: true,
      revealMethod: 'timer',
    })),
  }
  const local = completePractice({
    state: stateWithDataset(),
    session: completed,
    completedAt: startedAt,
  })
  assert.equal(local.cloudCommit, undefined)
  assert.equal(local.state.results.length, 1)
  assert.equal(local.state.scores[0].percent, 100)

  const writes: string[] = []
  const persistence: PracticeCompletionPersistence = {
    completeSession: async (_session, attempts, scores, nextState, completedAt) => {
      writes.push(`complete:${attempts.length}:${scores.length}:${nextState.childWordStates.length}:${completedAt}`)
    },
    finishSession: async () => undefined,
    discardTestReview: async () => undefined,
  }
  const cloud = completePractice({
    state: stateWithDataset(),
    session: completed,
    completedAt: startedAt,
    cloud: { session: cloudSession('test-review'), persistence },
  })
  await cloud.cloudCommit
  assert.deepEqual(writes, ['complete:1:1:1:2026-10-01T16:00:00.000Z'])
  assert.deepEqual(cloud.state, local.state)
})

test('a cloud completion retry reuses the first completion timestamp', () => {
  const first = prepareCloudCompletionAttempt(cloudSession('test-review'), startedAt)
  const retry = prepareCloudCompletionAttempt(first.session, new Date('2026-10-01T16:05:00.000Z'))

  assert.equal(first.completedAt.toISOString(), startedAt.toISOString())
  assert.equal(first.session?.completedAt, startedAt.toISOString())
  assert.equal(retry.completedAt.toISOString(), startedAt.toISOString())
  assert.equal(retry.session?.completedAt, startedAt.toISOString())
})
