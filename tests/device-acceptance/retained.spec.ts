import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { installFamilyFixtures } from '../family-sync/fixtures.ts'

const frame = (page: Page) => page.frameLocator('iframe:visible')
const errors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page, context }) => {
  await installFamilyFixtures(page, new Map(), 'ninja-device-fixture@example.invalid')
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
  // The current reading-only assessment has its own verified test adapter.
  // Select the retained weekly route to audit the original native handoff.
  await frame(page)
    .getByRole('button', { name: /Enter the Dojo/ })
    .waitFor({ state: 'visible', timeout: 30000 })
  await page.locator('summary').filter({ hasText: 'Parent controls' }).click()
  await page.getByRole('combobox', { name: 'Practice week', exact: true }).selectOption('2026-10-13')
  await expect(page.locator('iframe:visible')).toHaveAttribute('data-family-week', '2026-10-13')
  await page.locator('summary').filter({ hasText: 'Parent controls' }).click()
  await frame(page).getByRole('button', { name: section }).first().click({ timeout: 30000 })
  return frame(page)
}
test('retained Grade 5 review fits and retries a failed local save before syncing', async ({ page, context }) => {
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
  expect((await rows.first().boundingBox())!.width).toBeGreaterThan(500)
  await test.info().attach('retained-review-layout.json', {
    contentType: 'application/json',
    body: JSON.stringify({
      viewport: page.viewportSize(),
      width: (await rows.first().boundingBox())?.width,
      collected: count,
    }),
  })
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
      reviewWidth: (await rows.count()) ? (await rows.first().boundingBox())?.width : null,
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

test('retained Grade 5 writing review keeps ink through failed save and commits the retry once', async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      const top = window.top as Window & { failedWritingSave?: boolean }
      if (key.startsWith('family-beta-preview-results-v1:') && !top.failedWritingSave) {
        top.failedWritingSave = true
        throw new DOMException('Synthetic full', 'QuotaExceededError')
      }
      return original.call(this, key, value)
    }
  })
  const f = await open(page, 'grade5', /Practice.*Ninja Skills/)
  await f.getByRole('button', { name: 'Writing Test', exact: true }).click()
  await expect(f.locator('.report-writing-collector')).toBeVisible()
  const pad = f.locator('.skywriting-pad').first(),
    b = (await pad.boundingBox())!
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.3)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.6)
  await page.mouse.up()
  let count = 0
  while (await f.locator('.report-writing-collector').count()) {
    await f.getByRole('button', { name: 'Skip Timer', exact: true }).click()
    count++
    expect(count).toBeLessThan(80)
  }
  const rows = f.locator('.deferred-review-row')
  await expect(rows).toHaveCount(count)
  for (let i = 0; i < count; i++) await rows.nth(i).getByRole('button', { name: 'Yes', exact: true }).click()
  await f.getByRole('button', { name: 'Submit final review', exact: true }).click()
  await expect(f.getByRole('alert')).toContainText('Your result could not be saved')
  await expect(rows.first().locator('.skywriting-stroke')).toHaveCount(1)
  await f.getByRole('button', { name: 'Submit final review', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () => Object.keys(localStorage).filter((k) => k.startsWith('family-beta-preview-results-v1:')).length,
      ),
    )
    .toBe(1)
  const saved = await page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([k]) => k.startsWith('family-beta-preview-results-v1:'))
      .map(([, v]) => JSON.parse(v)),
  )
  expect(saved[0].correct).toBe(count)
  expect(saved[0].attempted).toBe(count)
  await page.reload()
  await expect
    .poll(() =>
      page.evaluate(
        () => Object.keys(localStorage).filter((k) => k.startsWith('family-beta-preview-results-v1:')).length,
      ),
    )
    .toBe(1)
})
