import assert from 'node:assert/strict'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  const origin = new URL(test.info().project.use.baseURL || process.env.GRADE5_REPAIRS_URL || 'http://127.0.0.1:5261')
    .origin
  await page
    .context()
    .route('**/*', (route) => (new URL(route.request().url()).origin === origin ? route.continue() : route.abort()))
  await page.clock.setFixedTime(new Date('2026-10-20T19:00:00Z'))
  await page.context().addInitScript(() => {
    const state = window as unknown as { grade5SpeechHold: boolean }
    state.grade5SpeechHold = false
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices() {
          return []
        },
        speak(u: SpeechSynthesisUtterance) {
          u.onstart?.({} as SpeechSynthesisEvent)
          if (!state.grade5SpeechHold) setTimeout(() => u.onend?.({} as SpeechSynthesisEvent), 5)
        },
      },
    })
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('playing'))
      setTimeout(() => this.dispatchEvent(new Event('ended')), 10)
      return Promise.resolve()
    }
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        async getUserMedia() {
          throw new DOMException('Synthetic denied microphone', 'NotAllowedError')
        },
      },
    })
  })
})

const stored = async (page: import('@playwright/test').Page) =>
  page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith('family-beta-acquisition-v1:'))),
  )

test('Grade 5 native Warmup enlarges its drawing boxes, pauses reports and exits directly', async ({ page }) => {
  await page.goto('/family-beta-preview.html?grade=grade5')
  const frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await frame.getByRole('button', { name: 'Learn to Write', exact: true }).click()
  await frame.getByRole('button', { name: 'Begin Warmup', exact: true }).click()
  const pads = frame.locator('.skywriting-scroll-cell svg')
  await expect(frame.getByRole('button', { name: 'Skip Timer', exact: true })).toBeEnabled()
  expect(await pads.count()).toBeGreaterThan(0)
  expect(await pads.count()).toBeLessThanOrEqual(4)
  for (const pad of await pads.all()) expect((await pad.boundingBox())!.width).toBeGreaterThan(175)
  await pads.last().scrollIntoViewIfNeeded()
  const before = await stored(page)
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  const input = page.getByLabel('What did you see or hear?')
  await expect(input).toBeFocused()
  await input.fill('Synthetic Grade 5 Warmup layout check. No child information.')
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  expect(await stored(page)).toEqual(before)
  await page.screenshot({ path: test.info().outputPath('grade5-large-warmup.png'), fullPage: true })
  await frame.getByRole('button', { name: 'Exit practice', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Learn to Write', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your paused work', exact: true })).toBeHidden()
  await expect(page.getByRole('navigation', { name: 'Family preview navigation' })).toHaveCount(0)
})

test('Grade 5 shared-target reading resumes its confirmed trial from either menu and survives a reload', async ({
  page,
}) => {
  await page.goto('/grade5-oct23-preview.html')
  const open = async (section: string) =>
    page
      .getByRole('region', { name: section, exact: true })
      .getByRole('button', { name: 'Return to Dojo · Reading', exact: true })
      .click()
  await open('Practice Your Ninja Skills')
  const current = page.locator('[data-report-activity="Reading practice"]')
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Record my reading', exact: true }).click()
    await page.getByRole('button', { name: 'Continue without recording', exact: true }).click()
    await page.getByRole('button', { name: /^(Yes|Continue)$/ }).click()
  }
  const phase = await current.getAttribute('data-report-phase')
  const target = await current.getAttribute('data-report-target')
  const before = await stored(page)
  assert.equal(Object.keys(before).length, 1)
  await page.getByRole('button', { name: 'Exit reading', exact: true }).click()
  await page.reload()
  await open('Final Boss Test')
  await expect(current).toHaveAttribute('data-report-phase', phase!)
  await expect(current).toHaveAttribute('data-report-target', target!)
  expect(await stored(page)).toEqual(before)
  await page.getByRole('button', { name: 'Exit reading', exact: true }).click()
  await expect(page.locator('.oct23-menu')).toBeVisible()
})

test('Grade 5 shared-target reading restarts interrupted comparison and advances only after confirmation', async ({
  page,
}) => {
  await page.goto('/grade5-oct23-preview.html')
  await page
    .getByRole('region', { name: 'Practice Your Ninja Skills', exact: true })
    .getByRole('button', { name: 'Return to Dojo · Reading', exact: true })
    .click()
  const before = await stored(page)
  await page.evaluate(() => {
    ;(window as unknown as { grade5SpeechHold: boolean }).grade5SpeechHold = true
  })
  await page.getByRole('button', { name: 'Record my reading', exact: true }).click()
  await page.getByRole('button', { name: 'Continue without recording', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Yes', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Restart playback', exact: true })).toBeVisible()
  expect(await stored(page)).toEqual(before)
  await page.evaluate(() => {
    ;(window as unknown as { grade5SpeechHold: boolean }).grade5SpeechHold = false
  })
  await page.getByRole('button', { name: 'Restart playback', exact: true }).click()
  await page.getByRole('button', { name: 'Yes', exact: true }).click()
  expect(await stored(page)).not.toEqual(before)
  await expect(page.getByRole('button', { name: 'Record my reading', exact: true })).toBeVisible()
})

test('Grade 5 stale zero-score Done cannot finalize another tab’s newer reading work', async ({ page, context }) => {
  await page.goto('/grade5-oct23-preview.html')
  const open = async (p: import('@playwright/test').Page) =>
    p
      .getByRole('region', { name: 'Practice Your Ninja Skills', exact: true })
      .getByRole('button', { name: 'Return to Dojo · Reading', exact: true })
      .click()
  await open(page)
  const other = await context.newPage()
  await other.goto('/grade5-oct23-preview.html')
  await open(other)
  for (let i = 0; i < 4; i++) {
    await other.getByRole('button', { name: 'Record my reading', exact: true }).click()
    await other.getByRole('button', { name: 'Continue without recording', exact: true }).click()
    await other.getByRole('button', { name: /^(Yes|Continue)$/ }).click()
  }
  const before = await stored(other)
  await page.getByRole('button', { name: 'Done for today', exact: true }).click()
  await expect(page.getByText(/This activity changed in another tab/)).toBeVisible()
  expect(await stored(other)).toEqual(before)
  await other.getByRole('button', { name: 'Record my reading', exact: true }).click()
  await other.getByRole('button', { name: 'Continue without recording', exact: true }).click()
  await other.getByRole('button', { name: /^(Yes|Continue)$/ }).click()
  expect(await stored(other)).not.toEqual(before)
  await other.close()
})

test('Grade 5 reading initialization failure keeps Report and Return usable and retries without clearing records', async ({
  page,
}) => {
  await page.goto('/grade5-oct23-preview.html')
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    let once = true
    Storage.prototype.setItem = function (key, value) {
      if (once && key.startsWith('family-beta-acquisition-v1:')) {
        once = false
        throw new DOMException('Synthetic full storage', 'QuotaExceededError')
      }
      return original.call(this, key, value)
    }
  })
  await page
    .getByRole('region', { name: 'Practice Your Ninja Skills', exact: true })
    .getByRole('button', { name: 'Return to Dojo · Reading', exact: true })
    .click()
  await expect(page.getByRole('button', { name: 'Retry opening reading', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Return to Grade 5 menu', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await page.getByLabel('What did you see or hear?').fill('Synthetic initialization failure — no child data.')
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  const before = await stored(page)
  await page.getByRole('button', { name: 'Retry opening reading', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Record my reading', exact: true })).toBeVisible()
  expect(Object.keys(await stored(page)).length).toBe(1)
  expect(Object.keys(before).length).toBe(0)
})
