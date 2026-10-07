import { expect, test } from '@playwright/test'
import { installFamilyFixtures } from './fixtures.ts'
import { makeResult } from '../../src/familyBeta/model.ts'
import { documentValue } from '../../src/firestoreClient.ts'

test('completed same-day attempts have separate graph points and older history loads only on request', async ({ page }) => {
  await installFamilyFixtures(page)
  const profile = { id: 'synthetic-g5', nickname: 'Synthetic', grade: 'Grade 5' as const, active: true }
  const records = Array.from({ length: 52 }, (_, i) => makeResult(profile,
    { id: `attempt-${String(i).padStart(3, '0')}`, activity: 'Writing Dojo', channel: 'writing', datasetIds: ['week-one'], correct: i % 3, attempted: 3 },
    new Date(Date.UTC(2026, 9, 6, 15, 59 - i))))
  let olderRequests = 0
  let latestRequests = 0
  await page.route('**/children/synthetic-g5/betaResults?*', route => {
    const older = new URL(route.request().url()).searchParams.has('pageToken')
    if (older) olderRequests++
    else latestRequests++
    const results = older ? records.slice(50) : records.slice(0, 50)
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      documents: results.map(result => ({ fields: Object.fromEntries(Object.entries(result).map(([key, value]) => [key, documentValue(value)])) })),
      ...(!older ? { nextPageToken: 'older-page' } : {}),
    }) })
  })
  await page.goto('/?grade=grade5')
  await expect(page.frameLocator('iframe:visible').getByRole('heading', { name: /Ready for your next/ })).toBeVisible()
  expect(olderRequests).toBe(0)
  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await expect(page.locator('[data-result-point]')).toHaveCount(50)
  await expect(page.getByText('Daily totals for this page', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Older attempts', exact: true }).click()
  await expect(page.locator('[data-result-point]')).toHaveCount(2)
  expect(olderRequests).toBe(1)
  const latestBefore = latestRequests
  await page.evaluate(() => dispatchEvent(new Event('online')))
  await expect.poll(() => latestRequests).toBeGreaterThan(latestBefore)
  expect(olderRequests).toBe(1)
  await expect(page.locator('[data-result-point]')).toHaveCount(2)
  await page.getByRole('button', { name: 'Latest attempts', exact: true }).click()
  await expect(page.locator('[data-result-point]')).toHaveCount(50)
  // Older pages are not copied into the primary browser result ledger.
  const cachedOlder = await page.evaluate(() => Object.keys(localStorage).filter(key => /results-v1:attempt-05[01]$/.test(key)))
  expect(cachedOlder).toEqual([])
})
