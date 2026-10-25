import { expect, test } from '@playwright/test'

for (const game of ['Shuriken Match', 'Dictation Streak']) {
  test(`${game}: narrow screens and reduced height keep controls scroll-accessible`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-23T19:00:00Z'))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(() => {
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
    await page.goto('/family-beta-preview.html?grade=grade5')
    const frame = page.frameLocator('iframe:visible')
    await frame.getByRole('button', { name: /Practice.*Ninja Skills/ }).click()
    await frame.getByRole('button', { name: game, exact: true }).click()
    await frame.locator('body').evaluate(() => document.fonts.ready)
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport)
      if (game === 'Shuriken Match') {
        await expect(frame.locator('.lg-word-seal')).toHaveCount(16)
        for (const card of await frame.locator('.lg-word-seal').all()) {
          await card.scrollIntoViewIfNeeded()
          await expect(card).toBeInViewport({ ratio: 0.99 })
        }
      } else {
        const input = frame.locator('input')
        await input.fill('yán') // First regular Grade 5 earlier-week target: 盐.
        await expect(frame.getByRole('option')).toHaveCount(3)
        for (const control of [
          input,
          ...(await frame.getByRole('option').all()),
          frame.getByRole('button', { name: 'Check characters', exact: true }),
        ]) {
          await control.scrollIntoViewIfNeeded()
          await expect(control).toBeInViewport({ ratio: 0.99 })
        }
      }
      expect(await frame.locator('body').evaluate((node) => node.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: test.info().outputPath(`small-${viewport.width}.png`) })
    }
    const exit = frame.getByRole('button', { name: 'Exit learning module', exact: true })
    await exit.scrollIntoViewIfNeeded()
    await exit.click()
    await expect(frame.getByRole('button', { name: game, exact: true })).toBeVisible()
  })
}
