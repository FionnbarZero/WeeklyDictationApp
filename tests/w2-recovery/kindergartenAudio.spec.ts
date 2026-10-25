import { type BrowserContext, expect, type Page, test } from '@playwright/test'

type SoundProbe = {
  plays: string[]
  ended: string[]
  created: string[]
  released: string[]
  speech: string[]
  denySpeech: boolean
  effects: { duration: number; state: string }[]
}
type SoundWindow = Window & { soundProbe: SoundProbe }

test.beforeEach(async ({ context, page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await context.addInitScript(() => {
    const top = window.top as SoundWindow
    top.soundProbe ||= { plays: [], ended: [], created: [], released: [], speech: [], denySpeech: true, effects: [] }
    const probe = top.soundProbe
    const create = URL.createObjectURL.bind(URL)
    const release = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = (blob) => {
      const url = create(blob)
      probe.created.push(url)
      return url
    }
    URL.revokeObjectURL = (url) => {
      probe.released.push(url)
      release(url)
    }
    const play = HTMLMediaElement.prototype.play
    const tracked = new WeakMap<HTMLMediaElement, { src: string }>()
    HTMLMediaElement.prototype.play = function () {
      let track = tracked.get(this)
      if (!track) {
        track = { src: '' }
        tracked.set(this, track)
        this.addEventListener('ended', () => probe.ended.push(tracked.get(this)!.src))
      }
      track.src = this.src
      probe.plays.push(this.src)
      return play.call(this)
    }
    const start = AudioBufferSourceNode.prototype.start
    AudioBufferSourceNode.prototype.start = function (...args) {
      probe.effects.push({ duration: this.buffer?.duration || 0, state: this.context.state })
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
          probe.speech.push(u.text)
          setTimeout(() => {
            if (probe.denySpeech) u.onerror?.({ error: 'not-allowed' } as SpeechSynthesisErrorEvent)
            else {
              u.onstart?.({} as SpeechSynthesisEvent)
              u.onend?.({} as SpeechSynthesisEvent)
            }
          }, 10)
        },
      },
    })
  })
})

async function fullFiles(context: BrowserContext) {
  // The hosted pass leaves recording responses untouched to verify real delivery.
  if (process.env.K_NATIVE_HOST === '1') return
  // Model the actual preview host: complete bytes with 200 even for a Range
  // probe. Do not mock HTMLMediaElement.play or native decoding in these tests.
  await context.route('**/*.wav', async (route) => {
    const headers = { ...route.request().headers() }
    delete headers.range
    const response = await route.fetch({ headers })
    const output = { ...response.headers(), 'accept-ranges': 'bytes' }
    delete output['content-range']
    delete output['content-length']
    delete output['content-encoding']
    await route.fulfill({ response, status: 200, headers: output, body: await response.body() })
  })
}
async function launch(page: Page, game: string, spirit = false) {
  await page.goto('/family-beta-preview.html?grade=kindergarten')
  const f = page.frameLocator('iframe:visible')
  await f.getByRole('button', { name: spirit ? /Enter the Spirit Realm/ : /Practice.*Ninja Skills/ }).click()
  await f.getByRole('button', { name: game, exact: true }).click()
  return f
}
const probe = (page: Page) => page.evaluate(() => (window as SoundWindow).soundProbe)

test('Kindergarten recorded clues play natively without speech fallback despite whole-file range responses', async ({
  page,
  context,
}) => {
  await fullFiles(context)
  const f = await launch(page, 'Shadow Strike Dojo')
  await expect(f.getByText('Word played automatically', { exact: true })).toBeVisible()
  const before = (await probe(page)).ended.length
  await f.getByRole('button', { name: 'Replay word', exact: true }).click()
  await expect.poll(async () => (await probe(page)).ended.length).toBeGreaterThan(before)
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  const again = (await probe(page)).ended.length
  await f.getByRole('button', { name: 'Replay word', exact: true }).click()
  await expect.poll(async () => (await probe(page)).ended.length).toBeGreaterThan(again)
  expect((await probe(page)).speech).toEqual([])
  await f.getByRole('button', { name: 'Exit learning module', exact: true }).click()
  await expect
    .poll(async () => {
      const p = await probe(page)
      return p.created.filter((url) => !p.released.includes(url))
    })
    .toEqual([])
})

