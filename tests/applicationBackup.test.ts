import assert from 'node:assert/strict'
import test from 'node:test'
import { exportLocalApplicationBackup, previewLocalApplicationBackup } from '../src/application/backup/index.ts'
import { planSelectedChildRestore } from '../src/application/backup/selectedChildRestore.ts'
import { APP_STATE_KEY, createInitialState, type AppState, type Dataset, type WordResult } from '../src/domain.ts'
import {
  createVerifiedApplicationBackup,
  previewVerifiedApplicationBackup,
  VERIFIED_APPLICATION_BACKUP_SCHEMA,
} from '../src/persistence/applicationBackup.ts'
import { ACQUISITION_PENDING_JOURNAL_KEY } from '../src/persistence/acquisitionPendingJournal.ts'
import {
  applyLocalRestoreTransaction,
  LOCAL_RESTORE_JOURNAL_KEY,
  localRestoreValues,
  recoverInterruptedLocalRestore,
  type LocalRestoreStorage,
} from '../src/persistence/localRestoreJournal.ts'
import { WARMUP_PENDING_JOURNAL_KEY } from '../src/persistence/warmup/pendingJournal.ts'

const scope = {
  mode: 'local-browser' as const,
  grade: 'Grade 2' as const,
  dataScope: 'whole-local-practice-state' as const,
  selectedChildId: 'grade-2-beta',
  origin: 'https://example.test',
}

const expectedScope = {
  mode: scope.mode,
  grade: scope.grade,
  selectedChildId: scope.selectedChildId,
  origin: scope.origin,
}

test('a verified browser backup round-trips through SHA-256 preview without applying state', async () => {
  const state = createInitialState()
  const created = await createVerifiedApplicationBackup({
    state,
    pendingAcquisition: [],
    pendingWarmup: [],
    createdAt: '2026-10-02T22:00:00.000Z',
    applicationVersion: '0.2.0-stage2',
    scope,
  })

  assert.equal(created.file.schema, VERIFIED_APPLICATION_BACKUP_SCHEMA)
  assert.match(created.checksum, /^[a-f0-9]{64}$/)
  assert.doesNotMatch(created.serialized, /refreshToken|idToken|accessToken/)

  const preview = await previewVerifiedApplicationBackup(created.serialized, { expectedScope })
  assert.equal(preview.checksum, created.checksum)
  assert.equal(preview.payload.backup.createdAt, '2026-10-02T22:00:00.000Z')
  assert.deepEqual(preview.payload.backup.state, state)
  assert.deepEqual(preview.plannedStorageKeys, [
    'weekly-dictation-state-v2',
    'weekly-dictation-acquisition-pending-v1',
    'weekly-dictation-warmup-pending-v1',
  ])
  assert.deepEqual(preview.summary, {
    createdAt: '2026-10-02T22:00:00.000Z',
    applicationVersion: '0.2.0-stage2',
    stateVersion: 2,
    datasetCount: 0,
    resultCount: 0,
    scoreCount: 0,
    completedSessionCount: 0,
    acquisitionProgressCount: 0,
    warmupVisitCount: 0,
    pendingAcquisitionCount: 0,
    pendingWarmupCount: 0,
  })
})

test('restore preview rejects a changed payload before it can be treated as valid', async () => {
  const created = await createVerifiedApplicationBackup({
    state: createInitialState(),
    pendingAcquisition: [],
    pendingWarmup: [],
    createdAt: '2026-10-02T22:00:00.000Z',
    applicationVersion: '0.2.0-stage2',
    scope,
  })
  const changed = JSON.parse(created.serialized)
  changed.payload.applicationVersion = 'changed-after-export'
  await assert.rejects(() => previewVerifiedApplicationBackup(JSON.stringify(changed)), /checksum does not match/i)
})

test('restore preview rejects an unverified legacy backup', async () => {
  const legacy = JSON.stringify({
    schema: 'weekly-dictation-backup-v1',
    createdAt: '2026-10-02T22:00:00.000Z',
    state: createInitialState(),
    pendingAcquisition: [],
    pendingWarmup: [],
  })
  await assert.rejects(() => previewLocalApplicationBackup(legacy, expectedScope), /not a supported checksum-verified/i)
})

test('restore preview rejects a verified backup from another origin or selected profile', async () => {
  const created = await createVerifiedApplicationBackup({
    state: createInitialState(),
    pendingAcquisition: [],
    pendingWarmup: [],
    createdAt: '2026-10-02T22:00:00.000Z',
    applicationVersion: '0.2.0-stage2',
    scope,
  })

  await assert.rejects(
    () =>
      previewVerifiedApplicationBackup(created.serialized, {
        expectedScope: { ...expectedScope, origin: 'https://other.example.test' },
      }),
    /different browser origin/i,
  )
  await assert.rejects(
    () =>
      previewVerifiedApplicationBackup(created.serialized, {
        expectedScope: { ...expectedScope, selectedChildId: 'another-child' },
      }),
    /different Grade 2 profile/i,
  )
})

