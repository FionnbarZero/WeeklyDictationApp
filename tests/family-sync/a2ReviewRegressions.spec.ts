import { createHash } from 'node:crypto'
import { expect, type Page, test } from '@playwright/test'
import { installFamilyFixtures, readGrade2Workspace } from './fixtures.ts'

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
  const skipTimer = frame.getByRole('button', { name: 'Skip Timer', exact: true })
  // Switching back to a retained week can reopen directly in its persisted
  // review phase. In that case there is no timer to skip; answer the review
  // that is already on screen.
  if (await skipTimer.count()) await skipTimer.click()
  await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
  // A retained-week switch can replace the visible iframe while the answer
  // transition is committing. Resolve the post-answer frame afresh rather
  // than holding a locator bound to the previous document.
  await expect
    .poll(async () => {
      const current = page.locator('iframe:visible').contentFrame()
      return (await current.locator('[role="timer"]').isVisible()) ||
        (await current.getByRole('button', { name: 'Done for today', exact: true }).count()) > 0
    })
    .toBe(true)
}

test('the newest reviewed Grade 2 checkpoint wins a delayed cross-device download after reopening', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-24T12:00:00-07:00'))
  await startWriting(page, 'grade2')
  const frame = page.frameLocator('iframe:visible')
  const key = 'family-beta-activity:synthetic-g2:lesson-workspace-v1'
  const digest = (value: string) => createHash('sha256').update(value).digest('hex')
  const baseKey = `family-beta-sync-base-v1:family-synthetic-parent:synthetic-g2:${digest(key)}`
  const read = () => page.evaluate((key) => localStorage.getItem(key)!, key)
  await answer(page)
  const older = await read()
  await page.clock.setFixedTime(new Date('2026-09-24T12:01:00-07:00'))
  await answer(page)
  const newer = await read()
  const newerActivity = Object.entries(JSON.parse(newer).records as Record<string, string>).find(([recordKey]) =>
    recordKey.startsWith('weekly-dictation-checkpoint-v1:activity:'),
  )
  expect(newerActivity).toBeDefined()
  await frame.getByRole('button', { name: 'Exit practice', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your paused work' })).toBeVisible()
  await expect(page.locator('iframe[data-family-slot]')).toHaveCount(1)
  // Keep this device's older atomic workspace, then expose the newer activity
  // partition from another device. No production requests are made.
  await page.evaluate(
    ({ key, baseKey, older }) => {
      localStorage.setItem(key, older)
      localStorage.setItem(baseKey, older)
      localStorage.removeItem(`${baseKey}:pending`)
    },
    { key, baseKey, older },
  )
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let requested = false
  await page.route('**/children/synthetic-g2/betaPractice?*', async (route) => {
    requested = true
    await gate
    const olderRecords = JSON.parse(older).records as Record<string, string>
    const newerRecords = Object.entries(JSON.parse(newer).records as Record<string, string>).filter(
      ([recordKey]) =>
        recordKey === 'weekly-dictation-history-v1' ||
        recordKey === 'weekly-dictation-checkpoint-v1' ||
        recordKey.startsWith('weekly-dictation-checkpoint-v1:activity:'),
    )
    const documents = newerRecords.map(([recordName, raw]) => {
      const payload = recordName.startsWith('weekly-dictation-checkpoint-v1:activity:')
        ? raw
        : olderRecords[recordName]
      const recordKey = `${key}:record:${encodeURIComponent(recordName)}`
      const record = {
        schema: 1,
        childId: 'synthetic-g2',
        key: recordKey,
        payload,
        generation: 2,
      }
      const fields = Object.fromEntries(
        Object.entries(record).map(([k, value]) => [
          k,
          typeof value === 'number' ? { integerValue: String(value) } : { stringValue: value },
        ]),
      )
      return {
        name: `projects/weeklydictationapp/databases/(default)/documents/families/family-synthetic-parent/children/synthetic-g2/betaPractice/${digest(recordKey)}`,
        updateTime: '2026-09-24T19:00:00.000Z',
        fields,
      }
    })
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ documents }) })
  })
  try {
    const reload = page.reload()
    await expect.poll(() => requested).toBe(true)
    expect(await read()).toBe(older)
    release()
    await reload
    await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 1_000 })
    const current = JSON.parse(await read()) as { records: Record<string, string> }
    expect(current.records[newerActivity![0]]).toBe(newerActivity![1])
    expect(await page.evaluate((key) => localStorage.getItem(key), baseKey)).toBe(older)
  } finally {
    release()
  }
})

