import { expect, test } from './fixtures.ts'

for (const viewport of [
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 1180, height: 720 },
  { width: 390, height: 844 },
]) {
  test(`one-page scroll mockup ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport)
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
    await page.goto('/scroll-layout.html')
    await expect(page.locator('.skywriting-trace-character')).toHaveCount(2)
    await expect(page.getByText(/Listen, then write|Trace the word/)).toHaveCount(0)
    const pads = page.locator('.skywriting-scroll-cell .skywriting-pad')
    const first = (await pads.first().boundingBox())!
    const second = (await pads.last().boundingBox())!
    expect(first.width).toBeGreaterThan(
      viewport.width === 1024 ? 450 : viewport.width === 1180 ? 490 : viewport.width === 768 ? 380 : 190,
    )
    if (viewport.width > viewport.height) expect(Math.abs(first.y - second.y)).toBeLessThan(2)
    else expect(second.y).toBeGreaterThan(first.y + first.height)
    for (const control of [
      pads.first(),
      pads.last(),
      page.getByRole('button', { name: 'Hear', exact: true }),
      page.getByRole('button', { name: 'Skip Timer', exact: true }),
      page.getByRole('textbox'),
      page.getByRole('button', { name: 'Clear', exact: true }),
      page.getByRole('button', { name: 'Report a problem', exact: true }),
      page.getByRole('button', { name: 'Exit', exact: true }),
    ]) {
      const b = (await control.boundingBox())!
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.y).toBeGreaterThanOrEqual(0)
      expect(b.x + b.width).toBeLessThanOrEqual(viewport.width + 1)
      expect(b.y + b.height).toBeLessThanOrEqual(viewport.height + 1)
      expect(
        await control.evaluate((el) => {
          const b = el.getBoundingClientRect()
          return el.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2))
        }),
      ).toBe(true)
    }
    expect((await page.getByRole('button', { name: 'Hear', exact: true }).boundingBox())!.y).toBeGreaterThan(
      second.y + second.height,
    )
    console.log(`${viewport.width}x${viewport.height}: drawable ${first.width}x${first.height}`)
    await page.screenshot({ path: info.outputPath('scroll-layout.png') })
    await page.mouse.move(first.x + 40, first.y + 40)
    await page.mouse.down()
    await page.mouse.move(first.x + 120, first.y + 100, { steps: 8 })
    await page.mouse.up()
    await expect(page.locator('.skywriting-stroke').first()).toBeVisible()
    await page.getByRole('textbox').fill('英雄')
    await page.setViewportSize({ width: viewport.height, height: viewport.width })
    await expect(page.locator('.skywriting-stroke').first()).toBeVisible()
    await expect(page.getByRole('textbox')).toHaveValue('英雄')
    await page.setViewportSize(viewport)
    await page.getByRole('button', { name: 'Hear', exact: true }).click()
    await expect(page.locator('.mockup-audio-state')).toHaveText('', { timeout: 5000 })
    await page.getByRole('button', { name: 'Skip Timer', exact: true }).click()
    await expect(page.locator('.skywriting-trace-character')).toHaveCount(0)
    await expect(page.locator('.skywriting-stroke').first()).toBeVisible()
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(page.locator('.skywriting-trace-character')).toHaveCount(2)
    await expect(page.locator('.skywriting-stroke')).toHaveCount(0)
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await page.getByRole('button', { name: 'Exit', exact: true }).click()
    await page.getByRole('button', { name: 'Return to mockup', exact: true }).click()
    expect(
      await page.evaluate(() => Object.keys(localStorage).filter((k) => /writing-integration-preview|family/.test(k))),
    ).toEqual([])
  })
}