test('the application export refuses to omit a malformed recovery journal', async () => {
  let acquisitionReads = 0
  let warmupReads = 0
  await assert.rejects(
    () =>
      exportLocalApplicationBackup({
        state: createInitialState(),
        createdAt: '2026-10-02T22:00:00.000Z',
        applicationVersion: '0.2.0-stage2',
        scope,
        capabilities: {
          readPendingAcquisition: () => {
            acquisitionReads += 1
            return { entries: [], error: 'The malformed journal was preserved.', raw: '{broken' }
          },
          readPendingWarmup: () => {
            warmupReads += 1
            return { entries: [] }
          },
        },
      }),
    /Backup stopped.*Acquisition.*preserved/i,
  )
  assert.equal(acquisitionReads, 1)
  assert.equal(warmupReads, 0)
})

test('the application export records its exact timestamp in a filesystem-safe name', async () => {
  const exported = await exportLocalApplicationBackup({
    state: createInitialState(),
    createdAt: '2026-10-02T22:00:00.123Z',
    applicationVersion: '0.2.0-stage2',
    scope,
    capabilities: {
      readPendingAcquisition: () => ({ entries: [] }),
      readPendingWarmup: () => ({ entries: [] }),
    },
  })
  assert.equal(exported.fileName, 'weekly-dictation-grade2-backup-2026-10-02T22-00-00-123Z.json')
  assert.equal(
    (await previewLocalApplicationBackup(exported.serialized, expectedScope)).summary.createdAt,
    '2026-10-02T22:00:00.123Z',
  )
})

const dataset: Dataset = {
  id: 'grade2-week-1',
  dateRange: '9/28–10/2',
  startDate: '2026-09-28',
  endDate: '2026-10-02',
  grade: 'Grade 2',
  schoolYear: '2026–2027',
  description: 'Week 1',
  words: [
    {
      id: 'grade2-week-1-word-1',
      text: '需要',
      sentence: '我需要一本书。',
      datasetId: 'grade2-week-1',
      language: 'mandarin',
      tier: 'tier-1',
      activityType: 'dictation',
    },
  ],
}

function result(id: string, childId: string): WordResult {
  return {
    id,
    childId,
    datasetId: dataset.id,
    datasetDateRange: dataset.dateRange,
    wordId: dataset.words[0].id,
    grade: 'Grade 2',
    phase: 'acquisition',
    sessionId: `${id}-session`,
    sessionDate: '2026-09-29',
    completedAt: '2026-09-29T16:00:00.000Z',
    correct: true,
    revealMethod: 'timer',
    scored: true,
    completeSourceDatasetReviewed: true,
  }
}

function stateWithResults(...results: WordResult[]): AppState {
  return { ...createInitialState(), datasets: [dataset], results }
}

test('selected-child restore replaces only that profile and preserves current shared curriculum', () => {
  const current = stateWithResults(result('target-current', 'rhys'), result('other-current', 'eli'))
  const backup = stateWithResults(result('target-backup', 'rhys'), result('other-backup', 'eli'))
  const historical: Dataset = {
    ...dataset,
    id: 'grade2-week-historical',
    words: [{ ...dataset.words[0], id: 'grade2-week-historical-word-1', datasetId: 'grade2-week-historical' }],
  }
  backup.datasets.push(historical)
  const plan = planSelectedChildRestore({
    current: { state: current, pendingAcquisition: [], pendingWarmup: [] },
    backup: {
      schema: 'weekly-dictation-backup-v1',
      createdAt: '2026-10-02T22:00:00.000Z',
      state: backup,
      pendingAcquisition: [],
      pendingWarmup: [],
    },
    childId: 'rhys',
  })

  assert.deepEqual(
    plan.snapshot.state.results.map((item) => item.id),
    ['other-current', 'target-backup'],
  )
  assert.deepEqual(
    plan.snapshot.state.datasets.map((item) => item.id),
    ['grade2-week-1', 'grade2-week-historical'],
  )
  assert.equal(plan.report.preservedOtherChildRecords, 1)
  assert.equal(plan.report.addedHistoricalDatasets, 1)
  assert.deepEqual(plan.report.before.practiceRecords, 1)
  assert.deepEqual(plan.report.after.practiceRecords, 1)
})

