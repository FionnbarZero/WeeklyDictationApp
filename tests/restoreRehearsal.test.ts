import assert from 'node:assert/strict'
import test from 'node:test'
import { rehearseVerifiedBackup } from '../scripts/restoreRehearsal.ts'
import { createInitialState } from '../src/domain.ts'
import { createVerifiedApplicationBackup } from '../src/persistence/applicationBackup.ts'

test('restore rehearsal proves rollback, exact apply, and idempotent replay without revealing scope identity', async () => {
  const backup = await createVerifiedApplicationBackup({
    state: createInitialState(),
    pendingAcquisition: [],
    pendingWarmup: [],
    createdAt: '2026-10-04T00:00:00.000Z',
    applicationVersion: 'test',
    scope: {
      mode: 'local-browser',
      grade: 'Grade 2',
      dataScope: 'whole-local-practice-state',
      selectedChildId: 'private-child',
      origin: 'https://private.example.test',
    },
  })

  const report = await rehearseVerifiedBackup(backup.serialized)
  assert.equal(report.checksum, backup.checksum)
  assert.equal(report.previewWrites, 0)
  assert.equal(report.interruptionRollback, 'passed')
  assert.equal(report.firstApply, 'applied')
  assert.equal(report.secondApply, 'idempotent')
  assert.equal(report.journalCleared, true)
  assert.equal(report.exactStorageVerification, 'passed')
  assert.doesNotMatch(JSON.stringify(report), /private-child|private\.example/)
})
