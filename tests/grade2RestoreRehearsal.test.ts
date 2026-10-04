import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  GRADE2_PRIVATE_CAPTURE_SCHEMA,
  GRADE2_REHEARSAL_EVIDENCE_SCHEMA,
  GRADE2_STABLE_ORIGIN,
  assertPrivacySafeEvidence,
  candidateFileForRequest,
  createDisposableScratchSnapshot,
  grade2CaptureBookmarklet,
  isExpectedBlockedFontStylesheet,
  parseGrade2PrivateCapture,
  snapshotFromStorage,
  verifyInjectedRollback,
  verifyUnexpectedNewerStorageBlocked,
  verifyWrongProfileRejected,
  type Grade2PrivateCapture,
  type Grade2RehearsalEvidence,
} from '../scripts/grade2RestoreRehearsal.ts'
import { planSelectedChildRestore } from '../src/application/backup/selectedChildRestore.ts'
import { createInitialState, type AppState, type Dataset, type WordResult } from '../src/domain.ts'
import { createVerifiedApplicationBackup } from '../src/persistence/applicationBackup.ts'
import { localRestoreValues } from '../src/persistence/localRestoreJournal.ts'
import { grade2DeckProfile, parseSlide } from '../src/slidesImporter.ts'

const datasetOutcome = parseSlide(
  { objectId: 'grade2-rehearsal-slide', text: 'Week 9/28-10/2\nMandarin\nTier 1: 测试' },
  grade2DeckProfile,
)
if (!datasetOutcome.dataset) throw new Error('The synthetic rehearsal dataset is invalid.')
const dataset: Dataset = datasetOutcome.dataset

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
    sessionDate: '2026-10-03',
    completedAt: '2026-10-03T20:00:00.000Z',
    correct: true,
    revealMethod: 'timer',
    scored: true,
    completeSourceDatasetReviewed: true,
  }
}

function sourceState(): AppState {
  return {
    ...createInitialState(),
    datasets: [dataset],
    results: [result('selected-result', 'private-selected-child'), result('other-result', 'private-other-child')],
  }
}

function capture(): Grade2PrivateCapture {
  return {
    schema: GRADE2_PRIVATE_CAPTURE_SCHEMA,
    capturedAt: '2026-10-03T20:00:00.000Z',
    origin: GRADE2_STABLE_ORIGIN,
    path: '/WeeklyDictationApp/',
    selectedChildId: 'private-selected-child',
    storage: localRestoreValues({ state: sourceState(), pendingAcquisition: [], pendingWarmup: [] }),
  }
}

