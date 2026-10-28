import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import reviewed from '../../src/grade5RecognitionReview/source.json' with { type: 'json' }
import { installFamilyFixtures, type SyntheticFamilyDocuments } from '../family-sync/fixtures.ts'

const f = (page: Page) => page.frameLocator('iframe:visible')
async function setup(page: Page, documents: SyntheticFamilyDocuments) {
  await page.clock.setSystemTime(new Date('2026-10-27T19:00:00Z'))
  await installFamilyFixtures(page, documents, 'ninja-device-fixture@example.invalid')
  await page.context().route('**/curriculum/beta/*.json', (route) => {
    const slug = new URL(route.request().url()).pathname.split('/').pop()!
    return route.fulfill({ json: JSON.parse(readFileSync(`tests/fixtures/game-content-2026-10-26/${slug}`, 'utf8')) })
  })
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('playing'))
      setTimeout(() => this.dispatchEvent(new Event('ended')), 10)
      return Promise.resolve()
    }
  })
}

test('all 50 reading answers reach the second device exactly once after an interrupted upload', async ({
  page,
  browser,
}) => {
  const documents: SyntheticFamilyDocuments = new Map()
  await setup(page, documents)
  let holdUpload = true
  await page
    .context()
    .route('**/firestore.googleapis.com/**/betaResults/**', (route) =>
      holdUpload && route.request().method() === 'PATCH' ? route.fulfill({ status: 503, json: {} }) : route.fallback(),
    )
  await page.goto('/family-beta-preview.html?grade=grade5')
  await f(page)
    .getByRole('button', { name: /Final Boss/ })
    .click({ timeout: 30000 })
  await f(page).getByRole('button', { name: 'Boss Test', exact: true }).click()
  await f(page).getByRole('button', { name: 'Reading Test', exact: true }).click()
  await expect(f(page).locator('.deferred-reading-collector')).toBeVisible()
  let count = 0
  while (await f(page).locator('.deferred-reading-collector').count()) {
    await f(page).getByRole('button', { name: 'Record my reading', exact: true }).click()
    await f(page).getByRole('button', { name: 'Continue without a recording', exact: true }).click()
    count++
    expect(count).toBeLessThanOrEqual(50)
  }
  expect(count).toBe(50)
  const rows = f(page).locator('.deferred-review-row')
  await expect(rows).toHaveCount(50)
  for (let i = 0; i < 50; i++) await rows.nth(i).getByRole('button', { name: 'Yes', exact: true }).click()
  await f(page).getByRole('button', { name: 'Submit final review' }).click()
  await expect.poll(() => [...documents.keys()].filter((k) => k.includes('/betaResults/')).length).toBe(0)
  await expect
    .poll(() =>
      page.evaluate(
        () => Object.keys(localStorage).filter((k) => k.startsWith('family-beta-preview-pending-v1:')).length,
      ),
    )
    .toBe(1)
  holdUpload = false
  await page.locator('summary').filter({ hasText: 'Parent controls' }).click()
  await page.getByRole('button', { name: 'Check syncing', exact: true }).click()
  await expect
    .poll(() => [...documents.keys()].filter((k) => k.includes('/betaResults/')).length, { timeout: 30000 })
    .toBe(1)
  await expect(page.getByRole('region', { name: /^(?:Device and syncing check|Family syncing)$/ })).toContainText('confirmed')
  const context = await browser.newContext()
  try {
    const other = await context.newPage()
    await setup(other, documents)
    await other.goto('/family-beta-preview.html?grade=grade5')
    await expect(f(other).getByRole('region', { name: 'Saved Ninja Record' })).toContainText('50/50', {
      timeout: 30000,
    })
    await f(other)
      .getByRole('button', { name: /Enter the Dojo/ })
      .click()
    await expect(f(other).locator('.learning-hub-word-list span')).toHaveText(reviewed.targets.map((t) => t.text))
    await expect(f(other).getByRole('button', { name: 'Coming soon', exact: true })).toBeDisabled()
    expect([...documents.keys()].filter((k) => k.includes('/betaResults/'))).toHaveLength(1)
  } finally {
    await context.close()
  }
})
