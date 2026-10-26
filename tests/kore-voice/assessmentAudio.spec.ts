import { expect, test } from '@playwright/test'

type AssessmentProbe = { ended: number; fallback: string[] }
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const probe: AssessmentProbe = { ended: 0, fallback: [] }
    ;(window as Window & { assessmentProbe: AssessmentProbe }).assessmentProbe = probe
    const create = URL.createObjectURL.bind(URL),
      real = new Set<string>()
    URL.createObjectURL = (blob) => {
      const url = create(blob)
      if (blob.size > 204) real.add(url)
      return url
    }
    const play = HTMLMediaElement.prototype.play,
      sources = new WeakMap<HTMLMediaElement, string>()
    HTMLMediaElement.prototype.play = function () {
      if (!sources.has(this))
        this.addEventListener('ended', () => {
          if (real.has(sources.get(this)!)) probe.ended++
        })
      sources.set(this, this.src)
      return play.call(this)
    }
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices: () => [],
        speak(u: SpeechSynthesisUtterance) {
          if (/\p{Script=Han}/u.test(u.text)) probe.fallback.push(u.text)
          u.onerror?.({ error: 'not-allowed' } as SpeechSynthesisErrorEvent)
        },
      },
    })
  })
})
for (const activity of ['Writing Test · all 8 targets', 'Shuriken Match', 'Sushi Scramble'])
  test(`shared Grade 5 eight-word assessment: ${activity} uses real Kore`, async ({ page }) => {
    const recordings: string[] = []
    page.on('response', (r) => {
      if (r.url().includes('/audio/kore/') && r.status() === 200) recordings.push(r.url())
    })
    await page.goto('./grade5-oct23-preview.html')
    await page
      .getByRole('region', { name: 'Practice Your Ninja Skills', exact: true })
      .getByRole('button', { name: activity, exact: true })
      .click()
    if (activity === 'Shuriken Match') await page.locator('.lg-word-seal.is-word').first().click()
    await expect
      .poll(
        () => page.evaluate(() => (window as Window & { assessmentProbe: AssessmentProbe }).assessmentProbe.ended),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0)
    expect(recordings.length).toBeGreaterThan(0)
    expect(
      await page.evaluate(() => (window as Window & { assessmentProbe: AssessmentProbe }).assessmentProbe.fallback),
    ).toEqual([])
    await expect(page.getByRole('button', { name: 'Report a problem', exact: true })).toBeVisible()
  })
