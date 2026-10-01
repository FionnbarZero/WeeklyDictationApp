import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 }, permissions: [] })

async function openFinalBoss(page: import('@playwright/test').Page, activity: 'Writing Test' | 'Reading Test') {
  await page.goto('/kindergarten-learning-lab.html')
  await page.getByRole('button', { name: /The Final Boss Test/ }).click()
  await page.getByRole('button', { name: activity, exact: true }).click()
}

async function collectWritingResponses(page: import('@playwright/test').Page) {
  for (let index = 0; index < 14; index += 1) {
    await page.getByRole('button', { name: 'Skip Timer' }).click()
  }
}

test('Kindergarten writing Final Boss retains Sky Writing and opens an unobscured final review', async ({ page }) => {
  await openFinalBoss(page, 'Writing Test')
  const pad = page.getByRole('img', { name: 'Blank word drawing pad' })
  const bounds = await pad.boundingBox()
  expect(bounds).not.toBeNull()
  await page.mouse.move(bounds!.x + bounds!.width * .25, bounds!.y + bounds!.height * .3)
  await page.mouse.down()
  await page.mouse.move(bounds!.x + bounds!.width * .7, bounds!.y + bounds!.height * .7, { steps: 5 })
  await page.mouse.up()
  await expect(page.getByRole('img', { name: 'Your word drawing' })).toBeVisible()

  await collectWritingResponses(page)

  await expect(page.getByRole('heading', { name: /Review everything/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Exit without saving' })).toBeInViewport()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)

  const rows = page.locator('.deferred-review-row')
  await expect(rows).toHaveCount(14)
  await expect(rows.first().locator('.skywriting-stroke')).toHaveCount(1)
  await expect(rows.first().getByText('一', { exact: true })).toBeVisible()
  const lastRow = await rows.last().boundingBox()
  const submitBar = await page.locator('.deferred-submit-bar').boundingBox()
  expect(lastRow).not.toBeNull()
  expect(submitBar).not.toBeNull()
  expect(submitBar!.y).toBeGreaterThanOrEqual(lastRow!.y + lastRow!.height)
})

test('Kindergarten writing Final Boss submits one mixed final score', async ({ page }) => {
  await openFinalBoss(page, 'Writing Test')
  await collectWritingResponses(page)

  const rows = page.locator('.deferred-review-row')
  for (let index = 0; index < 14; index += 1) {
    await rows.nth(index).getByRole('button', { name: index % 2 === 0 ? 'Yes' : 'Not yet' }).click()
  }
  await page.getByRole('button', { name: 'Submit final review' }).click()

  await expect(page.getByText('Final Boss complete: 7/14.')).toBeVisible()
  await expect(page.getByText('7 of 14 correct')).toBeVisible()
})

test('Kindergarten Final Boss confirms before discarding an unfinished response', async ({ page }) => {
  await openFinalBoss(page, 'Writing Test')
  await page.getByRole('button', { name: 'Skip Timer' }).click()
  await page.getByRole('button', { name: 'Exit without saving' }).click()

  const confirmation = page.getByRole('dialog', { name: 'Exit without saving?' })
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole('button', { name: 'Keep working' }).click()
  await expect(page.getByText('Writing responses · 2 of 14')).toBeVisible()

  await page.getByRole('button', { name: 'Exit without saving' }).click()
  await confirmation.getByRole('button', { name: 'Exit without saving' }).click()
  await expect(page.getByRole('heading', { name: /Ready for your next adventure/ })).toBeVisible()
  await expect(page.getByText('No scores yet')).toBeVisible()
})

test('Kindergarten reading Final Boss defers microphone fallbacks to one final review', async ({ page }) => {
  await openFinalBoss(page, 'Reading Test')
  await expect(page.getByText('Reading responses · 1 of 9')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Yes' })).toHaveCount(0)

  for (let index = 0; index < 9; index += 1) {
    await page.getByRole('button', { name: 'Record my reading' }).click()
    await expect(page.getByText('Microphone recording is unavailable.')).toBeVisible()
    await page.getByRole('button', { name: 'Continue without a recording' }).click()
  }

  await expect(page.getByRole('heading', { name: /Review everything/ })).toBeVisible()
  const rows = page.locator('.deferred-review-row')
  await expect(rows).toHaveCount(9)
  for (let index = 0; index < 9; index += 1) {
    await rows.nth(index).getByRole('button', { name: index < 5 ? 'Yes' : 'Not yet' }).click()
  }
  await page.getByRole('button', { name: 'Submit final review' }).click()

  await expect(page.getByText('Final Boss Reading Test complete: 5/9.')).toBeVisible()
  await expect(page.getByText('5 of 9 correct')).toBeVisible()
})
