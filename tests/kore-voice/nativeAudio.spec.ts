import { expect, type Page, test } from '@playwright/test'
import { grades, snapshot } from '../automatic-curriculum/fixtures.ts'

type Probe = {
  errors: string[]
  urls: string[]
  ended: number
  rates: number[]
  speech: string[]
  created: string[]
  released: string[]
}
type SoundWindow = Window & { koreProbe: Probe }
const probe = (page: Page) => page.evaluate(() => (window as SoundWindow).koreProbe)
test.beforeEach(async ({ page, context }) => {
  await page.clock.setSystemTime(new Date('2026-10-23T19:00:00Z'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await context.route('**/curriculum/beta/*.json', (route) => {
    const slug = route
      .request()
      .url()
      .match(/(kindergarten|grade2|grade5)\.json/)![1]
    return route.fulfill({ json: snapshot(slug) })
  })
  await context.addInitScript(() => {
    const top = window.top as SoundWindow
    top.koreProbe ||= { errors: [], urls: [], ended: 0, rates: [], speech: [], created: [], released: [] }
    const p = top.koreProbe
    const koreBlobs = new WeakSet<Blob>()
    const koreUrls = new Set<string>()
    const fetchAudio = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('/audio/') && url.endsWith('.wav')) p.urls.push(url)
      return fetchAudio(input, init).then((response) => {
        if (url.includes('/audio/kore/')) {
          const readBlob = response.blob.bind(response)
          response.blob = async () => {
            const blob = await readBlob()
            koreBlobs.add(blob)
            return blob
          }
        }
        return response
      })
    }
    const create = URL.createObjectURL.bind(URL),
      release = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = (blob) => {
      const url = create(blob)
      if (koreBlobs.has(blob)) koreUrls.add(url)
      p.created.push(url)
      return url
    }
    URL.revokeObjectURL = (url) => {
      p.released.push(url)
      release(url)
    }
    const play = HTMLMediaElement.prototype.play
    const observed = new WeakMap<HTMLMediaElement, { src: string }>()
    HTMLMediaElement.prototype.play = function () {
      if (!observed.has(this)) {
        observed.set(this, { src: this.src })
        this.addEventListener('ended', () => {
          if (koreUrls.has(observed.get(this)!.src)) p.ended++
        })
      }
      observed.get(this)!.src = this.src
      if (koreUrls.has(this.src)) p.rates.push(this.playbackRate)
      return play.call(this).catch((error) => {
        if (koreUrls.has(this.src)) p.errors.push(`${error.name}: ${error.message}`)
        throw error
      })
    }
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices: () => [],
        speak(u: SpeechSynthesisUtterance) {
          if (/\p{Script=Han}/u.test(u.text)) {
            p.speech.push(u.text)
            setTimeout(() => u.onerror?.({ error: 'not-allowed' } as SpeechSynthesisErrorEvent), 0)
          } else {
            u.onstart?.({} as SpeechSynthesisEvent)
            setTimeout(() => u.onend?.({} as SpeechSynthesisEvent), 0)
          }
        },
      },
    })
  })
})
for (const grade of grades) {
  for (const game of [
    ...(grade.slug === 'kindergarten' ? ['Listening Lily Pads'] : []),
    'Shuriken Match',
    'Memory Lanterns',
    'Shadow Strike Dojo',
    'Sushi Scramble',
    'Context Gap Dash',
    'Dictation Streak',
  ]) {
    test(`${grade.label}: ${game} plays actual Kore and retains Report and Exit`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.goto(`./family-beta-preview.html?grade=${grade.slug}`)
      const f = page.frameLocator('iframe:visible')
      await f
        .getByRole('button', {
          name:
            grade.slug === 'kindergarten' && game === 'Context Gap Dash'
              ? /Enter the Spirit Realm/
              : /Practice.*Ninja Skills/,
        })
        .click()
      await f.getByRole('button', { name: game, exact: true }).click()
      if (game === 'Shuriken Match') await f.locator('.lg-word-seal.is-word').first().click()
      if (game === 'Memory Lanterns') await f.locator('.lg-memory-card').first().click()
      await expect.poll(async () => (await probe(page)).ended, { timeout: 30_000 }).toBeGreaterThan(0)
      const before = await probe(page)
      expect(before.urls.some((url) => url.includes('/audio/kore/'))).toBe(true)
      expect(before.speech).toEqual([])
      if (game === 'Sushi Scramble' || game === 'Context Gap Dash') {
        const slow = f.getByRole('button', { name: 'Hear slowly', exact: true })
        await expect(slow).toBeEnabled({ timeout: 30_000 })
        await slow.click()
        await expect
          .poll(async () => (await probe(page)).rates.some((rate) => Math.abs(rate - 0.5 / 0.65) < 0.001))
          .toBe(true)
        await expect.poll(async () => (await probe(page)).ended, { timeout: 30_000 }).toBeGreaterThan(before.ended)
      }
      await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
      await expect(f.locator('html')).toHaveAttribute('data-activity-paused', 'true')
      await page.getByRole('button', { name: 'Close and return', exact: true }).click()
      await f.getByRole('button', { name: /^(Exit learning module|Exit game)$/, exact: true }).click()
      await expect
        .poll(async () => {
          const p = await probe(page)
          return p.created.filter((url) => !p.released.includes(url))
        })
        .toEqual([])
      expect((await probe(page)).speech).toEqual([])
      expect(errors).toEqual([])
    })
  }
  test(`${grade.label}: reading uses Kore with existing English instructions`, async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: () => Promise.reject(new DOMException('Synthetic microphone denial', 'NotAllowedError')),
        },
      })
    })
    await page.goto(`./family-beta-preview.html?grade=${grade.slug}`)
    const f = page.frameLocator('iframe:visible')
    await f.getByRole('button', { name: /Enter the Dojo/ }).click()
    await f
      .getByRole('button', {
        name: grade.slug === 'kindergarten' ? 'High-frequency words' : 'Read the Words',
        exact: true,
      })
      .click()
    const skip = f.getByRole('button', { name: 'Skip Warmup', exact: true })
    const exit = f.getByRole('button', { name: /^(Exit reading|Pause and return)$/ })
    await expect(skip.or(exit)).toBeVisible()
    if (await skip.isVisible()) await skip.click()
    // Initial independent reading intentionally does not reveal the answer.
    // Use the existing microphone-unavailable comparison path (no real recording).
    await f.getByRole('button', { name: 'Record my reading', exact: true }).click()
    await f.getByRole('button', { name: 'Continue without recording', exact: true }).click()
    await expect.poll(async () => (await probe(page)).ended, { timeout: 30_000 }).toBeGreaterThan(0)
    expect((await probe(page)).speech).toEqual([])
    expect((await probe(page)).urls.some((url) => url.includes('/audio/kore/'))).toBe(true)
    await exit.click()
  })
  test(`${grade.label}: guided writing and isolated Warmup use Kore`, async ({ page }) => {
    await page.goto(`./family-beta-preview.html?grade=${grade.slug}`)
    const f = page.frameLocator('iframe:visible')
    await f.getByRole('button', { name: /Enter the Dojo/ }).click()
    await f.getByRole('button', { name: grade.write, exact: true }).click()
    const teacher = f.getByRole('region', { name: 'Stroke order teacher' })
    const skip = f.getByRole('button', { name: 'Skip Warmup', exact: true })
    await expect(teacher.or(skip)).toBeVisible()
    if (await skip.isVisible()) await skip.click()
    await expect(teacher).toBeVisible()
    await expect.poll(async () => (await probe(page)).ended, { timeout: 30_000 }).toBeGreaterThan(0)
    expect((await probe(page)).speech).toEqual([])
    expect((await probe(page)).urls.some((url) => url.includes('/audio/kore/'))).toBe(true)
    await page.goto(`./warmup-design-preview.html?grade=${grade.slug}`)
    await page.getByRole('button', { name: 'Start or resume Warmup', exact: true }).click()
    // A user gesture is required before auto-audio in a newly opened WebKit page.
    const hear = page.getByRole('button', { name: /Hear/ }).first()
    await hear.click()
    await expect.poll(async () => (await probe(page)).ended, { timeout: 30_000 }).toBeGreaterThan(0)
    expect((await probe(page)).speech).toEqual([])
  })
}

test.afterEach(async ({ page }) => {
  if (!page.isClosed())
    await test
      .info()
      .attach('kore-audio-probe.json', { body: JSON.stringify(await probe(page)), contentType: 'application/json' })
})
