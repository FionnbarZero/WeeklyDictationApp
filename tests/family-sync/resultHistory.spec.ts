import { expect, test } from '@playwright/test'
import { makeResult } from '../../src/familyBeta/model.ts'
import { documentValue } from '../../src/firestoreClient.ts'
import { installFamilyFixtures } from './fixtures.ts'

test('completed same-day attempts have separate graph points and older history loads only on request', async ({
  page,
}) => {
  await installFamilyFixtures(page)
  const profile = { id: 'synthetic-g5', nickname: 'Synthetic', grade: 'Grade 5' as const, active: true }
  const records = Array.from({ length: 52 }, (_, i) =>
    makeResult(
      profile,
      {
        id: `attempt-${String(i).padStart(3, '0')}`,
        activity: 'Writing Dojo',
        channel: 'writing',
        datasetIds: ['week-one'],
        correct: i % 3,
        attempted: 3,
      },
      new Date(Date.UTC(2026, 9, 6, 15, 59 - i)),
    ),
  )
  let olderRequests = 0
  let latestRequests = 0
  let failOlder = true
  await page.route('**/children/synthetic-g5:runQuery', (route) => {
    const older = Boolean(route.request().postDataJSON().structuredQuery.startAt)
    if (older) olderRequests++
    else latestRequests++
    if (older && failOlder) return route.fulfill({ status: 503, body: '{}' })
    const results = older ? records.slice(50) : records.slice(0, 51)
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        results.map((result) => ({
          document: {
            fields: Object.fromEntries(Object.entries(result).map(([key, value]) => [key, documentValue(value)])),
          },
        })),
      ),
    })
  })
  await page.goto('/?grade=grade5')
  await expect(page.frameLocator('iframe:visible').getByRole('heading', { name: /Ready for your next/ })).toBeVisible()
  expect(olderRequests).toBe(0)
  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await expect(page.locator('[data-result-point]')).toHaveCount(50)
  await expect(page.getByText('Daily totals for this page', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Older attempts', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('The current page and saved records are unchanged')
  await expect(page.locator('[data-result-point]')).toHaveCount(50)
  failOlder = false
  await page.getByRole('button', { name: 'Older attempts', exact: true }).click()
  await expect(page.locator('[data-result-point]')).toHaveCount(2)
  expect(olderRequests).toBe(2)
  const latestBefore = latestRequests
  await page.evaluate(() => dispatchEvent(new Event('online')))
  await expect.poll(() => latestRequests).toBeGreaterThan(latestBefore)
  expect(olderRequests).toBe(2)
  await expect(page.locator('[data-result-point]')).toHaveCount(2)
  await page.getByRole('button', { name: 'Latest attempts', exact: true }).click()
  await expect(page.locator('[data-result-point]')).toHaveCount(50)
  // Older pages are not copied into the primary browser result ledger.
  const cachedOlder = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) => /results-v1:attempt-05[01]$/.test(key)),
  )
  expect(cachedOlder).toEqual([])
})

test('a delayed older-history response cannot appear under a different child', async ({ page }) => {
  await installFamilyFixtures(page)
  const result = makeResult(
    { id: 'synthetic-g5', nickname: 'Synthetic', grade: 'Grade 5', active: true },
    {
      id: 'grade5-only',
      activity: 'Writing Dojo',
      channel: 'writing',
      datasetIds: ['week-one'],
      correct: 1,
      attempted: 2,
    },
    new Date('2026-10-06T15:00:00.000Z'),
  )
  const document = {
    fields: Object.fromEntries(Object.entries(result).map(([key, value]) => [key, documentValue(value)])),
  }
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let requested = false
  await page.route('**/children/synthetic-g5:runQuery', async (route) => {
    const older = Boolean(route.request().postDataJSON().structuredQuery.startAt)
    if (older) {
      requested = true
      await gate
    }
    await route
      .fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          older
            ? [{ document }]
            : Array.from({ length: 51 }, (_, i) => ({
                document: {
                  fields: { ...document.fields, id: documentValue(`grade5-${String(50 - i).padStart(3, '0')}`) },
                },
              })),
        ),
      })
      .catch(() => {})
  })
  try {
    await page.goto('/?grade=grade5')
    await expect(
      page.frameLocator('iframe:visible').getByRole('heading', { name: /Ready for your next/ }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Progress', exact: true }).click()
    await page.getByRole('button', { name: 'Older attempts', exact: true }).click()
    await expect.poll(() => requested).toBe(true)
    await page.getByLabel('Child profile').selectOption('synthetic-g2')
    await expect(page.getByRole('heading', { name: 'Grade 2’s progress', exact: true })).toBeVisible()
    release()
    await expect(page.getByText('No completed scores yet.', { exact: true })).toBeVisible()
    await expect(page.locator('[data-result-point]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Latest attempts', exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally {
    release()
  }
})
