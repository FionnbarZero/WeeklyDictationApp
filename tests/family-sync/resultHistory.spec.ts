import { expect, type Page, test } from '@playwright/test'
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
  let failLatest = false
  await page.route('**/children/synthetic-g5:runQuery', (route) => {
    const older = Boolean(route.request().postDataJSON().structuredQuery.startAt)
    if (older) olderRequests++
    else latestRequests++
    if (older && failOlder) return route.fulfill({ status: 503, body: '{}' })
    if (!older && failLatest) return route.fulfill({ status: 503, body: '{}' })
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
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath('history.png') })
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
  // A background outage cannot replace the older page or reuse its remote cursor for local history.
  failLatest = true
  await page.evaluate(() => dispatchEvent(new Event('online')))
  await expect(page.getByRole('alert')).toContainText('Saved results could not be loaded')
  await expect(page.locator('[data-result-point]')).toHaveCount(2)
  await page.getByRole('button', { name: 'Latest attempts', exact: true }).click()
  await expect(page.locator('[data-result-point]')).toHaveCount(50)
  await expect(page.getByText(/Showing records saved on this device/)).toBeVisible()
  // Older pages are not copied into the primary browser result ledger.
  const cachedOlder = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) => /results-v1:attempt-05[01]$/.test(key)),
  )
  expect(cachedOlder).toEqual([])
})

const historyProfile = { id: 'synthetic-g5', nickname: 'Synthetic', grade: 'Grade 5' as const, active: true }
const historyRecords = Array.from({ length: 150 }, (_, i) =>
  makeResult(
    historyProfile,
    {
      id: `review-${String(i).padStart(3, '0')}`,
      activity: 'Writing Dojo',
      channel: 'writing',
      datasetIds: ['week-one'],
      correct: 1,
      attempted: 2,
    },
    new Date(Date.UTC(2026, 9, 6, 23) - i * 60000),
  ),
)

async function installLongHistory(page: Page, conflict?: 'keyed' | 'legacy') {
  await installFamilyFixtures(page)
  await page.addInitScript(
    ({ records, conflict }) => {
      for (const result of records) {
        const stored = conflict === 'keyed' && result.id === 'review-070' ? { ...result, correct: 2 } : result
        localStorage.setItem(`family-beta-preview-results-v1:${result.id}`, JSON.stringify(stored))
      }
      if (conflict === 'legacy')
        localStorage.setItem('family-beta-preview-results-v1', JSON.stringify([{ ...records[70], correct: 2 }]))
    },
    { records: historyRecords, conflict },
  )
  const control = { offline: false }
  await page.route('**/children/synthetic-g5:runQuery', (route) => {
    if (control.offline) return route.fulfill({ status: 503, body: '{}' })
    const query = route.request().postDataJSON().structuredQuery
    const boundary = query.startAt?.values[0]?.stringValue
    const selected = historyRecords.filter((result) => !boundary || result.completedAt < boundary).slice(0, query.limit)
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        selected.map((result) => ({
          document: {
            fields: Object.fromEntries(Object.entries(result).map(([key, value]) => [key, documentValue(value)])),
          },
        })),
      ),
    })
  })
  await page.goto('/?grade=grade5')
  await expect(page.frameLocator('iframe:visible').getByRole('heading', { name: /Ready for your next/ })).toBeVisible()
  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await expect(page.locator('[data-result-point]')).toHaveCount(50)
  return control
}

test('local older history keeps its source and boundary across reconnect, new arrivals and read failure', async ({
  page,
}) => {
  const control = await installLongHistory(page)
  control.offline = true
  await page.evaluate(() => dispatchEvent(new Event('online')))
  await expect(page.getByRole('alert')).toContainText('Saved results could not be loaded')
  await page.getByRole('button', { name: 'Older attempts', exact: true }).click()
  await expect(page.locator('[data-result-point="review-050"]')).toHaveCount(1)
  control.offline = false
  await page.evaluate(() => dispatchEvent(new Event('online')))
  await expect(page.getByText(/Scores, saved practice, and game detail confirmed/)).toBeVisible()
  await expect(page.locator('[data-result-point="review-050"]')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Older attempts', exact: true })).toBeVisible()
  await page.evaluate(
    (newArrival) => {
      localStorage.setItem(`family-beta-preview-results-v1:${newArrival.id}`, JSON.stringify(newArrival))
      const original = Storage.prototype.getItem
      Storage.prototype.getItem = function (key) {
        if (key === 'family-beta-preview-results-v1') {
          Storage.prototype.getItem = original
          throw new Error('Synthetic history read failure')
        }
        return original.call(this, key)
      }
    },
    { ...historyRecords[0], id: 'new-arrival', completedAt: '2026-10-06T23:00:01.000Z' },
  )
  await page.getByRole('button', { name: 'Older attempts', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Synthetic history read failure')
  await expect(page.locator('[data-result-point="review-050"]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Older attempts', exact: true }).click()
  await expect(page.locator('[data-result-point="review-100"]')).toHaveCount(1)
  await expect(page.locator('[data-result-point]')).toHaveCount(50)
  await expect(page.locator('[data-result-point="review-099"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Older attempts', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Latest attempts', exact: true }).click()
  await expect(page.locator('[data-result-point="review-000"]')).toHaveCount(1)
  await expect(page.getByText(/Showing records saved on this device/)).toHaveCount(0)
})

for (const conflict of ['keyed', 'legacy'] as const) {
  test(`older online history rejects a conflicting ${conflict} copy without changing the ledger`, async ({ page }) => {
    await installLongHistory(page, conflict)
    const ledger = () =>
      page.evaluate(() =>
        Object.fromEntries(
          Object.entries(localStorage).filter(([key]) => key.startsWith('family-beta-preview-results-v1')),
        ),
      )
    const before = await ledger()
    await page.getByRole('button', { name: 'Older attempts', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Both copies are preserved')
    await expect(page.locator('[data-result-point="review-000"]')).toHaveCount(1)
    await expect(page.locator('[data-result-point="review-070"]')).toHaveCount(0)
    expect(await ledger()).toEqual(before)
    await page.getByRole('button', { name: 'Older attempts', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Both copies are preserved')
    expect(await ledger()).toEqual(before)
  })
}

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
