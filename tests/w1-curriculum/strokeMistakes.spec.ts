import { expect, test } from '@playwright/test'
import { strokeOrderGuide } from '../../src/familyBeta/strokeOrderSlay.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'

test('corrected Grade 2 teacher survives repeated mistakes, retry, report and reopening', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-23T19:00:00Z') })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices() {
          return []
        },
        speak(u: SpeechSynthesisUtterance) {
          u.onstart?.({} as SpeechSynthesisEvent)
          setTimeout(() => u.onend?.({} as SpeechSynthesisEvent), 5)
        },
      },
    })
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('playing'))
      setTimeout(() => this.dispatchEvent(new Event('ended')), 10)
      return Promise.resolve()
    }
  })
  await page.goto('/family-beta-preview.html?grade=grade2&example=curriculum-repair')
  const frame = page.frameLocator('iframe:visible')
  const repair = frame.getByRole('button', { name: 'Use corrected lesson · keep old work' })
  await repair.click()
  await expect(repair).toHaveCount(0)
  async function launch() {
    await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
    await frame.getByRole('button', { name: 'Learn to Write', exact: true }).click()
    const warmup = frame.getByRole('button', { name: 'Skip Warmup', exact: true })
    const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
    await expect(warmup.or(teacher)).toBeVisible()
    if (await warmup.isVisible()) await warmup.click()
    await expect(teacher).toBeVisible()
  }
  await launch()
  const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
  const pad = teacher.locator('svg[role="application"]')
  const strokes = strokeOrderGuide({ id: 'test-zou', text: '走' }).strokes
  const layout = getStrokeLayout(strokes)
  async function draw(points: readonly (readonly [number, number])[]) {
    const b = (await pad.boundingBox())!
    const xy = (p: readonly [number, number]) =>
      [
        b.x + ((p[0] * layout.scale + layout.offsetX) * b.width) / 100,
        b.y + ((p[1] * layout.scale + layout.offsetY) * b.height) / 100,
      ] as const
    await page.mouse.move(...xy(points[0]))
    await page.mouse.down()
    for (const p of points.slice(1)) await page.mouse.move(...xy(p), { steps: 2 })
    await page.mouse.up()
  }
  for (let step = 1; step <= 5; step++) {
    await expect(teacher).toHaveAttribute('data-step', String(step))
    const supplied = Number(await pad.getAttribute('data-next-stroke'))
    for (let mistake = 0; mistake < 6; mistake++) {
      // Control only the 700 ms rejected-stroke lifetime. Real time continues
      // for normal drawing, animation, navigation and saved-progress startup.
      if (mistake < 2) await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 1000))
      // A reversed short stroke can fit the approved endpoint tolerance.
      // Use an unmistakably wrong path, without changing teaching criteria.
      await draw([
        [5, 5],
        [95, 5],
        [5, 95],
        [95, 95],
      ])
      await expect(teacher.getByRole('status')).toHaveClass(/is-error/)
      await expect(pad).toHaveAttribute('data-next-stroke', String(supplied))
      await expect(frame.getByRole('button', { name: 'Exit game', exact: true })).toBeVisible()
      if (mistake === 0) {
        await page.clock.runFor(701)
        await expect(frame.getByRole('button', { name: 'Undo stroke', exact: true })).toBeDisabled()
        await expect(pad).toHaveAttribute('data-next-stroke', String(supplied))
      }
      if (mistake === 1 || mistake === 3) {
        await frame.getByRole('button', { name: mistake === 1 ? 'Undo stroke' : 'Clear pad', exact: true }).click()
        await expect(pad).toHaveAttribute('data-next-stroke', String(supplied))
        await expect(teacher.getByRole('status')).not.toHaveClass(/is-error/)
      }
      if (mistake < 2) await page.clock.resume()
    }
    if (step === 3) {
      await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
      await page.getByRole('button', { name: 'Close and return', exact: true }).click()
      await expect(teacher).toHaveAttribute('data-step', '3')
      await frame.getByRole('button', { name: 'Exit game', exact: true }).click()
      await expect(frame.getByRole('button', { name: 'Learn to Write', exact: true })).toBeVisible()
      await page.reload()
      await launch()
      await expect(teacher).toHaveAttribute('data-step', '3')
    }
    for (let i = supplied; i < strokes.length; i++) {
      await draw(strokes[i])
      await expect(pad).toHaveAttribute('data-next-stroke', String(i + 1))
    }
    // Additional strokes after completion must not read beyond the guide.
    await draw([...strokes[0]].reverse())
    await expect(pad).toHaveAttribute('data-next-stroke', String(strokes.length))
    await frame.getByRole('button', { name: step === 5 ? 'Compare' : 'Next step', exact: true }).click()
  }
  for (let retry = 0; retry < 4; retry++) {
    await frame.getByRole('button', { name: 'Trace it again', exact: true }).click()
    await draw([...strokes[0]].reverse())
    await expect(pad).toHaveAttribute('data-next-stroke', '0')
    for (let i = 0; i < strokes.length; i++) {
      await draw(strokes[i])
      await expect(pad).toHaveAttribute('data-next-stroke', String(i + 1))
    }
    await frame.getByRole('button', { name: 'Compare', exact: true }).click()
  }
  await frame.getByRole('button', { name: 'I slayed it', exact: true }).click()
  await expect(teacher).toBeHidden()
  await expect(frame.getByRole('button', { name: 'Skip Timer', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
