import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.ts'
import { installGrade2CurriculumFixture } from './grade2Curriculum.ts'

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

test('Grade 2 exports a verified backup and previews it without writing browser state', async ({ page }) => {
  await installGrade2CurriculumFixture(page)
  await page.goto('/?testDate=2026-09-29')
  await expect(page.locator('.curriculum-source-status')).toContainText('Loaded 4 weekly datasets')

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

  await expect(page.getByLabel('Selected profile restore report')).toContainText('Other-profile records')
  await page.getByRole('checkbox', { name: /Restore only the selected Grade 2 profile/i }).check()
  const safetyDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Apply selected-profile restore' }).click()
  const safetyDownload = await safetyDownloadPromise
  expect(safetyDownload.suggestedFilename()).toMatch(/^weekly-dictation-grade2-pre-restore-backup-.*\.json$/)
  await expect(page.locator('.backup-message')).toContainText(/Restore complete|already matched the backup/)
  const after = await storedValues(page)
  expect(after['weekly-dictation-state-v2']).toBe(before['weekly-dictation-state-v2'])
  expect(JSON.parse(after['weekly-dictation-acquisition-pending-v1'] || '{}')).toEqual({ version: 1, entries: [] })
  expect(JSON.parse(after['weekly-dictation-warmup-pending-v1'] || '{}')).toEqual({ version: 1, entries: [] })
})
