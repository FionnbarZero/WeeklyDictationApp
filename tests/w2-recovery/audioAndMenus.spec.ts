import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    const top = window.top as Window & { spoken?: { text: string; rate: number }[]; failSpeech?: boolean }
    top.spoken ||= []
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices: () => [],
        speak(u: SpeechSynthesisUtterance) {
          top.spoken!.push({ text: u.text, rate: u.rate })
          u.onstart?.({} as SpeechSynthesisEvent)
          setTimeout(
            () =>
              top.failSpeech
                ? u.onerror?.({ error: 'not-allowed' } as SpeechSynthesisErrorEvent)
                : u.onend?.({} as SpeechSynthesisEvent),
            10,
          )
        },
      },
    })
    HTMLMediaElement.prototype.play = function () {
      return Promise.reject(new Error('Synthetic speech fallback'))
    }
  })
})

for (const game of ['Context Gap Dash', 'Sushi Scramble'])
  test(`${game}: slower replay preserves the prompt and recovers denied audio`, async ({ page }) => {
    await page.goto('/family-beta-preview.html?grade=grade5')
    const frame = page.frameLocator('iframe:visible')
    await frame.getByRole('button', { name: /Practice.*Ninja Skills/ }).click()
    await frame.getByRole('button', { name: game, exact: true }).click()
    const slow = frame.getByRole('button', { name: 'Hear slowly', exact: true })
    await expect(slow).toBeEnabled()
    const heading = frame.locator(game === 'Sushi Scramble' ? '.lg-round-label' : '.lg-dash-context-clue strong')
    const prompt = await heading.textContent()
    const before = await page.evaluate(() =>
      Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('family-beta-'))),
    )
    await page.evaluate(() => {
      ;(window as Window & { failSpeech: boolean }).failSpeech = true
    })
    await slow.click()
    await expect(frame.getByRole('alert')).toContainText('could not play')
    await page.evaluate(() => {
      ;(window as Window & { failSpeech: boolean }).failSpeech = false
    })
    await slow.click()
    await expect(frame.getByRole('alert')).toHaveCount(0)
    const spoken = await page.evaluate(() => (window as Window & { spoken: { text: string; rate: number }[] }).spoken)
    expect(spoken.at(-1)!.rate).toBe(0.5)
    expect(spoken.at(-1)!.text).toBe(spoken.at(-2)!.text)
    await expect(heading).toHaveText(prompt!)
    expect(
      await page.evaluate(() =>
        Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('family-beta-'))),
      ),
    ).toEqual(before)
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Report a problem', exact: true })).toBeVisible()
    await expect(frame.locator('html')).toHaveAttribute('data-activity-paused', 'true')
    const count = await page.evaluate(() => (window as Window & { spoken: unknown[] }).spoken.length)
    await slow.evaluate((el) => (el as HTMLButtonElement).click())
    expect(await page.evaluate(() => (window as Window & { spoken: unknown[] }).spoken.length)).toBe(count)
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await page.screenshot({ path: test.info().outputPath('sentence-controls.png'), fullPage: true })
    for (const [width, height] of [
      [983, 638],
      [1024, 665],
    ]) {
      await page.setViewportSize({ width, height })
      await expect(slow).toBeInViewport()
      await expect(frame.getByRole('button', { name: 'Exit learning module', exact: true })).toBeInViewport()
      await expect(page.getByRole('button', { name: 'Report a problem', exact: true })).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: test.info().outputPath(`sentence-${width}.png`), fullPage: true })
    }
    await frame.getByRole('button', { name: 'Exit learning module', exact: true }).click()
    await expect(frame.getByRole('button', { name: game, exact: true })).toBeVisible()
  })

test('Grade 5 regular Spirit Realm uses approved direct games without replacing native mastery history', async ({
  page,
}) => {
  await page.goto('/family-beta-preview.html?grade=grade5')
  const frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: /Enter the Spirit Realm/ }).click()
  await expect(frame.getByRole('button', { name: /mastery warmup|mastered-word games/i })).toHaveCount(0)
  const expected = ['Shuriken Match', 'Shadow Strike Dojo', 'Memory Lanterns', 'Context Gap Dash', 'Sushi Scramble']
  for (const game of expected) await expect(frame.getByRole('button', { name: game, exact: true })).toBeVisible()
  const before = await page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage).filter(([key]) => /mastery|acquisition|results/.test(key))),
  )
  await frame.getByRole('button', { name: 'Memory Lanterns', exact: true }).click()
  await expect(frame.locator('.lg-memory-card').first()).toBeVisible()
  await frame.getByRole('button', { name: 'Exit learning module', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Memory Lanterns', exact: true })).toBeVisible()
  expect(
    await page.evaluate(() =>
      Object.fromEntries(Object.entries(localStorage).filter(([key]) => /mastery|acquisition|results/.test(key))),
    ),
  ).toEqual(before)
})

for (const grade of ['kindergarten', 'grade2'])
  test(`${grade}: mastered arcade opens and returns while native mastery activities remain`, async ({ page }) => {
    await page.goto(`/family-beta-preview.html?grade=${grade}`)
    const frame = page.frameLocator('iframe:visible')
    await frame.getByRole('button', { name: /Enter the Spirit Realm/ }).click()
    await expect(frame.getByRole('button', { name: 'Reading mastery warmup', exact: true })).toBeVisible()
    const game = frame.getByRole('button', { name: 'Memory Lanterns', exact: true })
    await expect(game).toBeEnabled()
    const records = () =>
      page.evaluate(() =>
        Object.fromEntries(Object.entries(localStorage).filter(([key]) => /mastery|acquisition|results/.test(key))),
      )
    const before = await records()
    await game.click()
    await expect(frame.locator('.lg-memory-card').first()).toBeVisible()
    await frame.getByRole('button', { name: 'Exit learning module', exact: true }).click()
    await expect(game).toBeVisible()
    expect(await records()).toEqual(before)
  })
