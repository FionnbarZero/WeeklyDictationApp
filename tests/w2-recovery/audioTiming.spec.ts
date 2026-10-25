import { expect, type FrameLocator, type Page, test } from '@playwright/test'

type TimingEvent = { kind: string; size?: number; text?: string }
type TimingProbe = { allowMedia: boolean; holdSpeech: boolean; failSpeech: boolean; events: TimingEvent[] }
type TimingWindow = Window & { timingProbe: TimingProbe }

test.beforeEach(async ({ context, page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await context.addInitScript(() => {
    const top = window.top as TimingWindow
    top.timingProbe ||= { allowMedia: false, holdSpeech: false, failSpeech: true, events: [] }
    const probe = top.timingProbe
    const sizes = new Map<string, number>()
    const create = URL.createObjectURL.bind(URL)
    URL.createObjectURL = (blob) => {
      const url = create(blob)
      sizes.set(url, blob.size)
      return url
    }
    const play = HTMLMediaElement.prototype.play
    const seen = new WeakSet<HTMLMediaElement>()
    HTMLMediaElement.prototype.play = function () {
      probe.events.push({ kind: 'play', size: sizes.get(this.src) })
      if (!seen.has(this)) {
        seen.add(this)
        this.addEventListener('ended', () => probe.events.push({ kind: 'ended', size: sizes.get(this.src) }))
      }
      if (!probe.allowMedia) return Promise.reject(new DOMException('Initially denied media', 'NotAllowedError'))
      return play.call(this)
    }
    const start = OscillatorNode.prototype.start
    OscillatorNode.prototype.start = function (...args) {
      probe.events.push({ kind: 'effect' })
      start.apply(this, args)
    }
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices: () => [],
        speak(u: SpeechSynthesisUtterance) {
          if (!u.text.trim()) return
          probe.events.push({ kind: probe.holdSpeech ? 'held-speech' : 'speech', text: u.text })
          if (probe.failSpeech) {
            setTimeout(() => u.onerror?.({ error: 'not-allowed' } as SpeechSynthesisErrorEvent), 10)
          } else {
            u.onstart?.({} as SpeechSynthesisEvent)
            if (!probe.holdSpeech) setTimeout(() => u.onend?.({} as SpeechSynthesisEvent), 10)
          }
        },
      },
    })
  })
})

const events = (page: Page) => page.evaluate(() => (window as TimingWindow).timingProbe.events)
const effects = async (page: Page) => (await events(page)).filter((event) => event.kind === 'effect').length

async function launch(page: Page, game: string, spirit = false) {
  await page.goto('/family-beta-preview.html?grade=kindergarten')
  const f = page.frameLocator('iframe:visible')
  await f.getByRole('button', { name: spirit ? /Enter the Spirit Realm/ : /Practice.*Ninja Skills/ }).click()
  await f.getByRole('button', { name: game, exact: true }).click()
  return f
}

test('first recovered retry ignores the silent primer while the actual recording is still downloading', async ({
  page,
  context,
}) => {
  let hold = false
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let heldRequests = 0
  await context.route('**/audio/kindergarten/*.wav', async (route) => {
    if (hold) {
      heldRequests += 1
      await held
    }
    try {
      await route.continue()
    } catch {
      /* Exit may cancel an owned download. */
    }
  })
  try {
    const f = await launch(page, 'Shadow Strike Dojo')
    await expect(f.getByText('Audio needs another try', { exact: true })).toBeVisible()
    hold = true
    await page.evaluate(() => {
      ;(window as TimingWindow).timingProbe.allowMedia = true
    })
    await f.getByRole('button', { name: 'Replay word', exact: true }).click()
    await expect.poll(() => heldRequests).toBe(1)
    await expect
      .poll(async () => (await events(page)).filter((e) => e.kind === 'ended' && e.size === 204).length)
      .toBe(1)
    await expect(f.getByText('Word played automatically', { exact: true })).toHaveCount(0)
    const before = (await events(page)).filter((e) => e.kind === 'ended' && (e.size || 0) > 204).length
    hold = false
    release()
    await expect
      .poll(async () => (await events(page)).filter((e) => e.kind === 'ended' && (e.size || 0) > 204).length)
      .toBe(before + 1)
    await expect(f.getByText('Word played automatically', { exact: true })).toBeVisible()
    await f.getByRole('button', { name: 'Replay word', exact: true }).click()
    await expect
      .poll(async () => (await events(page)).filter((e) => e.kind === 'ended' && (e.size || 0) > 204).length)
      .toBe(before + 2)
  } finally {
    hold = false
    release()
  }
})

async function pair(page: Page, f: FrameLocator, hold: boolean) {
  await f.locator('.lg-word-seal.is-word').first().click()
  await expect(f.locator('.lg-word-seal.is-selected')).toHaveCount(1)
  await expect.poll(async () => (await events(page)).filter((e) => e.kind === 'speech').length).toBeGreaterThan(0)
  // Allow the controlled first utterance to finish before holding the second.
  await page.waitForTimeout(50)
  await page.evaluate((value) => {
    ;(window as TimingWindow).timingProbe.holdSpeech = value
  }, hold)
  await f.locator('.lg-word-seal.is-meaning').first().click()
  if (hold)
    await expect
      .poll(async () => (await events(page)).filter((e) => e.kind === 'held-speech').length)
      .toBeGreaterThan(0)
}

for (const interruption of ['Exit', 'another card', 'Report'])
  test(`Shuriken pending feedback respects ${interruption} and ordinary feedback still works`, async ({ page }) => {
    const f = await launch(page, 'Shuriken Match', true)
    await page.evaluate(() => {
      ;(window as TimingWindow).timingProbe.failSpeech = false
    })
    await pair(page, f, true)
    expect(await effects(page)).toBe(0)
    if (interruption === 'Report') {
      await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
      await expect(f.locator('html')).toHaveAttribute('data-activity-paused', 'true')
      await page.waitForTimeout(300)
      expect(await effects(page)).toBe(0)
      await page.evaluate(() => {
        ;(window as TimingWindow).timingProbe.holdSpeech = false
      })
      await page.getByRole('button', { name: 'Close and return', exact: true }).click()
      await expect.poll(() => effects(page)).toBeGreaterThan(0)
    } else {
      if (interruption === 'another card') {
        const next = f.locator('.lg-word-seal:not(.is-selected):not(.is-matched):enabled').first()
        await next.click()
        await expect
          .poll(async () => (await events(page)).filter((e) => e.kind === 'held-speech').length)
          .toBeGreaterThan(1)
        await page.waitForTimeout(300)
        expect(await effects(page)).toBe(0)
      }
      await f.getByRole('button', { name: 'Exit learning module', exact: true }).click()
      await expect(f.getByRole('button', { name: 'Shuriken Match', exact: true })).toBeVisible()
      await page.waitForTimeout(300)
      expect(await effects(page)).toBe(0)
      await page.evaluate(() => {
        ;(window as TimingWindow).timingProbe.holdSpeech = false
        ;(window as TimingWindow).timingProbe.events = []
      })
      await f.getByRole('button', { name: 'Shuriken Match', exact: true }).click()
      await pair(page, f, false)
      await expect.poll(() => effects(page)).toBeGreaterThan(0)
    }
  })
