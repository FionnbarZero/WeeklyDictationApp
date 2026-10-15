import type { Page } from '@playwright/test'
import {
  advanceWritingProgress,
  createWritingProgress,
  teachingPosition,
} from '../../src/application/writingAcquisition/progress.ts'
import { strokeOrderGuide } from '../../src/familyBeta/strokeOrderSlay.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'
import {
  IPAD_PREVIEW_KEY,
  REFINEMENT_PREVIEW_POLICY,
  REFINEMENT_PREVIEW_KEY as V7_PREVIEW_KEY,
  WRITING_PREVIEW_KEY,
  WRITING_PREVIEW_OWNER,
  writingPreviewLesson,
} from '../../src/writingAcquisition/previewLesson.ts'
import { expect, test } from './fixtures.ts'

const REFINEMENT_PREVIEW_KEY = process.env.WRITING_IPAD_PREVIEW ? IPAD_PREVIEW_KEY : V7_PREVIEW_KEY

async function audio(page: Page) {
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
    HTMLMediaElement.prototype.play = () => Promise.reject(new Error('Synthetic audio'))
  })
}
async function seed(page: Page) {
  const now = '2026-10-15T00:00:00.000Z'
  let p = createWritingProgress(
    writingPreviewLesson(REFINEMENT_PREVIEW_POLICY),
    WRITING_PREVIEW_OWNER,
    'v7-browser',
    now,
  )
  while (teachingPosition(p))
    p = advanceWritingProgress(
      p,
      {
        id: `step-${p.revision}`,
        expectedRevision: p.revision,
        kind: 'complete-teaching-step',
        position: teachingPosition(p)!,
      },
      now,
    )
  await page.addInitScript(
    ({ key, value, oldKey }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value)
      if (!localStorage.getItem(oldKey)) localStorage.setItem(oldKey, 'untouched-reference')
    },
    { key: REFINEMENT_PREVIEW_KEY, value: JSON.stringify(p), oldKey: WRITING_PREVIEW_KEY },
  )
}
async function begin(page: Page) {
  await page.goto('/grade2-writing-preview.html')
  await page.getByRole('button', { name: 'Start or resume writing', exact: true }).click()
}
async function right(page: Page) {
  await page.getByRole('button', { name: 'Skip Timer', exact: true }).click()
  await page.getByRole('button', { name: 'I got it right', exact: true }).click()
  await expect(page.getByRole('button', { name: 'I got it right', exact: true })).toHaveCount(0)
}
async function draw(page: Page, character: string) {
  const strokes = strokeOrderGuide({ id: 'v7', text: character }).strokes
  const layout = getStrokeLayout(strokes)
  const pad = page.getByRole('region', { name: 'Stroke order teacher' }).locator('svg[role="application"]')
  for (let i = Number(await pad.getAttribute('data-next-stroke')); i < strokes.length; i++) {
    const b = (await pad.boundingBox())!
    const xy = (p: readonly [number, number]) =>
      [
        b.x + ((p[0] * layout.scale + layout.offsetX) * b.width) / 100,
        b.y + ((p[1] * layout.scale + layout.offsetY) * b.height) / 100,
      ] as const
    await page.mouse.move(...xy(strokes[i][0]))
    await page.mouse.down()
    for (const point of strokes[i].slice(1)) await page.mouse.move(...xy(point))
    await page.mouse.up()
    await expect(pad).toHaveAttribute('data-next-stroke', String(i + 1))
  }
}

for (const width of [1663, 1366, 768, 390])
  test(`v7 large scrolls and usable controls at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 916 })
    await audio(page)
    await seed(page)
    await begin(page)
    await expect(page.locator('.skywriting-trace-character')).toHaveCount(2)
    const pads = page.locator('.skywriting-scroll-cell .skywriting-pad')
    const b = (await pads.first().boundingBox())!
    if (width === 1663) expect(b.width).toBeGreaterThan(450)
    if (width === 1366) expect(b.width).toBeGreaterThan(380)
    const skip = page.getByRole('button', { name: 'Skip Timer', exact: true })
    await expect(skip).toBeEnabled()
    for (const element of [skip, page.getByRole('textbox'), pads.first(), pads.last()]) {
      const box = (await element.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1)
      expect(box.y + box.height).toBeLessThanOrEqual(917)
    }
    await page.screenshot({ path: info.outputPath('v7-tracing.png') })
    await right(page)
    await expect(page.locator('.skywriting-trace-character')).toHaveCount(0)
    await expect(page.getByRole('timer')).toHaveText('00:25')
    await page.reload()
    await page.getByRole('button', { name: 'Start or resume writing', exact: true }).click()
    await expect(page.locator('.skywriting-trace-character')).toHaveCount(0)
    await right(page)
    await expect(page.locator('.set-chip')).toContainText('Familiar DT')
    await expect(page.getByRole('timer')).toHaveText('00:10')
    await page.screenshot({ path: info.outputPath('v7-distractor.png') })
    expect(await page.evaluate((key) => localStorage.getItem(key), WRITING_PREVIEW_KEY)).toBe('untouched-reference')
  })

test('v7 teacher → trace → independent → distractors → next word teacher; report and exit preserve progress', async ({
  page,
}) => {
  await audio(page)
  await begin(page)
  const teacher = page.getByRole('region', { name: 'Stroke order teacher' })
  for (const [index, character] of [...'英雄'].entries())
    for (let step = 1; step <= 5; step++) {
      await expect(teacher).toHaveAttribute('data-character-index', String(index))
      await expect(teacher).toHaveAttribute('data-step', String(step))
      await draw(page, character)
      await page.getByRole('button', { name: step === 5 ? 'Compare' : 'Next step', exact: true }).click()
      if (step === 5) await page.getByRole('button', { name: 'I slayed it', exact: true }).click()
    }
  await expect(page.locator('.skywriting-trace-character')).toHaveCount(2)
  await right(page)
  const before = await page.evaluate((k) => localStorage.getItem(k), REFINEMENT_PREVIEW_KEY)
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-activity-paused', 'true')
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  await page.getByRole('button', { name: 'Exit to preview menu', exact: true }).click()
  await page.getByRole('button', { name: 'Start or resume writing', exact: true }).click()
  expect(await page.evaluate((k) => localStorage.getItem(k), REFINEMENT_PREVIEW_KEY)).toBe(before)
  await expect(page.locator('.skywriting-trace-character')).toHaveCount(0)
  for (let i = 0; i < 10; i++) await right(page)
  await expect(teacher).toHaveAttribute('data-step', '1')
  await expect(teacher.getByRole('button', { name: 'Hear 每个', exact: true })).toBeVisible()
})

test('v7 Warmup layout sample repeats without altering the saved lesson', async ({ page }, info) => {
  await audio(page)
  await seed(page)
  await page.goto('/grade2-writing-preview.html')
  const before = await page.evaluate((k) => localStorage.getItem(k), REFINEMENT_PREVIEW_KEY)
  await page.getByRole('button', { name: 'Check Warmup scroll size', exact: true }).click()
  await expect(page.locator('.set-chip')).toContainText('Warmup')
  await expect(page.getByRole('timer')).toHaveText('00:10')
  expect((await page.locator('.skywriting-scroll-cell .skywriting-pad').first().boundingBox())!.width).toBeGreaterThan(
    450,
  )
  await page.screenshot({ path: info.outputPath('v7-warmup.png') })
  await right(page)
  await right(page)
  expect(await page.evaluate((k) => localStorage.getItem(k), REFINEMENT_PREVIEW_KEY)).toBe(before)
})