test('the capture bookmarklet is download-only and reads only the restore snapshot plus selected profile', () => {
  const bookmarklet = grade2CaptureBookmarklet()
  assert.match(bookmarklet, /^javascript:/)
  assert.match(bookmarklet, /weekly-dictation-state-v2/)
  assert.match(bookmarklet, /weekly-dictation-acquisition-pending-v1/)
  assert.match(bookmarklet, /weekly-dictation-warmup-pending-v1/)
  assert.match(bookmarklet, /weekly-dictation-child/)
  assert.match(bookmarklet, /createObjectURL/)
  assert.doesNotMatch(bookmarklet, /fetch\(|sendBeacon|XMLHttpRequest|console\./)
})

test('private capture parsing is exact, origin-bound, and rejects extra fields', () => {
  const valid = capture()
  assert.deepEqual(parseGrade2PrivateCapture(JSON.stringify(valid)), valid)
  assert.throws(
    () => parseGrade2PrivateCapture(JSON.stringify({ ...valid, accessToken: 'must-not-be-accepted' })),
    /unsupported scope or structure/i,
  )
  assert.throws(
    () => parseGrade2PrivateCapture(JSON.stringify({ ...valid, origin: 'https://other.example.test' })),
    /unsupported scope or structure/i,
  )
  assert.throws(
    () => parseGrade2PrivateCapture(JSON.stringify({ ...valid, path: '/unrelated/' })),
    /unsupported scope or structure/i,
  )
})

test('a disposable snapshot removes only the selected profile and restores it losslessly', () => {
  const privateCapture = capture()
  const source = snapshotFromStorage(privateCapture.storage)
  const scratch = createDisposableScratchSnapshot(source, privateCapture.selectedChildId, privateCapture.capturedAt)
  assert.equal(scratch.report.changed, true)
  assert.deepEqual(
    scratch.snapshot.state.results.map((item) => item.id),
    ['other-result'],
  )

  const restored = planSelectedChildRestore({
    current: scratch.snapshot,
    backup: {
      schema: 'weekly-dictation-backup-v1',
      createdAt: privateCapture.capturedAt,
      state: source.state,
      pendingAcquisition: source.pendingAcquisition,
      pendingWarmup: source.pendingWarmup,
    },
    childId: privateCapture.selectedChildId,
  })
  assert.equal(restored.report.changed, true)
  assert.equal(restored.report.preservedOtherChildRecords, 1)
  assert.deepEqual(
    restored.snapshot.state.results.map((item) => item.id),
    ['other-result', 'selected-result'],
  )
})

test('failure injection rolls back all three keys and unexpected newer storage remains blocked', () => {
  const privateCapture = capture()
  const source = snapshotFromStorage(privateCapture.storage)
  const scratch = createDisposableScratchSnapshot(source, privateCapture.selectedChildId, privateCapture.capturedAt)
  const before = localRestoreValues(scratch.snapshot)
  const after = localRestoreValues(source)
  const input = {
    checksum: 'a'.repeat(64),
    childId: privateCapture.selectedChildId,
    origin: privateCapture.origin,
    createdAt: privateCapture.capturedAt,
  }
  assert.equal(verifyInjectedRollback(before, after, input), true)
  assert.equal(verifyUnexpectedNewerStorageBlocked(before, after, input), true)
})

test('wrong-profile preview fails and the evidence omits all private capture values', async () => {
  const privateCapture = capture()
  const source = snapshotFromStorage(privateCapture.storage)
  const backup = await createVerifiedApplicationBackup({
    state: source.state,
    pendingAcquisition: source.pendingAcquisition,
    pendingWarmup: source.pendingWarmup,
    createdAt: privateCapture.capturedAt,
    applicationVersion: '0.2.0-stage2',
    scope: {
      mode: 'local-browser',
      grade: 'Grade 2',
      dataScope: 'whole-local-practice-state',
      selectedChildId: privateCapture.selectedChildId,
      origin: privateCapture.origin,
    },
  })
  assert.equal(await verifyWrongProfileRejected(backup.serialized, privateCapture), true)

  const evidence: Grade2RehearsalEvidence = {
    schema: GRADE2_REHEARSAL_EVIDENCE_SCHEMA,
    completedAt: '2026-10-03T21:00:00.000Z',
    candidateRevision: 'a'.repeat(40),
    applicationVersion: '0.2.0-stage2',
    origin: privateCapture.origin,
    backup: {
      fileName: 'weekly-dictation-grade2-backup-2026-10-03T20-00-00-000Z.json',
      createdAt: privateCapture.capturedAt,
      checksum: backup.checksum,
    },
    checks: {
      privateCaptureValidated: true,
      candidateServedAtRecordedOrigin: true,
      externalNetworkBlocked: true,
      verifiedBackupRetained: true,
      previewWasZeroWrite: true,
      wrongProfileRejected: true,
      selectedProfileApplied: true,
      unrelatedProfilesPreserved: true,
      automaticPreRestoreBackupVerified: true,
      reloadVerified: true,
      duplicateReplayWasIdempotent: true,
      interruptedWriteReplayed: true,
      injectedFailureRolledBack: true,
      unexpectedNewerStorageBlocked: true,
    },
  }
  const serialized = assertPrivacySafeEvidence(evidence, privateCapture)
  assert.doesNotMatch(serialized, /private-selected-child|private-other-child|weekly-dictation-state-v2/)
})

test('candidate routing serves only files beneath the Grade 2 public-preview path', () => {
  const directory = mkdtempSync(join(tmpdir(), 'weekly-dictation-grade2-rehearsal-'))
  try {
    writeFileSync(join(directory, 'index.html'), '<!doctype html>')
    assert.equal(
      candidateFileForRequest('https://fionnbarzero.github.io/WeeklyDictationApp/', directory),
      join(directory, 'index.html'),
    )
    assert.equal(candidateFileForRequest('https://example.test/WeeklyDictationApp/', directory), null)
    assert.equal(
      candidateFileForRequest('https://fionnbarzero.github.io/WeeklyDictationApp/../private.json', directory),
      null,
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('only the checked-in Google Fonts stylesheet request is replaced without network access', () => {
  assert.equal(
    isExpectedBlockedFontStylesheet(
      'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400&display=swap',
      'GET',
      'stylesheet',
    ),
    true,
  )
  assert.equal(isExpectedBlockedFontStylesheet('https://fonts.gstatic.com/font.woff2', 'GET', 'font'), false)
  assert.equal(isExpectedBlockedFontStylesheet('https://example.test/collect?value=private', 'POST', 'fetch'), false)
})
