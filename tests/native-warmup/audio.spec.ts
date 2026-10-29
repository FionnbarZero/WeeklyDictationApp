import { expect, test } from '@playwright/test'
import { grades, snapshot } from '../automatic-curriculum/fixtures.ts'
for (const grade of grades)
  test(`${grade.label}: native Warmup uses complete Kore audio before its ten seconds`, async ({ page, context }) => {
    await page.clock.setSystemTime(new Date('2026-10-23T19:00:00Z'))
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
    const clips: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/audio/kore/')) clips.push(req.url())
    })
    await context.addInitScript(() => {
      const top = window.top as Window & { nativeKoreEnded: number }
      top.nativeKoreEnded ||= 0
      document.addEventListener(
        'ended',
        () => {
          top.nativeKoreEnded++
        },
        true,
      )
      const play = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function () {
        if (!this.dataset.observed) {
          this.dataset.observed = 'true'
          this.addEventListener('ended', () => {
            top.nativeKoreEnded++
          })
        }
        return play.call(this)
      }
      // Never silently substitute a different Mandarin voice during this test.
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: {
          cancel() {},
          resume() {},
          getVoices: () => [],
          speak(u: SpeechSynthesisUtterance) {
            u.onerror?.({ error: 'not-allowed' } as SpeechSynthesisErrorEvent)
          },
        },
      })
    })
    await page.goto(`./family-beta-preview.html?grade=${grade.slug}`)
    const f = page.frameLocator('iframe:visible')
    await f
      .getByRole('button', { name: grade.slug === 'kindergarten' ? /Enter the Spirit Realm/ : /Enter the Dojo/ })
      .click()
    await f
      .getByRole('button', {
        name: grade.slug === 'kindergarten' ? 'Writing mastery warmup' : grade.write,
        exact: true,
      })
      .click()
    if (grade.slug !== 'kindergarten') await f.getByRole('button', { name: /Begin Warmup/ }).click()
    await expect(f.locator('.native-warmup')).toBeVisible()
    await f.getByRole('button', { name: 'Hear', exact: true }).click()
    await expect(f.getByRole('timer')).toHaveText('00:10')
    await expect(f.getByRole('button', { name: 'Skip Timer', exact: true })).toBeEnabled({ timeout: 30_000 })
    expect(clips.length).toBeGreaterThan(0)
    expect(await page.evaluate(() => (window as Window & { nativeKoreEnded: number }).nativeKoreEnded)).toBeGreaterThan(
      0,
    )
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    const timer = await f.getByRole('timer').innerText()
    await page.waitForTimeout(1200)
    expect(await f.getByRole('timer').innerText()).toEqual(timer)
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await f.getByRole('button', { name: 'Skip Timer', exact: true }).click()
    await expect(f.locator('.native-warmup')).toHaveAttribute('data-report-phase', 'compare')
  })
