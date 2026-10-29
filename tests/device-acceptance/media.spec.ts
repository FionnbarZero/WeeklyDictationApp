import { expect, type Page, test } from '@playwright/test'
import { installFamilyFixtures } from '../family-sync/fixtures.ts'

async function nativeKoreProbe(page: Page, counter: 'deviceAudioEnded' | 'deviceActivityEnded') {
  await page.addInitScript((counter) => {
    const root = window.top as Window & Record<string, number>
    root[counter] ||= 0
    const blobs = new WeakSet<Blob>(),
      urls = new Set<string>(),
      fetchAudio = window.fetch.bind(window),
      create = URL.createObjectURL.bind(URL)
    window.fetch = async (input, init) => {
      const response = await fetchAudio(input, init),
        url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('/audio/kore/')) {
        const read = response.blob.bind(response)
        response.blob = async () => {
          const blob = await read()
          blobs.add(blob)
          return blob
        }
      }
      return response
    }
    URL.createObjectURL = (value) => {
      const url = create(value)
      if (value instanceof Blob && blobs.has(value)) urls.add(url)
      return url
    }
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      this.muted = true
      const source = this.src
      if (urls.has(source) || source.includes('/audio/kore/'))
        this.addEventListener('ended', () => root[counter]++, { once: true })
      return play.call(this)
    }
  }, counter)
}

for (const grade of ['kindergarten', 'grade2', 'grade5']) {
  test(`${grade}: parent sound check plays native Kore and microphone denial remains usable`, async ({ page }) => {
    await installFamilyFixtures(page, new Map(), 'ninja-device-fixture@example.invalid')
    await page.clock.setSystemTime(new Date('2026-10-27T19:00:00Z'))
    const clips: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/audio/kore/')) clips.push(request.url())
    })
    await nativeKoreProbe(page, 'deviceAudioEnded')
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

for (const [grade, button] of [
  ['kindergarten', 'Writing characters'],
  ['grade2', 'Learn to Write'],
  ['grade5', 'Read the Words'],
]) {
  test(`${grade}: activity audio follows teaching and comparison rules after family syncing`, async ({
    page,
    context,
  }) => {
    await installFamilyFixtures(page, new Map(), 'ninja-device-fixture@example.invalid')
    await page.clock.setSystemTime(new Date('2026-10-27T19:00:00Z'))
    await context.route('**/curriculum/beta/*.json', async (route) => {
      const slug = new URL(route.request().url()).pathname.split('/').pop()!
      const { readFileSync } = await import('node:fs')
      return route.fulfill({ json: JSON.parse(readFileSync(`tests/fixtures/game-content-2026-10-26/${slug}`, 'utf8')) })
    })
    const urls: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/audio/kore/')) urls.push(r.url())
    })
    await nativeKoreProbe(page, 'deviceActivityEnded')
    await page.goto(`/family-beta-preview.html?grade=${grade}`)
    const f = page.frameLocator('iframe:visible')
    await f.getByRole('button', { name: /Enter the Dojo/ }).click({ timeout: 30000 })
    await f.getByRole('button', { name: button, exact: true }).click()
    if (grade === 'grade5') {
      await f.getByRole('button', { name: 'Record my reading', exact: true }).click()
      await f.getByRole('button', { name: 'Continue without recording', exact: true }).click()
    } else {
      const teacher = f.getByRole('region', { name: 'Stroke order teacher' }),
        warmup = f.getByRole('button', { name: 'Skip Warmup', exact: true })
      await expect(teacher.or(warmup)).toBeVisible()
      if (await warmup.isVisible()) await warmup.click()
      await expect(teacher).toBeVisible()
    }
    await expect.poll(() => urls.length, { timeout: 20000 }).toBeGreaterThan(0)
    await expect
      .poll(() => page.evaluate(() => (window as Window & { deviceActivityEnded: number }).deviceActivityEnded), {
        timeout: 20000,
      })
      .toBeGreaterThan(0)
    expect(urls.length).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await expect(f.locator('body')).not.toBeEmpty()
  })
}
