import { expect, test, type Page, type FrameLocator } from '@playwright/test'
import { strokeOrderGuide } from '../../src/familyBeta/strokeOrderSlay.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'

test.beforeEach(async ({ page }) => {
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
    HTMLMediaElement.prototype.play = () => Promise.reject(new Error('Synthetic speech only'))
  })
})

async function launch(page: Page, beforeSkip?: () => Promise<void>) {
  await page.goto('/family-beta-preview.html?grade=grade2')
  const frame = page.frameLocator('iframe:visible')
  await expect(frame.getByRole('heading', { name: /Ready for your next/ })).toBeVisible()
  if ((await page.getByLabel('Practice week').inputValue()) !== '2026-09-29') {
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByLabel('Practice week').selectOption({ label: '9/29–10/2' })
    await expect(page.locator('iframe:visible')).toHaveAttribute('src', /week=2026-09-29/)
  }
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await frame.getByRole('button', { name: 'Learn to Write', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Skip Warmup', exact: true })).toBeVisible()
  await beforeSkip?.()
  await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
  return frame
}

async function drawRemaining(page: Page, frame: FrameLocator, character: string) {
  const strokes = strokeOrderGuide({ id: 'pilot-guide', text: character }).strokes
  const layout = getStrokeLayout(strokes)
  const pad = frame.getByRole('region', { name: 'Stroke order teacher' }).locator('svg[role="application"]')
  const first = Number(await pad.getAttribute('data-next-stroke'))
  await pad.scrollIntoViewIfNeeded()
  for (let index = first; index < strokes.length; index++) {
    const bounds = (await pad.boundingBox())!
    const xy = (point: readonly [number, number]) =>
      [
        bounds.x + ((point[0] * layout.scale + layout.offsetX) * bounds.width) / 100,
        bounds.y + ((point[1] * layout.scale + layout.offsetY) * bounds.height) / 100,
      ] as const
    await page.mouse.move(...xy(strokes[index][0]))
    await page.mouse.down()
    for (const point of strokes[index].slice(1)) await page.mouse.move(...xy(point))
    await page.mouse.up()
    await expect(pad).toHaveAttribute('data-next-stroke', String(index + 1))
  }
}

test('actual Grade 2 launcher teaches a whole word, resumes a saved step, then hands off and repeats', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let frame = await launch(page)
  const teacher = () => frame.getByRole('region', { name: 'Stroke order teacher' })
  for (const [index, character] of [...'英雄'].entries()) {
    for (let step = 1; step <= 6; step++) {
      await expect(teacher()).toHaveAttribute('data-character-index', String(index))
      await expect(teacher()).toHaveAttribute('data-step', String(step))
      if (index === 0 && step === 4) {
        frame = await launch(page)
        await expect(teacher()).toHaveAttribute('data-step', '4')
        await page.screenshot({ path: info.outputPath('teacher-resumed.png'), fullPage: true })
      }
      await drawRemaining(page, frame, character)
      await frame.getByRole('button', { name: step === 6 ? 'Compare' : 'Next step', exact: true }).click()
      if (step === 6) await frame.getByRole('button', { name: 'I slayed it', exact: true }).click()
    }
  }
  await expect(teacher()).toHaveCount(0)
  const skip = frame.getByRole('button', { name: 'Skip Timer', exact: true })
  await expect(skip).toHaveCSS('background-color', 'rgb(49, 91, 134)')
  await page.screenshot({ path: info.outputPath('actual-scrolls.png'), fullPage: true })
  for (let i = 0; i < 30 && !(await teacher().isVisible()); i++) {
    await skip.click()
    await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
    await expect(skip.or(teacher())).toBeVisible()
  }
  await expect(teacher()).toHaveAttribute('data-character-index', '0')
  await expect(teacher()).toHaveAttribute('data-step', '1')
  await expect(frame.getByText('每个', { exact: true }).first()).toBeVisible()
  await frame.getByRole('button', { name: 'Exit game', exact: true }).click()
  await expect(frame.getByRole('heading', { name: /Ready for your next/ })).toBeVisible()
  expect(errors).toEqual([])
})

test('a failed teaching save keeps the finished ink and retries the same step', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    let failed = false
    Storage.prototype.setItem = function (key, raw) {
      if (!failed && key === 'family-beta-activity:preview-1:lesson-workspace-v1') {
        const records = JSON.parse(raw).records as Record<string, string>
        if (
          Object.values(records).some((value) => {
            const item = JSON.parse(value)
            return item.schema === 2 && item.values.writingAcquisitionProgress[0].revision === 1
          })
        ) {
          failed = true
          throw new Error('Synthetic storage failure')
        }
      }
      original.call(this, key, raw)
    }
  })
  const frame = await launch(page)
  const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
  await drawRemaining(page, frame, '英')
  await frame.getByRole('button', { name: 'Next step', exact: true }).click()
  await expect(teacher).toHaveAttribute('data-step', '1')
  await expect(teacher.getByRole('alert')).toContainText('could not be saved')
  await expect(teacher.locator('svg[role="application"]')).toHaveAttribute('data-next-stroke', '8')
  await frame.getByRole('button', { name: 'Next step', exact: true }).click()
  await expect(teacher).toHaveAttribute('data-step', '2')
})

test('the family report pauses the seven-second clue without advancing teaching', async ({ page }) => {
  const frame = await launch(page, async () => {
    const time = new Date()
    await page.clock.install({ time })
    await page.clock.pauseAt(new Date(time.getTime() + 1000))
  })
  const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
  await expect(teacher).toHaveAttribute('data-step', '1')
  await page.clock.runFor(3000)
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(frame.locator('html')).toHaveAttribute('data-activity-paused', 'true')
  await page.clock.runFor(20000)
  await expect(teacher.locator('.lg-vocabulary-main')).toBeVisible()
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  await expect(frame.locator('html')).toHaveAttribute('data-activity-paused', 'false')
  await page.clock.runFor(4001)
  await expect(teacher.locator('.lg-vocabulary-main')).toBeHidden()
  await expect(teacher).toHaveAttribute('data-step', '1')
})