test('selected-child restore validates generated Familiar-DT observations outside the weekly word list', () => {
  const backup = stateWithResults(result('target-backup', 'rhys'))
  backup.distractorTargetObservations = [
    {
      id: 'familiar-observation',
      childId: 'rhys',
      sessionId: 'session',
      datasetId: dataset.id,
      wordId: 'familiar-dt-1',
      text: '一',
      poolType: 'familiar',
      correct: true,
      revealMethod: 'timer',
      reviewedAt: '2026-09-29T16:00:00.000Z',
    },
  ]
  assert.doesNotThrow(() =>
    planSelectedChildRestore({
      current: { state: backup, pendingAcquisition: [], pendingWarmup: [] },
      backup: {
        schema: 'weekly-dictation-backup-v1',
        createdAt: '2026-10-02T22:00:00.000Z',
        state: backup,
        pendingAcquisition: [],
        pendingWarmup: [],
      },
      childId: 'rhys',
    }),
  )

  backup.distractorTargetObservations[0].text = 'not-the-canonical-target'
  assert.throws(
    () =>
      planSelectedChildRestore({
        current: { state: backup, pendingAcquisition: [], pendingWarmup: [] },
        backup: {
          schema: 'weekly-dictation-backup-v1',
          createdAt: '2026-10-02T22:00:00.000Z',
          state: backup,
          pendingAcquisition: [],
          pendingWarmup: [],
        },
        childId: 'rhys',
      }),
    /unknown familiar target/,
  )
})

test('selected-child restore rejects an orphaned versioned receipt before writing', () => {
  const backup = stateWithResults(result('target-backup', 'rhys'))
  backup.acquisitionTransitionReceipts = [
    {
      progressionId: 'missing-progression',
      transitionId: 'malformed-receipt',
      payloadFingerprint: 'fingerprint',
      operation: 'answer',
      promptId: 'prompt',
      expectedRevision: 0,
      appliedRevision: 1,
      appliedAt: '2026-09-29T16:00:00.000Z',
    },
  ]
  assert.throws(
    () =>
      planSelectedChildRestore({
        current: { state: stateWithResults(), pendingAcquisition: [], pendingWarmup: [] },
        backup: {
          schema: 'weekly-dictation-backup-v1',
          createdAt: '2026-10-02T22:00:00.000Z',
          state: backup,
          pendingAcquisition: [],
          pendingWarmup: [],
        },
        childId: 'rhys',
      }),
    /receipt.*orphaned/i,
  )
})

test('selected-child restore rejects malformed versioned collections before writing', () => {
  const backup = stateWithResults()
  backup.acquisitionProgressEnvelopes = [{} as never]
  assert.throws(
    () =>
      planSelectedChildRestore({
        current: { state: stateWithResults(), pendingAcquisition: [], pendingWarmup: [] },
        backup: {
          schema: 'weekly-dictation-backup-v1',
          createdAt: '2026-10-02T22:00:00.000Z',
          state: backup,
          pendingAcquisition: [],
          pendingWarmup: [],
        },
        childId: 'rhys',
      }),
    /backup application state is malformed/i,
  )
})

class MemoryRestoreStorage implements LocalRestoreStorage {
  readonly values = new Map<string, string>()
  writes = 0
  failAtWrite: number | null = null

  getItem(key: string) {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.writes += 1
    if (this.writes === this.failAtWrite) throw new Error('injected storage failure')
    this.values.set(key, value)
  }
  removeItem(key: string) {
    this.values.delete(key)
  }
}

function seedRestoreTargets(storage: MemoryRestoreStorage, prefix: string) {
  storage.values.set(APP_STATE_KEY, `${prefix}-state`)
  storage.values.set(ACQUISITION_PENDING_JOURNAL_KEY, `${prefix}-acquisition`)
  storage.values.set(WARMUP_PENDING_JOURNAL_KEY, `${prefix}-warmup`)
}

test('a failed three-key restore rolls every target back and removes its journal', () => {
  const storage = new MemoryRestoreStorage()
  seedRestoreTargets(storage, 'before')
  const after = {
    [APP_STATE_KEY]: 'after-state',
    [ACQUISITION_PENDING_JOURNAL_KEY]: 'after-acquisition',
    [WARMUP_PENDING_JOURNAL_KEY]: 'after-warmup',
  }
  storage.failAtWrite = 4
  assert.throws(
    () =>
      applyLocalRestoreTransaction({
        storage,
        after,
        transactionId: 'restore-1',
        backupChecksum: 'a'.repeat(64),
        childId: 'rhys',
        origin: 'https://example.test',
        createdAt: '2026-10-02T22:00:00.000Z',
      }),
    /previous browser data was restored/i,
  )
  assert.equal(storage.getItem(APP_STATE_KEY), 'before-state')
  assert.equal(storage.getItem(ACQUISITION_PENDING_JOURNAL_KEY), 'before-acquisition')
  assert.equal(storage.getItem(WARMUP_PENDING_JOURNAL_KEY), 'before-warmup')
  assert.equal(storage.getItem(LOCAL_RESTORE_JOURNAL_KEY), null)
})

