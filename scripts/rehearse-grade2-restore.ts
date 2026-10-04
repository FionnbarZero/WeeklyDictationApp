import { execFileSync } from 'node:child_process'
import { basename, dirname, resolve } from 'node:path'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { chromium, type Download, type Page } from '@playwright/test'
import { planSelectedChildRestore } from '../src/application/backup/selectedChildRestore.ts'
import { previewVerifiedApplicationBackup } from '../src/persistence/applicationBackup.ts'
import {
  LOCAL_RESTORE_JOURNAL_KEY,
  LOCAL_RESTORE_TARGET_KEYS,
  localRestoreValues,
} from '../src/persistence/localRestoreJournal.ts'
import {
  GRADE2_REHEARSAL_EVIDENCE_SCHEMA,
  GRADE2_STABLE_ORIGIN,
  GRADE2_STABLE_URL,
  SELECTED_CHILD_STORAGE_KEY,
  applicationVersion,
  assertNewOutputPath,
  assertPrivacySafeEvidence,
  createDisposableScratchSnapshot,
  fulfillCandidateRequest,
  isExpectedBlockedFontStylesheet,
  readBrowserRestoreValues,
  readPrivateCaptureFile,
  replaceBrowserRestoreValues,
  snapshotFromStorage,
  storageValuesEqual,
  storageValuesHash,
  verifyInjectedRollback,
  verifyUnexpectedNewerStorageBlocked,
  verifyWrongProfileRejected,
  type Grade2RehearsalEvidence,
} from './grade2RestoreRehearsal.ts'

const root = resolve(import.meta.dirname, '..')
let stage = 'input confirmation'

