import { expect, test } from '@playwright/test'
import { installFamilyFixtures } from '../family-sync/fixtures.ts'

for (const grade of ['kindergarten', 'grade2', 'grade5']) {
  test(`${grade}: parent sound check plays native Kore and microphone denial remains usable`, async ({ page }) => {
    await installFamilyFixtures(page, new Map(), 'ninja-device-fixture@example.invalid')
    await page.clock.setSystemTime(new Date('2026-10-27T19:00:00Z'))
    const clips: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/audio/kore/')) clips.push(request.url())
    })
    await page.addInitScript(() => {
      const root = window.top as Window & { deviceAudioEnded?: number }
      root.deviceAudioEnded = 0
      const play = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function () {
        this.muted = true
        this.addEventListener('ended', () => root.deviceAudioEnded!++, { once: true })
        return play.call(this)
      }
    })
    await page.goto(`/family-beta-preview.html?grade=${grade}`)
    await page.locator('summary').filter({ hasText: 'Parent controls' }).click()
    await page.getByRole('button', { name: 'Check sound & microphone', exact: true }).click()
    await page.getByRole('button', { name: 'Play test word', exact: true }).click()
    await expect
      .poll(() => page.evaluate(() => (window as Window & { deviceAudioEnded: number }).deviceAudioEnded))
      .toBeGreaterThan(0)
    expect(clips.length).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Record my reading', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Continue without recording', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Close sound check', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Check syncing', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    // Decoding/playback events do not establish physical speaker audibility.
  })
}
