import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from './fixtures.ts'

const storageKeys = [
  'weekly-dictation-state-v2',
  'weekly-dictation-acquisition-pending-v1',
  'weekly-dictation-warmup-pending-v1',
] as const

async function storedValues(page: import('@playwright/test').Page) {
  return page.evaluate(
    (keys) => Object.fromEntries(keys.map((key) => [key, window.localStorage.getItem(key)])),
    storageKeys,
  )
}

test('a browser storage failure is visible before more local practice continues', async ({ page }) => {
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'weekly-dictation-state-v2') throw new DOMException('Injected quota failure', 'QuotaExceededError')
      return setItem.call(this, key, value)
    }
  })
  await page.goto('/?testDate=2026-09-29')
  await expect(page.getByRole('alert')).toContainText('Progress could not be saved in this browser')
  await expect(page.getByRole('alert')).toContainText('download a backup before continuing')
})

test('Grade 2 exports a verified backup and previews it without writing browser state', async ({ page }) => {
  await page.goto('/?testDate=2026-09-29')
  await page.getByLabel('Import deck JSON').setInputFiles(path.resolve('tests/fixtures/grade2-presentation.json'))
  await expect(page.locator('.local-import-status')).toContainText('Validated 4 weekly datasets')

  const before = await storedValues(page)
  await page.getByRole('button', { name: 'Back up Grade 2 browser data' }).click()
  await expect(page.getByRole('heading', { name: 'Protect browser progress' })).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download backup' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^weekly-dictation-grade2-backup-.*\.json$/)
  const downloadedPath = await download.path()
  expect(downloadedPath).toBeTruthy()
  const raw = await readFile(downloadedPath!, 'utf8')
  const parsed = JSON.parse(raw)
  expect(parsed.schema).toBe('weekly-dictation-verified-backup-v1')
  expect(parsed.checksum.algorithm).toBe('SHA-256')
  expect(parsed.checksum.value).toMatch(/^[a-f0-9]{64}$/)
  expect(parsed.payload.scope.dataScope).toBe('whole-local-practice-state')

  await page.getByLabel('Select a Grade 2 backup to preview').setInputFiles(downloadedPath!)
  await expect(page.getByRole('heading', { name: 'Restore preview verified' })).toBeVisible()
  await expect(page.getByText('No browser data was changed.')).toBeVisible()
  await expect(page.locator('.backup-preview')).toContainText('Whole local practice state')
  await expect(page.locator('.backup-preview')).toContainText('Current Grade 2 profile matched')
  await expect(page.getByText('Datasets', { exact: true }).locator('..')).toContainText('4')
  expect(await storedValues(page)).toEqual(before)

  await page.getByRole('button', { name: 'Close progress protection' }).click()
  await page.evaluate(() => {
    const key = 'weekly-dictation-state-v2'
    const state = JSON.parse(window.localStorage.getItem(key) || '{}')
    const record = (childId: string) => ({
      id: `post-backup-${childId}`,
      childId,
      legacySet: 'current',
      termId: `term-${childId}`,
      sessionId: `session-${childId}`,
      completedAt: '2026-10-01T12:00:00.000Z',
      correct: true,
      revealMethod: 'timer',
      note: 'legacy-date-range-unknown',
    })
    state.legacyRecords = [...state.legacyRecords, record('learner-a'), record('learner-b')]
    window.localStorage.setItem(key, JSON.stringify(state))
  })
  await page.reload()
  await page.getByRole('button', { name: 'Back up Grade 2 browser data' }).click()
  await page.getByLabel('Select a Grade 2 backup to preview').setInputFiles(downloadedPath!)
  await expect(page.getByRole('heading', { name: 'Restore preview verified' })).toBeVisible()
  await expect(page.getByLabel('Selected profile restore report')).toContainText('Other-profile records')
  const safetyDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download pre-restore backup' }).click()
  const safetyDownload = await safetyDownloadPromise
  expect(safetyDownload.suggestedFilename()).toMatch(/^weekly-dictation-grade2-pre-restore-backup-.*\.json$/)
  await page.getByRole('checkbox', { name: /I saved the pre-restore backup/i }).check()
  await page.getByRole('checkbox', { name: /Restore only the selected Grade 2 profile/i }).check()
  await page.getByRole('button', { name: 'Apply selected-profile restore' }).click()
  await expect(page.locator('.backup-message')).toContainText(/Restore complete|already matched the backup/)
  const after = await storedValues(page)
  const restoredState = JSON.parse(after['weekly-dictation-state-v2'] || '{}')
  expect(restoredState.legacyRecords.some((record: { id: string }) => record.id === 'post-backup-learner-a')).toBe(
    false,
  )
  expect(restoredState.legacyRecords.some((record: { id: string }) => record.id === 'post-backup-learner-b')).toBe(true)
  expect(JSON.parse(after['weekly-dictation-acquisition-pending-v1'] || '{}')).toEqual({ version: 1, entries: [] })
  expect(JSON.parse(after['weekly-dictation-warmup-pending-v1'] || '{}')).toEqual({ version: 1, entries: [] })
})
