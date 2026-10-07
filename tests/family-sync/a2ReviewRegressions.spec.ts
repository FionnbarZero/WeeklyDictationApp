import { expect, type Page, test } from '@playwright/test'
import { installFamilyFixtures } from './fixtures.ts'

test.beforeEach(async ({ page }) => installFamilyFixtures(page))

async function startWriting(page: Page, slug = 'grade5', week?: string) {
  await page.goto(`/?grade=${slug}`)
  if (week) await page.getByLabel('Practice week').selectOption(week)
  await enterWriting(page)
}

async function enterWriting(page: Page) {
  const frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await frame.getByRole('button', { name: 'Learn to Write', exact: true }).click()
  await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
  await frame.getByRole('button', { name: 'Pause', exact: true }).click()
}

async function answer(page: Page) {
  const frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
  await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
  await expect(frame.getByRole('timer')).toBeVisible()
}

test('offline token renewal preserves the initialized activity and retries later', async ({ page }) => {
  await startWriting(page)
  const frame = page.frameLocator('iframe:visible')
  await frame.locator('body').evaluate((body) => { body.dataset.reviewProbe = 'original' })
  const remaining = await frame.getByRole('timer').innerText()
  let attempts = 0
  let offline = true
  await page.route('https://securetoken.googleapis.com/**', route => {
    attempts++
    return offline ? route.abort('internetdisconnected') : route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ id_token: 'synthetic-renewed-token', refresh_token: 'synthetic-refresh', expires_in: '3600' }),
    })
  })
  await page.evaluate(() => {
    const key = 'weekly-dictation-auth-v1'
    const auth = JSON.parse(localStorage.getItem(key)!)
    localStorage.setItem(key, JSON.stringify({ ...auth, expiresAt: Date.now(), refreshToken: 'synthetic-refresh' }))
    dispatchEvent(new Event('online'))
  })
  await expect.poll(() => attempts).toBeGreaterThan(0)
  await expect(page.getByText(/Online saving is unavailable/)).toBeVisible()
  await expect(frame.locator('body')).toHaveAttribute('data-review-probe', 'original')
  await expect(frame.getByRole('timer')).toHaveText(remaining)
  offline = false
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click()
  await expect(page.getByText(/Scores and saved practice confirmed/)).toBeVisible()
  await expect(frame.locator('body')).toHaveAttribute('data-review-probe', 'original')
})

test('returning to a previously loaded grade works while curriculum is offline', async ({ page }) => {
  await startWriting(page)
  const frame = page.frameLocator('iframe:visible')
  await frame.locator('body').evaluate((body) => { body.dataset.reviewProbe = 'original' })
  const remaining = await frame.getByRole('timer').innerText()
  await page.getByLabel('Child profile').selectOption('synthetic-k')
  await expect(frame.getByRole('heading', { name: /Ready for your next/ })).toBeVisible()
  await page.route('**/curriculum/beta/grade5.json', route => route.abort('internetdisconnected'))
  await page.getByLabel('Child profile').selectOption('synthetic-g5')
  await expect(page.getByText(/Failed to fetch/)).toBeVisible()
  await expect(frame.locator('body')).toHaveAttribute('data-review-probe', 'original')
  await expect(frame.getByRole('timer')).toHaveText(remaining)
})

test('two retained Grade 2 weeks can both save reviewed answers without reopening', async ({ page }) => {
  await startWriting(page, 'grade2', '2026-09-21')
  await answer(page)
  const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('family-beta-activity:synthetic-g2:weekly-dictation-state-v2')!).acquisitionProgressEnvelopes)
  const first = (await read())[0]
  await page.getByLabel('Practice week').selectOption('2026-09-14')
  await enterWriting(page)
  await answer(page)
  const second = (await read()).find((item: { id: string }) => item.id !== first.id)
  expect(second).toBeTruthy()
  await page.getByLabel('Practice week').selectOption('2026-09-21')
  await answer(page)
  await expect(page.frameLocator('iframe:visible').getByText(/Progress could not be saved/)).toHaveCount(0)
  const saved = await read()
  expect(saved.find((item: { id: string }) => item.id === first.id).revision).toBeGreaterThan(first.revision)
  expect(saved.find((item: { id: string }) => item.id === second.id)).toEqual(second)
})
