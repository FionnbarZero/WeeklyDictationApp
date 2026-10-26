import { expect, type FrameLocator, type Page, test } from '@playwright/test'
import { grades, snapshot } from '../automatic-curriculum/fixtures.ts'

test.beforeEach(async ({ page, context }) => {
  await page.clock.setSystemTime(new Date('2026-10-23T19:00:00Z'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await context.route('**/curriculum/beta/*.json', (route) =>
    route.fulfill({
      json: snapshot(
        route
          .request()
          .url()
          .match(/(kindergarten|grade2|grade5)\.json/)![1],
      ),
    }),
  )
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
          setTimeout(() => u.onend?.({} as SpeechSynthesisEvent), 10)
        },
      },
    })
  })
})
async function launch(page: Page, grade: (typeof grades)[number]) {
  await page.goto(`./family-beta-preview.html?grade=${grade.slug}`)
  const f = page.frameLocator('iframe:visible')
  await f
    .getByRole('button', { name: grade.slug === 'kindergarten' ? /Enter the Spirit Realm/ : /Enter the Dojo/ })
    .click()
  await f
    .getByRole('button', { name: grade.slug === 'kindergarten' ? 'Writing mastery warmup' : grade.write, exact: true })
    .click()
  if (grade.slug !== 'kindergarten') await f.getByRole('button', { name: /Begin Warmup/ }).click()
  await expect(f.locator('.native-warmup')).toBeVisible()
  return f
}
async function compare(f: FrameLocator) {
  await expect(f.getByRole('button', { name: 'Skip Timer', exact: true })).toBeEnabled()
  await f.getByRole('button', { name: 'Skip Timer', exact: true }).click()
  await expect(f.locator('.native-warmup')).toHaveAttribute('data-report-phase', 'compare')
}
async function trial(page: Page, f: FrameLocator) {
  const id = await f.locator('.native-warmup').getAttribute('data-report-target')
  return page.evaluate((id) => {
    const key = Object.keys(localStorage).find(
      (k) => k.includes('native-writing-warmup-trial-v1:') && k.includes(`:${id}:`),
    )!
    return { key, value: JSON.parse(localStorage.getItem(key)!) }
  }, id)
}
for (const grade of grades) {
  test(`${grade.label}: another tab cannot replace the committed first answer`, async ({ page, context }) => {
    const f = await launch(page, grade)
    await compare(f)
    const first = await trial(page, f)
    const second = await context.newPage()
    await second.clock.setSystemTime(new Date('2026-10-23T19:00:00Z'))
    const g = await launch(second, grade)
    await compare(g)
    await g.getByRole('button', { name: 'I got it right', exact: true }).click()
    await expect(g.locator('.native-warmup')).toHaveAttribute('data-report-position', '2')
    const committed = await page.evaluate((key) => localStorage.getItem(key), first.key)
    await page.bringToFront()
    await f.getByRole('button', { name: 'I got it wrong', exact: true }).click()
    await expect(f.getByRole('alert')).toContainText(/another tab|changed|already advanced/i)
    expect(await page.evaluate((key) => localStorage.getItem(key), first.key)).toEqual(committed)
    expect(JSON.parse(committed!).firstAnswers).toEqual([true])
  })
  test(`${grade.label}: native-owner save refusal stays retryable without double credit`, async ({ page }) => {
    const f = await launch(page, grade)
    await compare(f)
    const first = await trial(page, f)
    const refuseOwnerStorage = () => {
      const set = Storage.prototype.setItem
      ;(window as Window & { restoreAuditStorage: () => void }).restoreAuditStorage = () => {
        Storage.prototype.setItem = set
      }
      Storage.prototype.setItem = function (key, value) {
        if (!key.includes('native-writing-warmup-trial-v1:')) throw new Error('Audit native-owner save refusal')
        return set.call(this, key, value)
      }
    }
    // Grade 2's workspace writes in the parent realm; the other adapters write
    // in the activity frame. Refuse both real persistence destinations.
    await page.evaluate(refuseOwnerStorage)
    await f.locator('body').evaluate(refuseOwnerStorage)
    await f.getByRole('button', { name: 'I got it right', exact: true }).click()
    await expect(f.locator('.native-warmup')).toHaveAttribute('data-report-position', '1')
    await expect(f.locator('.warmup-error')).toContainText(/save|checkpoint/i)
    await expect(f.locator('.native-warmup')).toHaveAttribute('data-report-phase', 'complete')
    await f
      .locator('body')
      .evaluate(() => (window as Window & { restoreAuditStorage: () => void }).restoreAuditStorage())
    await page.evaluate(() => (window as Window & { restoreAuditStorage: () => void }).restoreAuditStorage())
    await f.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(f.locator('.native-warmup')).toHaveAttribute('data-report-position', '2')
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).firstAnswers, first.key)).toEqual([true])
  })
  test(`${grade.label}: Report pauses a queued checkpoint; returning permits one retry`, async ({ page }) => {
    const f = await launch(page, grade)
    const first = await trial(page, f)
    const lock = `ninja-scrolls-write:${first.key.slice(first.key.indexOf('native-writing-warmup-trial-v1:'))}`
    await f.locator('body').evaluate(
      (_el, lock) =>
        new Promise<void>((acquired) => {
          void navigator.locks.request(
            lock,
            () =>
              new Promise<void>((release) => {
                ;(window as Window & { releaseAuditLock: () => void }).releaseAuditLock = release
                acquired()
              }),
          )
        }),
      lock,
    )
    await f.getByRole('button', { name: 'Skip Timer', exact: true }).click()
    await f.getByRole('button', { name: 'Skip Timer', exact: true }).click()
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await f.locator('body').evaluate(() => (window as Window & { releaseAuditLock: () => void }).releaseAuditLock())
    await expect(f.locator('html')).toHaveAttribute('data-activity-paused', 'true')
    expect((await trial(page, f)).value.revision).toBe(first.value.revision)
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await compare(f)
    expect((await trial(page, f)).value.revision).toBe(first.value.revision + 1)
  })
}
