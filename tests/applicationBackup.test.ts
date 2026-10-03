import assert from 'node:assert/strict'
import test from 'node:test'
import { exportLocalApplicationBackup, previewLocalApplicationBackup } from '../src/application/backup/index.ts'
import { createInitialState } from '../src/domain.ts'
import {
  createVerifiedApplicationBackup,
  previewVerifiedApplicationBackup,
  VERIFIED_APPLICATION_BACKUP_SCHEMA,
} from '../src/persistence/applicationBackup.ts'

const scope = {
  mode: 'local-browser' as const,
  grade: 'Grade 2' as const,
  selectedChildId: 'grade-2-beta',
  origin: 'https://example.test',
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

  const preview = await previewVerifiedApplicationBackup(created.serialized)
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
  await assert.rejects(() => previewLocalApplicationBackup(legacy), /not a supported checksum-verified/i)
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
  assert.equal((await previewLocalApplicationBackup(exported.serialized)).summary.createdAt, '2026-10-02T22:00:00.123Z')
})
