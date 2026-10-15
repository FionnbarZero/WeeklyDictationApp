import { expect, test } from './fixtures.ts'
import type { Page } from '@playwright/test'
import { strokeOrderGuide } from '../../src/familyBeta/strokeOrderSlay.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'
import { WRITING_PREVIEW_KEY } from '../../src/writingAcquisition/previewLesson.ts'

async function syntheticAudio(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices() {
          return []
        },
        speak(utterance: SpeechSynthesisUtterance) {
          utterance.onstart?.({} as SpeechSynthesisEvent)
          window.setTimeout(() => utterance.onend?.({} as SpeechSynthesisEvent), 5)
        },
      },
    })
    HTMLMediaElement.prototype.play = () => Promise.reject(new Error('Use synthetic speech'))
  })
}

async function drawRemaining(page: Page, character: string) {
  const strokes = strokeOrderGuide({ id: 'test-guide', text: character }).strokes
  const layout = getStrokeLayout(strokes)
  const pad = page.getByRole('region', { name: 'Stroke order teacher' }).locator('svg[role="application"]')
  const first = Number(await pad.getAttribute('data-next-stroke'))
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

test('real ordered words complete teaching, retain saved steps and hand off through normal acquisition', async ({
  page,
}, info) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1366, height: 900 })
  await syntheticAudio(page)
  await page.goto('/grade2-writing-preview.html')
  await page.getByRole('button', { name: 'Start or resume writing', exact: true }).click()
  const teacher = page.getByRole('region', { name: 'Stroke order teacher' })
  for (const [characterIndex, character] of [...'英雄'].entries()) {
    for (let step = 1; step <= 6; step++) {
      await expect(teacher).toHaveAttribute('data-character-index', String(characterIndex))
      await expect(teacher).toHaveAttribute('data-step', String(step))
      if (characterIndex === 0 && step === 4) {
        await page.reload()
        await page.getByRole('button', { name: 'Start or resume writing', exact: true }).click()
        await expect(teacher).toHaveAttribute('data-step', '4')
        const pad = teacher.locator('svg[role="application"]')
        await expect(pad).toHaveAttribute('data-next-stroke', '5')
        await expect(pad.locator('.teacher-supplied-stroke')).toHaveCount(5)
        await page.screenshot({ path: info.outputPath('resumed-backward-chain.png') })
      }
      await drawRemaining(page, character)
      await page.getByRole('button', { name: step === 6 ? 'Compare' : 'Next step', exact: true }).click()
      if (step === 6) {
        await expect(page.getByRole('img', { name: `Correct character: ${character}`, exact: true })).toBeVisible()
        await page.getByRole('button', { name: 'I slayed it', exact: true }).click()
      }
    }
  }
  await expect(teacher).toHaveCount(0)
  await expect(page.locator('.skywriting-acquisition.is-grand-scroll')).toBeVisible()
  await expect(page.getByRole('timer')).toHaveText('00:10')
  await page.screenshot({ path: info.outputPath('saved-scroll-handoff.png') })
  // Complete the real engine's first word, including its Familiar DT and target trials.
  let answers = 0
  while ((await teacher.count()) === 0 && answers < 40) {
    const skip = page.getByRole('button', { name: 'Skip Timer', exact: true })
    await expect(skip).toBeEnabled()
    await skip.click()
    await page.getByRole('button', { name: 'I got it right', exact: true }).click()
    answers++
    await expect
      .poll(
        async () =>
          JSON.parse((await page.evaluate((key) => localStorage.getItem(key), WRITING_PREVIEW_KEY))!).acquisition
            .revision,
      )
      .toBe(answers)
  }
  await expect(teacher).toHaveAttribute('data-character-index', '0')
  await expect(teacher).toHaveAttribute('data-step', '1')
  await expect(teacher.getByRole('button', { name: 'Hear 每个', exact: true })).toBeVisible()
  await expect(teacher.locator('.lg-vocabulary-main')).toContainText('měi gè')
  await expect(teacher.locator('.lg-vocabulary-main')).toContainText('each')
  await page.screenshot({ path: info.outputPath('next-real-word.png') })
  await drawRemaining(page, '每')
  await page.getByRole('button', { name: 'Next step', exact: true }).click()
  await expect(teacher).toHaveAttribute('data-step', '2')
  await page.getByRole('button', { name: 'Exit to preview menu', exact: true }).click()
  await page.getByRole('button', { name: 'Start or resume writing', exact: true }).click()
  await expect(teacher).toHaveAttribute('data-step', '2')
  await expect(teacher.locator('svg[role="application"]')).toHaveAttribute('data-next-stroke', '0')
  const saved = JSON.parse((await page.evaluate((key) => localStorage.getItem(key), WRITING_PREVIEW_KEY))!)
  expect(saved.completedTeachingSteps.slice(0, 2)).toEqual([12, 1])
  expect(saved.acquisition.flow.targetIndex).toBe(1)
  expect(JSON.stringify(saved)).not.toMatch(/handwriting|learnerInk|recordingUrl/)
})

test('report pause preserves the seven-second clue and the teaching step', async ({ page }) => {
  await syntheticAudio(page)
  await page.clock.install({ time: new Date('2026-10-15T00:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-15T00:00:01Z'))
  await page.goto('/grade2-writing-preview.html')
  await page.getByRole('button', { name: 'Start or resume writing', exact: true }).click()
  // Opening the saved lesson is asynchronous. Wait for its trial effect before advancing the clock.
  await expect(page.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute(
    'data-report-audio',
    'playing',
  )
  await page.clock.runFor(3_000)
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-activity-paused', 'true')
  await page.clock.runFor(20_000)
  await expect(page.locator('.lg-vocabulary-main')).toBeVisible()
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-activity-paused', 'false')
  await page.clock.runFor(3_999)
  await expect(page.locator('.lg-vocabulary-main')).toBeVisible()
  await page.clock.runFor(1)
  await expect(page.locator('.lg-vocabulary-main')).toBeHidden()
  await expect(page.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '1')
})

test('failed step save stays retryable without clearing the completed drawing or skipping a step', async ({ page }) => {
  await syntheticAudio(page)
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (
        name === key &&
        JSON.parse(value).revision === 1 &&
        !(window as unknown as { __saveFailed?: boolean }).__saveFailed
      ) {
        ;(window as unknown as { __saveFailed?: boolean }).__saveFailed = true
        throw new Error('Simulated storage failure — retry the step')
      }
      original.call(this, name, value)
    }
  }, WRITING_PREVIEW_KEY)
  await page.goto('/grade2-writing-preview.html')
  await page.getByRole('button', { name: 'Start or resume writing', exact: true }).click()
  await drawRemaining(page, '英')
  await page.getByRole('button', { name: 'Next step', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Simulated storage failure')
  await expect(page.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '1')
  await page.getByRole('button', { name: 'Next step', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '2')
  await expect(page.getByRole('alert')).toHaveCount(0)
})
