import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { installFamilyFixtures } from '../family-sync/fixtures.ts'

for (const grade of ['kindergarten', 'grade2', 'grade5']) {
  test(`${grade}: approved direct mastered arcade repeats Report, Exit and reopening without Warmup`, async ({
    page,
    context,
  }) => {
    await installFamilyFixtures(page, new Map(), 'ninja-device-fixture@example.invalid')
    await page.clock.setSystemTime(new Date('2026-10-26T19:00:00Z'))
    await context.route('**/curriculum/beta/*.json', (route) => {
      const slug = new URL(route.request().url()).pathname.split('/').pop()!
      return route.fulfill({ json: JSON.parse(readFileSync(`tests/fixtures/game-content-2026-10-26/${slug}`, 'utf8')) })
    })
    await page.addInitScript(() => {
      HTMLMediaElement.prototype.play = function () {
        this.dispatchEvent(new Event('playing'))
        setTimeout(() => this.dispatchEvent(new Event('ended')), 10)
        return Promise.resolve()
      }
    })
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`/family-beta-preview.html?grade=${grade}`)
    const f = page.frameLocator('iframe:visible')
    await f.getByRole('button', { name: /Spirit Realm/ }).click()
    await expect(f.getByRole('button', { name: 'Writing mastery warmup', exact: true })).toHaveCount(0)
    await expect(f.getByRole('button', { name: 'Shuriken Match', exact: true })).toBeEnabled()
    for (let round = 0; round < 2; round++) {
      await f.getByRole('button', { name: 'Shuriken Match', exact: true }).click()
      await f.locator('.lg-word-seal.is-word').first().click()
      await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
      await expect(f.locator('html')).toHaveAttribute('data-activity-paused', 'true')
      await page.getByRole('button', { name: 'Close and return', exact: true }).click()
      await f.getByRole('button', { name: /^(Exit learning module|Exit game)$/ }).click()
      await expect(f.getByRole('button', { name: 'Shuriken Match', exact: true })).toBeEnabled()
    }
    expect(errors).toEqual([])
  })
}