function flag(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function requiredFlag(name: string) {
  const value = flag(name)?.trim()
  if (!value) throw new Error(`Missing ${name}.`)
  return value
}

function exactRevision() {
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('The candidate revision is unavailable.')
  return revision
}

function assertCleanWorktree() {
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()
  if (status) throw new Error('The rehearsal requires a clean committed worktree.')
}

function assertOutputParent(path: string) {
  if (!existsSync(dirname(path)) || !statSync(dirname(path)).isDirectory())
    throw new Error('A requested output directory does not exist.')
}

async function downloadedText(download: Download) {
  const path = await download.path()
  if (!path) throw new Error('The browser download was unavailable.')
  return readFileSync(path, 'utf8')
}

async function openProtection(page: Page) {
  await page.getByRole('button', { name: 'Back up Grade 2 browser data' }).click()
  await page.getByRole('heading', { name: 'Protect browser progress' }).waitFor({ state: 'visible' })
}

async function closeProtection(page: Page) {
  await page.getByRole('button', { name: 'Close progress protection' }).click()
  await page.getByRole('heading', { name: 'Protect browser progress' }).waitFor({ state: 'hidden' })
}

async function selectBackup(page: Page, raw: string) {
  await page.getByLabel('Select a Grade 2 backup to preview').setInputFiles({
    name: 'weekly-dictation-grade2-verified-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(raw),
  })
  await page.getByRole('heading', { name: 'Restore preview verified' }).waitFor({ state: 'visible' })
}

async function waitForApp(page: Page, revision: string) {
  await page.getByRole('button', { name: 'Back up Grade 2 browser data' }).waitFor({ state: 'visible' })
  const identity = await page.locator('.release-identity').textContent()
  if (!identity?.includes(revision)) throw new Error('The candidate page does not expose the expected revision.')
}

async function run() {
  if (!process.argv.includes('--confirm-disposable-copy')) throw new Error('Disposable-copy confirmation is required.')
  const capturePath = requiredFlag('--capture')
  const backupOutput = requiredFlag('--backup-output')
  const evidenceOutput = requiredFlag('--evidence-output')
  const confirmedOrigin = requiredFlag('--confirm-origin')
  if (confirmedOrigin !== GRADE2_STABLE_ORIGIN) throw new Error('The confirmed origin does not match Grade 2.')

  stage = 'private capture validation'
  const capture = readPrivateCaptureFile(capturePath, root, confirmedOrigin)
  const backupPath = assertNewOutputPath(backupOutput, root, true)
  const evidencePath = assertNewOutputPath(evidenceOutput, root, false)
  if (backupPath === evidencePath) throw new Error('Backup and evidence outputs must be different files.')
  assertOutputParent(backupPath)
  assertOutputParent(evidencePath)

  stage = 'candidate build'
  assertCleanWorktree()
  const revision = exactRevision()
  execFileSync('npm', ['run', 'build:public-preview'], {
    cwd: root,
    env: { ...process.env, VITE_GIT_REVISION: revision },
    stdio: 'inherit',
  })
  const buildDirectory = resolve(root, 'dist')
  const indexHtml = readFileSync(resolve(buildDirectory, 'index.html'), 'utf8')
  if (!indexHtml.includes(revision)) throw new Error('The candidate build identity is missing.')

  stage = 'disposable browser launch'
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ acceptDownloads: true, serviceWorkers: 'block' })
    await context.addInitScript(
      ({ origin, childKey, childId, storage, targetKeys }) => {
        if (window.location.origin !== origin || window.sessionStorage.getItem('grade2-rehearsal-seeded') === 'yes')
          return
        window.localStorage.clear()
        for (const key of targetKeys) {
          const value = storage[key]
          if (value === null) window.localStorage.removeItem(key)
          else window.localStorage.setItem(key, value)
        }
        window.localStorage.setItem(childKey, childId)
        window.sessionStorage.setItem('grade2-rehearsal-seeded', 'yes')
      },
      {
        origin: capture.origin,
        childKey: SELECTED_CHILD_STORAGE_KEY,
        childId: capture.selectedChildId,
        storage: capture.storage,
        targetKeys: LOCAL_RESTORE_TARGET_KEYS,
      },
    )

    let unexpectedExternalNetworkAttempts = 0
    let unmappedCandidateRequests = 0
    let browserErrors = 0
    const page = await context.newPage()
    page.on('pageerror', () => {
      browserErrors += 1
    })
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors += 1
    })
    await page.route('**/*', async (route) => {
      const request = route.request()
      const requestOrigin = new URL(request.url()).origin
      if (requestOrigin !== GRADE2_STABLE_ORIGIN) {
        if (isExpectedBlockedFontStylesheet(request.url(), request.method(), request.resourceType())) {
          await route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: '' })
          return
        }
        unexpectedExternalNetworkAttempts += 1
        await route.abort('blockedbyclient')
        return
      }
      if (!(await fulfillCandidateRequest(route, buildDirectory))) unmappedCandidateRequests += 1
    })

    stage = 'candidate origin verification'
    await page.goto(GRADE2_STABLE_URL, { waitUntil: 'domcontentloaded' })
    await waitForApp(page, revision)
    if (page.url() !== GRADE2_STABLE_URL) throw new Error('The disposable page left the recorded Grade 2 URL.')

    stage = 'verified backup export'
    await openProtection(page)
    const exportDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download backup' }).click()
    const downloadedBackup = await exportDownload
    const rawBackup = await downloadedText(downloadedBackup)
    const expectedScope = {
      mode: 'local-browser' as const,
      grade: 'Grade 2' as const,
      selectedChildId: capture.selectedChildId,
      origin: capture.origin,
    }
    const exported = await previewVerifiedApplicationBackup(rawBackup, { expectedScope })
    writeFileSync(backupPath, rawBackup, { flag: 'wx', mode: 0o600 })

    stage = 'zero-write preview'
    const originalBeforePreview = await readBrowserRestoreValues(page)
    await selectBackup(page, rawBackup)
    const originalAfterPreview = await readBrowserRestoreValues(page)
    if (storageValuesHash(originalBeforePreview) !== storageValuesHash(originalAfterPreview))
      throw new Error('Restore preview changed browser storage.')
    await closeProtection(page)

    stage = 'disposable selected-profile setup'
    const sourceSnapshot = exported.payload.backup
    const scratchPlan = createDisposableScratchSnapshot(sourceSnapshot, capture.selectedChildId, capture.capturedAt)
    if (!scratchPlan.report.changed) throw new Error('The selected profile has no restorable records to rehearse.')
    await replaceBrowserRestoreValues(page, localRestoreValues(scratchPlan.snapshot))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForApp(page, revision)
    const scratchValues = await readBrowserRestoreValues(page)
    const scratchSnapshot = snapshotFromStorage(scratchValues)
    const restorePlan = planSelectedChildRestore({
      current: scratchSnapshot,
      backup: sourceSnapshot,
      childId: capture.selectedChildId,
    })
    if (!restorePlan.report.changed) throw new Error('The disposable selected-profile restore would be a no-op.')
    const restoredValues = localRestoreValues(restorePlan.snapshot)

    stage = 'selected-profile apply'
    await openProtection(page)
    const scratchBeforePreview = await readBrowserRestoreValues(page)
    await selectBackup(page, rawBackup)
    if (!storageValuesEqual(await readBrowserRestoreValues(page), scratchBeforePreview))
      throw new Error('The disposable restore preview wrote browser data.')
    await page.getByRole('checkbox', { name: /Restore only the selected Grade 2 profile/i }).check()
    const safetyDownloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Apply selected-profile restore' }).click()
    const safetyDownload = await safetyDownloadPromise
    await page.locator('.backup-message').waitFor({ state: 'visible' })
    const safetyRaw = await downloadedText(safetyDownload)
    const safetyPreview = await previewVerifiedApplicationBackup(safetyRaw, { expectedScope })
    if (!storageValuesEqual(localRestoreValues(safetyPreview.payload.backup), scratchBeforePreview))
      throw new Error('The automatic pre-restore backup does not match the disposable pre-restore state.')
    if (!storageValuesEqual(await readBrowserRestoreValues(page), restoredValues))
      throw new Error('The selected-profile apply did not produce the planned snapshot.')

    stage = 'reload verification'
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForApp(page, revision)
    if (!storageValuesEqual(await readBrowserRestoreValues(page), restoredValues))
      throw new Error('The restored snapshot did not survive reload.')
    if ((await page.evaluate((key) => window.localStorage.getItem(key), LOCAL_RESTORE_JOURNAL_KEY)) !== null)
      throw new Error('The completed restore left a transaction journal behind.')

    stage = 'idempotent replay'
    await openProtection(page)
    await selectBackup(page, rawBackup)
    await page.getByRole('checkbox', { name: /Restore only the selected Grade 2 profile/i }).check()
    const replaySafetyDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Apply selected-profile restore' }).click()
    await replaySafetyDownload
    await page.locator('.backup-message').waitFor({ state: 'visible' })
    const replayMessage = (await page.locator('.backup-message').textContent()) || ''
    if (!replayMessage.includes('already matched')) throw new Error('Duplicate restore was not idempotent.')
    if (!storageValuesEqual(await readBrowserRestoreValues(page), restoredValues))
      throw new Error('Duplicate restore changed browser storage.')

    stage = 'interrupted-write replay'
    const interruptedJournal = {
      schema: LOCAL_RESTORE_JOURNAL_KEY,
      transactionId: `grade2-rehearsal-interrupted-${capture.capturedAt}`,
      backupChecksum: exported.checksum,
      childId: capture.selectedChildId,
      origin: capture.origin,
      createdAt: capture.capturedAt,
      stage: LOCAL_RESTORE_TARGET_KEYS[0],
      before: scratchValues,
      after: restoredValues,
    }
    await page.evaluate(
      ({ keys, before, after, journalKey, journal }) => {
        for (const key of keys) {
          const value = before[key]
          if (value === null) window.localStorage.removeItem(key)
          else window.localStorage.setItem(key, value)
        }
        const firstValue = after[keys[0]]
        if (firstValue === null) window.localStorage.removeItem(keys[0])
        else window.localStorage.setItem(keys[0], firstValue)
        window.localStorage.setItem(journalKey, JSON.stringify(journal))
      },
      {
        keys: LOCAL_RESTORE_TARGET_KEYS,
        before: scratchValues,
        after: restoredValues,
        journalKey: LOCAL_RESTORE_JOURNAL_KEY,
        journal: interruptedJournal,
      },
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForApp(page, revision)
    if (!storageValuesEqual(await readBrowserRestoreValues(page), restoredValues))
      throw new Error('Startup recovery did not replay the interrupted restore.')
    if ((await page.evaluate((key) => window.localStorage.getItem(key), LOCAL_RESTORE_JOURNAL_KEY)) !== null)
      throw new Error('Startup recovery did not clear the completed transaction journal.')

    stage = 'injected rollback verification'
    const rollbackVerified = verifyInjectedRollback(scratchValues, restoredValues, {
      checksum: exported.checksum,
      childId: capture.selectedChildId,
      origin: capture.origin,
      createdAt: capture.capturedAt,
    })
    if (!rollbackVerified) throw new Error('The injected rollback safeguard did not pass.')

    stage = 'unexpected newer storage verification'
    const unexpectedStorageBlocked = verifyUnexpectedNewerStorageBlocked(scratchValues, restoredValues, {
      checksum: exported.checksum,
      childId: capture.selectedChildId,
      origin: capture.origin,
      createdAt: capture.capturedAt,
    })
    if (!unexpectedStorageBlocked) throw new Error('The unexpected-newer-storage safeguard did not pass.')

    stage = 'wrong-profile scope verification'
    const wrongProfileRejected = await verifyWrongProfileRejected(rawBackup, capture)
    if (!wrongProfileRejected) throw new Error('The wrong-profile safeguard did not pass.')

    stage = 'isolated browser external-network verification'
    if (unexpectedExternalNetworkAttempts) throw new Error('The isolated browser attempted unexpected network access.')

    stage = 'isolated browser candidate-resource verification'
    if (unmappedCandidateRequests) throw new Error('The candidate requested an unmapped same-origin resource.')

    stage = 'isolated browser error verification'
    if (browserErrors) throw new Error('The isolated browser reported an application error.')

    stage = 'privacy-safe evidence write'
    const evidence: Grade2RehearsalEvidence = {
      schema: GRADE2_REHEARSAL_EVIDENCE_SCHEMA,
      completedAt: new Date().toISOString(),
      candidateRevision: revision,
      applicationVersion: applicationVersion(),
      origin: capture.origin,
      backup: {
        fileName: downloadedBackup.suggestedFilename(),
        createdAt: exported.summary.createdAt,
        checksum: exported.checksum,
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
    const serializedEvidence = assertPrivacySafeEvidence(evidence, capture)
    writeFileSync(evidencePath, `${serializedEvidence}\n`, { flag: 'wx', mode: 0o600 })
    await context.close()

    process.stdout.write('Grade 2 disposable restore rehearsal passed.\n')
    process.stdout.write(`Candidate revision: ${revision}\n`)
    process.stdout.write(`Verified backup: ${basename(backupPath)}\n`)
    process.stdout.write(`Backup SHA-256: ${exported.checksum}\n`)
    process.stdout.write(`Privacy-safe evidence: ${basename(evidencePath)}\n`)
    process.stdout.write(
      'The private capture was not modified, no live storage was written, and page network access was blocked.\n',
    )
  } finally {
    await browser.close()
  }
}

run().catch(() => {
  process.stderr.write(
    `Grade 2 restore rehearsal stopped during ${stage}. No live browser data was changed and no private values were printed.\n`,
  )
  process.exitCode = 1
})
