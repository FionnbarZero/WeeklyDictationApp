import { expect, test, type Page } from '@playwright/test'
import { grades, installFamilyFixtures } from './fixtures.ts'

test.beforeEach(async ({ page }) => installFamilyFixtures(page))

async function writing(page: Page, slug: string) {
  await page.goto(`/?grade=${slug}`)
  if (slug === 'grade2') {
    page.on('dialog', d => d.accept())
    await page.getByLabel('Practice week').selectOption('2026-09-21')
  }
  const frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await frame.getByRole('button', { name: slug === 'kindergarten' ? 'Writing characters' : 'Learn to Write', exact: true }).click()
  if (slug !== 'kindergarten') await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
  await expect(frame.getByRole('timer')).toBeVisible()
  await expect(frame.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
  return frame
}

for (const [slug, grade] of grades) {
  test(`${grade}: report pauses the current timer and closing resumes it`, async ({ page }) => {
    const frame = await writing(page, slug)
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    const remaining = await frame.getByRole('timer').innerText()
    await page.waitForTimeout(2200)
    await expect(frame.getByRole('timer')).toHaveText(remaining)
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await expect(frame.getByRole('timer')).not.toHaveText(remaining)
  })

  test(`${grade}: navigation preserves the same activity and temporary handwriting`, async ({ page }) => {
    const frame = await writing(page, slug)
    await frame.locator('body').evaluate(body => { body.dataset.continuityProbe = 'same-document' })
    await page.getByRole('button', { name: 'Progress', exact: true }).click()
    await page.waitForTimeout(1200)
    await page.getByRole('button', { name: 'Activities', exact: true }).click()
    await expect(frame.locator('body')).toHaveAttribute('data-continuity-probe', 'same-document')
    await expect(frame.getByRole('timer')).toBeVisible()
  })

  test(`${grade}: a sync failure keeps the activity available and reviewed work queued`, async ({ page }) => {
    const frame = await writing(page, slug)
    await frame.locator('body').evaluate(body => { body.dataset.continuityProbe = 'same-document' })
    await page.route('**/firestore.googleapis.com/**', route => route.abort('internetdisconnected'))
    await frame.locator('body').evaluate(() => parent.postMessage({ type: 'family-beta-result-ready' }, location.origin))
    await expect(page.getByRole('alert').first()).toBeVisible()
    await expect(frame.locator('body')).toHaveAttribute('data-continuity-probe', 'same-document')
    await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
    await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
    const checkpoints = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('family-beta-acquisition-v1:')))
    expect(checkpoints.length).toBeGreaterThan(0)
  })
}