test('offline token renewal preserves the initialized activity and retries later', async ({ page }) => {
  await startWriting(page)
  const frame = page.frameLocator('iframe:visible')
  await frame.locator('body').evaluate((body) => {
    body.dataset.reviewProbe = 'original'
  })
  const remaining = await frame.getByRole('timer').innerText()
  let attempts = 0
  let offline = true
  await page.route('https://securetoken.googleapis.com/**', (route) => {
    attempts++
    return offline
      ? route.abort('internetdisconnected')
      : route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            id_token: 'synthetic-renewed-token',
            refresh_token: 'synthetic-refresh',
            expires_in: '3600',
          }),
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
  await frame.locator('body').evaluate((body) => {
    body.dataset.reviewProbe = 'original'
  })
  const remaining = await frame.getByRole('timer').innerText()
  await page.getByLabel('Child profile').selectOption('synthetic-k')
  await expect(frame.getByRole('heading', { name: /Ready for your next/ })).toBeVisible()
  await page.route('**/curriculum/beta/grade5.json', (route) => route.abort('internetdisconnected'))
  await page.getByLabel('Child profile').selectOption('synthetic-g5')
  await expect(page.getByText(/Failed to fetch/)).toBeVisible()
  await expect(frame.locator('body')).toHaveAttribute('data-review-probe', 'original')
  await expect(frame.getByRole('timer')).toHaveText(remaining)
})

test('confirmed account invalidation still removes retained activities', async ({ page }) => {
  await startWriting(page)
  await page.route('https://securetoken.googleapis.com/**', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'USER_DISABLED' } }),
    }),
  )
  await page.evaluate(() => {
    const key = 'weekly-dictation-auth-v1'
    const auth = JSON.parse(localStorage.getItem(key)!)
    localStorage.setItem(key, JSON.stringify({ ...auth, expiresAt: Date.now(), refreshToken: 'synthetic-refresh' }))
    dispatchEvent(new Event('online'))
  })
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect(page.locator('iframe[data-family-slot]')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('weekly-dictation-auth-v1'))).toBeNull()
})

test('two retained Grade 2 weeks can both save reviewed answers without reopening', async ({ page }) => {
  await startWriting(page, 'grade2', '2026-09-21')
  await answer(page)
  const read = async () => (await page.evaluate(readGrade2Workspace))!.acquisitionProgressEnvelopes!
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
  // Finish distinct scored visits from both retained weeks. Neither completion
  // may replace the other week's checkpoint, result or recovery evidence.
  for (let i = 0; i < 2; i++) await answer(page)
  await page.frameLocator('iframe:visible').getByRole('button', { name: 'Done for today', exact: true }).click()
  await page.getByLabel('Practice week').selectOption('2026-09-14')
  for (let i = 0; i < 3; i++) await answer(page)
  await page.frameLocator('iframe:visible').getByRole('button', { name: 'Done for today', exact: true }).click()
  const results = () =>
    page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('family-beta-preview-results-v1:'))
        .map((key) => JSON.parse(localStorage.getItem(key)!)),
    )
  await expect.poll(async () => (await results()).length).toBe(2)
  const completed = await results()
  expect(new Set(completed.map((item) => item.id)).size).toBe(2)
  for (const item of completed)
    expect(item).toMatchObject({ childId: 'synthetic-g2', grade: 'Grade 2', correct: 1, attempted: 1 })
  await page.reload()
  await expect(page.frameLocator('iframe:visible').getByRole('heading', { name: /Ready for your next/ })).toBeVisible()
  expect(await results()).toEqual(completed)
  const reloaded = await read()
  expect(reloaded.find((item: { id: string }) => item.id === first.id).revision).toBeGreaterThan(first.revision)
  expect(reloaded.find((item: { id: string }) => item.id === second.id).revision).toBeGreaterThan(second.revision)
})
