import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'

const frame = (page: Page) => page.frameLocator('iframe:visible')
const errors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page, context }) => {
  errors.set(page, [])
  page.on('pageerror', (e) => errors.get(page)!.push(e.message))
  await page.clock.setSystemTime(new Date('2026-10-26T19:00:00Z'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await context.route('**/curriculum/beta/*.json', (route) => {
    const slug = route
      .request()
      .url()
      .match(/(kindergarten|grade2|grade5)\.json/)![1]
    return route.fulfill({
      json: JSON.parse(readFileSync(`tests/fixtures/game-content-2026-10-26/${slug}.json`, 'utf8')),
    })
  })
  await context.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('playing'))
      setTimeout(() => this.dispatchEvent(new Event('ended')), 10)
      return Promise.resolve()
    }
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
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([])
})
async function open(page: Page, grade: string, section: RegExp) {
  await page.goto(`./family-beta-preview.html?grade=${grade}`)
  await frame(page).getByRole('button', { name: section }).first().click({ timeout: 30000 })
  return frame(page)
}
test('Grade 5 Ninja Skills reading test retains review and retries a failed save', async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(new DOMException('test denied', 'NotAllowedError')) },
    })
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (
        key.startsWith('family-beta-preview-results-v1:') &&
        !(window.top as Window & { savedFailure?: boolean }).savedFailure
      ) {
        ;(window.top as Window & { savedFailure?: boolean }).savedFailure = true
        throw new DOMException('Test full', 'QuotaExceededError')
      }
      return original.call(this, key, value)
    }
  })
  const f = await open(page, 'grade5', /Practice.*Ninja Skills/)
  await f.getByRole('button', { name: 'Reading Test', exact: true }).click()
  await expect(f.locator('.deferred-reading-collector')).toBeVisible()
  let count = 0
  while (await f.locator('.deferred-reading-collector').count()) {
    const record = f.getByRole('button', { name: 'Record my reading', exact: true })
    if (await record.isVisible()) await record.click()
    await f.getByRole('button', { name: 'Continue without a recording', exact: true }).click()
    count++
    expect(count).toBeLessThan(80)
  }
  const rows = f.locator('.deferred-review-row')
  await expect(rows).toHaveCount(count)
  for (let i = 0; i < count; i++)
    await rows
      .nth(i)
      .getByRole('button', { name: i === 0 ? 'Not yet' : 'Yes', exact: true })
      .click()
  await page.screenshot({ path: test.info().outputPath('review-before-submit.png') })
  await test.info().attach('review-ancestors.json', {
    contentType: 'application/json',
    body: JSON.stringify(
      await rows.first().evaluate((el) => {
        const values = []
        for (let node: Element | null = el; node; node = node.parentElement) {
          const style = getComputedStyle(node),
            box = node.getBoundingClientRect()
          values.push({
            tag: node.tagName,
            id: node.id,
            classes: node.className,
            width: box.width,
            padding: style.padding,
            boxSizing: style.boxSizing,
          })
        }
        return values
      }),
    ),
  })
  await f.getByRole('button', { name: 'Submit final review' }).click()
  await expect
    .poll(
      async () =>
        (await page
          .getByRole('alert')
          .filter({ hasText: /could not be saved/ })
          .isVisible()) ||
        (await f
          .getByRole('alert')
          .filter({ hasText: /could not be saved/ })
          .isVisible()),
    )
    .toBe(true)
  await expect(rows).toHaveCount(count)
  await f.getByRole('button', { name: 'Submit final review' }).click()
  await test.info().attach('retry-state.json', {
    contentType: 'application/json',
    body: JSON.stringify({
      completed: count,
      reviewRows: await rows.count(),
      body: await f.locator('body').innerText(),
      reviewWidth: (await f.locator('.deferred-review-row').first().boundingBox())?.width,
      saved: await page.evaluate(() =>
        Object.keys(localStorage).filter((k) => k.startsWith('family-beta-preview-results-v1:')),
      ),
      pending: await page.evaluate(() =>
        Object.keys(localStorage).filter((k) => k.startsWith('family-beta-preview-pending-v1:')),
      ),
    }),
  })
  await expect
    .poll(() =>
      page.evaluate(
        () => Object.keys(localStorage).filter((k) => k.startsWith('family-beta-preview-results-v1:')).length,
      ),
    )
    .toBe(1)
  await page.reload()
  await expect(frame(page).getByRole('region', { name: 'Saved Ninja Record' })).toContainText(`${count - 1}/${count}`, {
    timeout: 30000,
  })
})