test('startup recovery idempotently replays a partially written restore journal', () => {
  const storage = new MemoryRestoreStorage()
  const before = {
    [APP_STATE_KEY]: 'before-state',
    [ACQUISITION_PENDING_JOURNAL_KEY]: 'before-acquisition',
    [WARMUP_PENDING_JOURNAL_KEY]: 'before-warmup',
  }
  const after = {
    [APP_STATE_KEY]: 'after-state',
    [ACQUISITION_PENDING_JOURNAL_KEY]: 'after-acquisition',
    [WARMUP_PENDING_JOURNAL_KEY]: 'after-warmup',
  }
  seedRestoreTargets(storage, 'before')
  storage.values.set(APP_STATE_KEY, after[APP_STATE_KEY])
  storage.values.set(
    LOCAL_RESTORE_JOURNAL_KEY,
    JSON.stringify({
      schema: LOCAL_RESTORE_JOURNAL_KEY,
      transactionId: 'restore-1',
      backupChecksum: 'a'.repeat(64),
      childId: 'rhys',
      origin: 'https://example.test',
      createdAt: '2026-10-02T22:00:00.000Z',
      stage: APP_STATE_KEY,
      before,
      after,
    }),
  )
  assert.equal(recoverInterruptedLocalRestore(storage), 'replayed')
  assert.equal(storage.getItem(APP_STATE_KEY), 'after-state')
  assert.equal(storage.getItem(ACQUISITION_PENDING_JOURNAL_KEY), 'after-acquisition')
  assert.equal(storage.getItem(WARMUP_PENDING_JOURNAL_KEY), 'after-warmup')
  assert.equal(storage.getItem(LOCAL_RESTORE_JOURNAL_KEY), null)
  assert.equal(recoverInterruptedLocalRestore(storage), 'none')
})

test('startup recovery preserves unexpected newer browser data and leaves the journal for review', () => {
  const storage = new MemoryRestoreStorage()
  const before = {
    [APP_STATE_KEY]: 'before-state',
    [ACQUISITION_PENDING_JOURNAL_KEY]: 'before-acquisition',
    [WARMUP_PENDING_JOURNAL_KEY]: 'before-warmup',
  }
  const after = {
    [APP_STATE_KEY]: 'after-state',
    [ACQUISITION_PENDING_JOURNAL_KEY]: 'after-acquisition',
    [WARMUP_PENDING_JOURNAL_KEY]: 'after-warmup',
  }
  seedRestoreTargets(storage, 'before')
  storage.values.set(APP_STATE_KEY, 'newer-unexpected-state')
  storage.values.set(
    LOCAL_RESTORE_JOURNAL_KEY,
    JSON.stringify({
      schema: LOCAL_RESTORE_JOURNAL_KEY,
      transactionId: 'restore-1',
      backupChecksum: 'a'.repeat(64),
      childId: 'rhys',
      origin: 'https://example.test',
      createdAt: '2026-10-02T22:00:00.000Z',
      stage: APP_STATE_KEY,
      before,
      after,
    }),
  )
  assert.throws(() => recoverInterruptedLocalRestore(storage), /unexpected browser changes/i)
  assert.equal(storage.getItem(APP_STATE_KEY), 'newer-unexpected-state')
  assert.notEqual(storage.getItem(LOCAL_RESTORE_JOURNAL_KEY), null)
})

test('an identical restore is a no-write idempotent replay', () => {
  const storage = new MemoryRestoreStorage()
  const state = stateWithResults(result('target-backup', 'rhys'))
  const after = localRestoreValues({ state, pendingAcquisition: [], pendingWarmup: [] })
  for (const [key, value] of Object.entries(after)) storage.values.set(key, value!)
  assert.equal(
    applyLocalRestoreTransaction({
      storage,
      after,
      transactionId: 'restore-duplicate',
      backupChecksum: 'b'.repeat(64),
      childId: 'rhys',
      origin: 'https://example.test',
      createdAt: '2026-10-02T22:00:00.000Z',
    }),
    'idempotent',
  )
  assert.equal(storage.writes, 0)
  assert.equal(storage.getItem(LOCAL_RESTORE_JOURNAL_KEY), null)
})