test('Lantern words, replay and decoded match effects work without speech and release on exit', async ({
  page,
  context,
}) => {
  await fullFiles(context)
  const f = await launch(page, 'Memory Lanterns')
  const cards = f.locator('.lg-memory-card')
  await expect(cards.first()).toBeVisible()
  const labels = await cards.locator('.lg-card-face b').allTextContents()
  const pair = labels.flatMap((label, i) => (label === labels[0] ? [i] : []))
  const before = (await probe(page)).ended.length
  await cards.nth(pair[0]).click()
  await expect.poll(async () => (await probe(page)).ended.length).toBeGreaterThan(before)
  const again = (await probe(page)).ended.length
  await cards.nth(pair[0]).click()
  await expect.poll(async () => (await probe(page)).ended.length).toBeGreaterThan(again)
  await expect(f.locator('.lg-memory-card.is-visible')).toHaveCount(1)
  await expect(f.locator('.lg-stat-row')).toContainText('0 turns')
  await cards.nth(pair[1]).click()
  await expect(f.locator('.lg-memory-card.is-matched')).toHaveCount(2)
  await expect.poll(async () => (await probe(page)).effects.length).toBeGreaterThan(0)
  expect((await probe(page)).effects.every((effect) => effect.duration > 0 && effect.state === 'running')).toBe(true)
  expect((await probe(page)).speech).toEqual([])
  await f.getByRole('button', { name: 'Exit learning module', exact: true }).click()
  const after = (await probe(page)).effects.length
  await page.waitForTimeout(500)
  expect((await probe(page)).effects).toHaveLength(after)
  await expect
    .poll(async () => {
      const p = await probe(page)
      return p.created.filter((url) => !p.released.includes(url))
    })
    .toEqual([])
})

for (const game of ['Shuriken Match', 'Memory Lanterns'])
  test(`${game}: a failed word can replay without changing the turn; reporting blocks retry`, async ({
    page,
    context,
  }) => {
    await context.route('**/*.wav', (route) => route.abort())
    const f = await launch(page, game, true)
    const card = f.locator(game === 'Shuriken Match' ? '.lg-word-seal.is-word' : '.lg-memory-card').first()
    await card.click()
    const retry = f.getByRole('button', { name: 'Hear again', exact: true })
    await expect(retry).toBeVisible()
    const last = (await probe(page)).speech.at(-1)
    const selected = f.locator(game === 'Shuriken Match' ? '.lg-word-seal.is-selected' : '.lg-memory-card.is-visible')
    await expect(selected).toHaveCount(1)
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Report a problem', exact: true })).toBeVisible()
    const count = (await probe(page)).speech.length
    await retry.evaluate((button) => (button as HTMLButtonElement).click())
    expect((await probe(page)).speech).toHaveLength(count)
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await page.evaluate(() => {
      ;(window as SoundWindow).soundProbe.denySpeech = false
    })
    await retry.click()
    await expect(retry).toHaveCount(0)
    expect((await probe(page)).speech.at(-1)).toBe(last)
    await expect(selected).toHaveCount(1)
    if (game === 'Memory Lanterns') {
      const before = (await probe(page)).speech.length
      await card.click()
      await expect.poll(async () => (await probe(page)).speech.length).toBeGreaterThan(before)
      await expect(f.locator('.lg-stat-row')).toContainText('0 turns')
    }
  })

for (const interruption of ['Exit', 'Report'])
  test(`a pending recording download cannot play after ${interruption}`, async ({ page, context }) => {
    let unblock!: () => void
    const held = new Promise<void>((resolve) => {
      unblock = resolve
    })
    let requests = 0
    let hold = true
    await context.route('**/audio/kindergarten/*.wav', async (route) => {
      requests += 1
      if (hold) await held
      try {
        await route.continue()
      } catch {
        /* The aborted request is intentionally no longer owned. */
      }
    })
    const f = await launch(page, 'Shadow Strike Dojo')
    await expect.poll(() => requests).toBe(1)
    if (interruption === 'Exit') await f.getByRole('button', { name: 'Exit learning module', exact: true }).click()
    else {
      await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
      await expect(f.locator('html')).toHaveAttribute('data-activity-paused', 'true')
    }
    const before = await probe(page)
    hold = false
    unblock()
    await page.waitForTimeout(500)
    expect((await probe(page)).speech).toEqual([])
    expect((await probe(page)).plays.length).toBe(before.plays.length)
    if (interruption === 'Report') {
      await page.getByRole('button', { name: 'Close and return', exact: true }).click()
      await expect(f.getByText('Word played automatically', { exact: true })).toBeVisible()
      expect(requests).toBe(2)
    }
  })
