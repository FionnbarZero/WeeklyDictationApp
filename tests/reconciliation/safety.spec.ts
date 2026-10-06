import { expect, test } from '@playwright/test'

test('an unavailable curriculum fails visibly and retries without placeholder lessons', async ({ page }) => {
  let unavailable = true
  await page.route('**/curriculum/beta/kindergarten.json', (route) =>
    unavailable ? route.fulfill({ status: 503, body: '{}' }) : route.continue(),
  )
  await page.goto('/family-beta-preview.html?grade=kindergarten')
  await expect(page.getByRole('alert')).toContainText('Curriculum update failed')
  await expect(page.locator('iframe')).toHaveCount(0)
  unavailable = false
  await page.getByRole('button', { name: 'Retry lessons' }).click()
  await expect(page.frameLocator('iframe').getByRole('heading', { name: /Ready for your next/ })).toBeVisible()
})

test('corrupt device results are preserved and never represented as successfully saved', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('family-beta-preview-results-v1', '{invalid'))
  await page.goto('/family-beta-preview.html?grade=kindergarten')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByText('Saving is not confirmed. Keep this browser’s data and retry.')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('family-beta-preview-results-v1'))).toBe('{invalid')
})

test('parent preview can promote and undo a grade, then reload the correct profile', async ({ page }) => {
  await page.goto('/family-beta-preview.html?grade=kindergarten')
  await page.getByRole('button', { name: 'Parent controls' }).click()
  await expect(page.getByText(/learner profiles are stored only in this browser/)).toBeVisible()
  page.on('dialog', (dialog) => dialog.accept())
  await page.getByLabel('Grade for Learner 1', { exact: true }).selectOption('Grade 2')
  await expect(page.getByLabel('Child profile')).toContainText('Learner 1 · Grade 2')
  await page.getByLabel('Grade for Learner 1', { exact: true }).selectOption('Kindergarten')
  await page.reload()
  await expect(page.getByLabel('Child profile')).toContainText('Learner 1 · Kindergarten')
  await expect(page.frameLocator('iframe').getByRole('heading', { name: /Ready for your next/ })).toBeVisible()
})
