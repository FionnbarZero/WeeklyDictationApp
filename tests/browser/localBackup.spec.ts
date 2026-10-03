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

  await page.getByLabel('Select a Grade 2 backup to preview').setInputFiles(downloadedPath!)
  await expect(page.getByRole('heading', { name: 'Restore preview verified' })).toBeVisible()
  await expect(page.getByText('No browser data was changed.')).toBeVisible()
  await expect(page.locator('.backup-preview dl div').filter({ hasText: 'Datasets' })).toContainText('4')
  expect(await storedValues(page)).toEqual(before)
})
