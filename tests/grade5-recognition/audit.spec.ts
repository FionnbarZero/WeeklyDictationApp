import { expect, type Page, test } from '@playwright/test'
import reviewed from '../../src/grade5RecognitionReview/source.json' with { type: 'json' }
import { futureSnapshot, snapshot } from '../automatic-curriculum/fixtures.ts'

const f = (page: Page) => page.frameLocator('iframe:visible')
const current = (page: Page) => page.locator('iframe:visible')
const endpoint = '**/weekly-dictation-curriculum-*/curriculum/beta/grade5.json'
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.setSystemTime(new Date('2026-11-04T19:00:00Z'))
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('playing'))
      setTimeout(() => this.dispatchEvent(new Event('ended')), 10)
      return Promise.resolve()
    }
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(new DOMException('Test denied', 'NotAllowedError')) },
    })
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices: () => [],
        speak(u: SpeechSynthesisUtterance) {
          u.onstart?.({} as SpeechSynthesisEvent)
          setTimeout(() => u.onend?.({} as SpeechSynthesisEvent), 5)
        },
      },
    })
  })
})

test('assessment week keeps the owner’s 50-word review when the teacher baseline refreshes', async ({ page }) => {
  let live = snapshot('grade5')
  await page.route(endpoint, (route) => route.fulfill({ json: live }))
  await page.goto('/family-beta-preview.html?grade=grade5')
  await f(page)
    .getByRole('button', { name: /Enter the Dojo/ })
    .click({ timeout: 30000 })
  await expect(f(page).locator('.learning-hub-word-list span')).toHaveText(reviewed.targets.map((row) => row.text))
  live = futureSnapshot('grade5')
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('family-beta-validated-automatic-curriculum-v1:Grade 5') || '{}')
            .contentSha256,
      ),
    )
    .toBe(live.contentSha256)
  await expect(current(page)).toHaveAttribute('data-family-curriculum', live.contentSha256)
  await expect(current(page)).toHaveAttribute('data-family-week', '2026-10-26')
  const enter = f(page).getByRole('button', { name: /Enter the Dojo/ })
  if (await enter.isVisible()) await enter.click()
  await expect(f(page).locator('.learning-hub-word-list span')).toHaveText(reviewed.targets.map((row) => row.text))
  await expect(f(page).getByRole('button', { name: 'Coming soon', exact: true })).toBeDisabled()
})

test('unfinished manual reading survives a changed teacher source, Exit and reload', async ({ page }) => {
  let live = snapshot('grade5')
  await page.route(endpoint, (route) => route.fulfill({ json: live }))
  await page.goto('/family-beta-preview.html?grade=grade5')
  await f(page)
    .getByRole('button', { name: /Enter the Dojo/ })
    .click({ timeout: 30000 })
  await f(page).getByRole('button', { name: 'Read the Words', exact: true }).click()
  await f(page).getByRole('button', { name: 'Record my reading', exact: true }).click()
  await f(page).getByRole('button', { name: 'Continue without recording', exact: true }).click()
  await f(page).getByRole('button', { name: 'Yes', exact: true }).click()
  const practice = f(page).locator('.reading-practice-page')
  const target = await practice.getAttribute('data-report-target'),
    phase = await practice.getAttribute('data-report-phase'),
    slot = await current(page).getAttribute('data-family-slot')
  live = futureSnapshot('grade5')
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('family-beta-validated-automatic-curriculum-v1:Grade 5') || '{}')
            .contentSha256,
      ),
    )
    .toBe(live.contentSha256)
  await expect(current(page)).toHaveAttribute('data-family-slot', slot!)
  await expect(practice).toHaveAttribute('data-report-target', target!)
  await f(page).getByRole('button', { name: 'Exit reading', exact: true }).click()
  await page.reload()
  await f(page)
    .getByRole('button', { name: /Enter the Dojo/ })
    .click({ timeout: 30000 })
  await f(page).getByRole('button', { name: 'Read the Words', exact: true }).click()
  await expect(f(page).locator('.reading-practice-page')).toHaveAttribute('data-report-target', target!)
  await expect(f(page).locator('.reading-practice-page')).toHaveAttribute('data-report-phase', phase!)
})
