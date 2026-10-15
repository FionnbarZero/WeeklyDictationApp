import { expect, test } from './fixtures.ts'

for (const viewport of [
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 1180, height: 720 },
]) {
  test(`Slay acquisition ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
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
    await page.goto('/slay-acquisition.html')
    await page.getByRole('button', { name: 'Start or resume comparison' }).click()
    await expect(page.locator('.skywriting-trace-character')).toHaveCount(2)
    await expect(page.getByRole('timer')).toHaveText('00:25')
    async function checkControls() {
      for (const control of [
        page.locator('.skywriting-pad').first(),
        page.getByRole('button', { name: 'Hear', exact: true }),
        page.getByRole('button', { name: 'Skip Timer', exact: true }),
        page.getByRole('textbox'),
        page.getByRole('button', { name: 'Clear', exact: true }),
      ]) {
        const b = (await control.boundingBox())!
        expect(b.x).toBeGreaterThanOrEqual(0)
        expect(b.y).toBeGreaterThanOrEqual(0)
        expect(b.x + b.width).toBeLessThanOrEqual(viewport.width + 1)
        expect(b.y + b.height).toBeLessThanOrEqual(viewport.height + 1)
        expect(
          await control.evaluate((el) => {
            const r = el.getBoundingClientRect()
            return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
          }),
        ).toBe(true)
      }
    }
    await checkControls()
    console.log(
      'pads',
      await page.locator('.skywriting-pad').evaluateAll((els) =>
        els.map((e) => {
          const b = e.getBoundingClientRect()
          return { width: b.width, height: b.height, x: b.x, y: b.y }
        }),
      ),
    )
    await page.screenshot({ path: info.outputPath('trace.png') })
    const pad = (await page.locator('.skywriting-pad').first().boundingBox())!
    await page.mouse.move(pad.x + 50, pad.y + 50)
    await page.mouse.down()
    await page.mouse.move(pad.x + 120, pad.y + 110, { steps: 8 })
    await page.mouse.up()
    await expect(page.locator('.skywriting-stroke').first()).toBeVisible()
    await page.getByRole('textbox').fill('英雄')
    await expect(page.getByRole('button', { name: 'Hear', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    const timer = await page.getByRole('timer').textContent()
    await page.waitForTimeout(1200)
    await expect(page.getByRole('timer')).toHaveText(timer!)
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    async function right() {
      await page.getByRole('button', { name: 'Skip Timer', exact: true }).click()
      await expect(page.getByRole('button', { name: 'I got it right', exact: true })).toBeVisible()
      const panel = (await page.locator('.skywriting-child-example').boundingBox())!
      for (const item of [page.locator('.skywriting-pad').first(), page.getByRole('textbox')]) {
        const b = (await item.boundingBox())!
        expect(b.x + b.width).toBeLessThanOrEqual(panel.x + panel.width + 1)
      }
      await page.screenshot({ path: info.outputPath('review.png') })
      await page.getByRole('button', { name: 'I got it right', exact: true }).click()
      await expect(page.getByRole('button', { name: 'I got it right', exact: true })).toHaveCount(0)
    }
    await right()
    await expect(page.locator('.skywriting-trace-character')).toHaveCount(0)
    await expect(page.getByRole('timer')).toHaveText('00:25')
    await checkControls()
    await page.getByRole('button', { name: 'Exit game', exact: true }).click()
    await page.getByRole('button', { name: 'Start or resume comparison' }).click()
    await expect(page.locator('.skywriting-trace-character')).toHaveCount(0)
    await right()
    await expect(page.locator('.set-chip')).toContainText('Familiar DT')
    await expect(page.getByRole('timer')).toHaveText('00:10')
    await checkControls()
    await page.screenshot({ path: info.outputPath('distractor.png') })
    await right()
    await checkControls()
    expect(
      await page.evaluate(() => Object.keys(localStorage).filter((k) => /writing-integration-preview|family/.test(k))),
    ).toEqual([])
    await page.reload()
    await page.getByRole('button', { name: 'Start or resume comparison' }).click()
    await expect(page.locator('.skywriting-trace-character')).toHaveCount(2)
    await right()
    await page.getByRole('button', { name: 'Skip Timer', exact: true }).click()
    await page.getByRole('button', { name: 'I got it wrong', exact: true }).click()
    await expect(page.locator('.skywriting-trace-character')).toHaveCount(2)
    await checkControls()
  })
}
