import { expect, test } from './fixtures.ts'
import type { Page } from '@playwright/test'
import { strokeOrderGuide } from '../../src/familyBeta/strokeOrderSlay.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'
import {
  WRITING_PREVIEW_KEY,
  WRITING_PREVIEW_OWNER,
  WRITING_PREVIEW_POLICY,
  writingPreviewLesson,
} from '../../src/writingAcquisition/previewLesson.ts'
import {
  advanceWritingProgress,
  createWritingProgress,
  teachingPosition,
} from '../../src/application/writingAcquisition/progress.ts'

async function syntheticAudio(page: Page) {
  await page.addInitScript(() => {
    const spokenWords: string[] = []
    Object.defineProperty(window, '__teacherSpokenWords', { value: spokenWords })
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices() {
          return []
        },
        speak(utterance: SpeechSynthesisUtterance) {
          spokenWords.push(utterance.text)
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

for (const width of [1366, 768, 390]) {
  test(`Skip Timer is a visible button with unchanged review behavior at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await syntheticAudio(page)
    const now = '2026-10-15T00:00:00.000Z'
    let saved = createWritingProgress(
      writingPreviewLesson(WRITING_PREVIEW_POLICY),
      WRITING_PREVIEW_OWNER,
      'button-style-test',
      now,
      {
        random: () => 0.25,
      },
    )
    // Synthetic saved checkpoint at the real teacher-to-scroll boundary, not a bypass in app code.
    while (teachingPosition(saved)) {
      saved = advanceWritingProgress(
        saved,
        {
          id: `style-step-${saved.revision}`,
          kind: 'complete-teaching-step',
          expectedRevision: saved.revision,
          position: teachingPosition(saved)!,
        },
        now,
      )
    }
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
      key: WRITING_PREVIEW_KEY,
      value: JSON.stringify(saved),
    })
    await page.goto('/grade2-writing-preview.html')
    await page.getByRole('button', { name: 'Start or resume writing', exact: true }).click()
    const skip = page.getByRole('button', { name: 'Skip Timer', exact: true })
    await expect(skip).toBeVisible()
    await expect(skip).toBeEnabled()
    await expect(skip).toHaveCSS('background-color', 'rgb(49, 91, 134)')
    await expect(skip).toHaveCSS('color', 'rgb(255, 255, 255)')
    await expect(skip).toHaveCSS('border-top-width', '3px')
    const bounds = (await skip.boundingBox())!
    expect(bounds.width).toBeGreaterThanOrEqual(124)
    expect(bounds.height).toBeGreaterThanOrEqual(52)
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
    await skip.focus()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Shift+Tab')
    await expect(skip).toBeFocused()
    await expect(skip).toHaveCSS('outline-width', '4px')
    await page.screenshot({ path: info.outputPath('skip-timer-button.png') })
    await skip.press('Enter')
    await expect(page.getByRole('button', { name: 'I got it right', exact: true })).toBeVisible()
    await expect(skip).toHaveCount(0)
    expect(await page.evaluate((key) => localStorage.getItem(key), WRITING_PREVIEW_KEY)).toBe(JSON.stringify(saved))
  })
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
  let spokenCount = 0
  for (const [characterIndex, character] of [...'英雄'].entries()) {
    for (let step = 1; step <= 5; step++) {
      await expect(teacher).toHaveAttribute('data-character-index', String(characterIndex))
      await expect(teacher).toHaveAttribute('data-step', String(step))
      await expect
        .poll(() =>
          page.evaluate(() => (window as unknown as { __teacherSpokenWords: string[] }).__teacherSpokenWords.length),
        )
        .toBe(++spokenCount)
      expect(
        await page.evaluate(() =>
          (window as unknown as { __teacherSpokenWords: string[] }).__teacherSpokenWords.at(-1),
        ),
      ).toBe('英雄')
      await expect(teacher.locator('.lg-round-label')).toContainText(`Step ${step} of 5`)
      const labels = [
        'Watch and trace',
        'Trace again',
        'Finish the last third',
        'Finish the last two-thirds',
        'Write and compare',
      ]
      await expect(teacher.locator('.lg-phase-steps')).toHaveAttribute(
        'aria-label',
        `Current step: ${labels[step - 1]}`,
      )
      await expect(teacher.getByText('Trace one more time', { exact: true })).toHaveCount(0)
      if (characterIndex === 0 && step === 3) {
        await page.reload()
        await page.getByRole('button', { name: 'Start or resume writing', exact: true }).click()
        await expect(teacher).toHaveAttribute('data-step', '3')
        const pad = teacher.locator('svg[role="application"]')
        await expect(pad).toHaveAttribute('data-next-stroke', '5')
        await expect(pad.locator('.teacher-supplied-stroke')).toHaveCount(5)
        spokenCount = 1 // Reload starts a new synthetic audio log and rereads the resumed word.
        await expect
          .poll(() =>
            page.evaluate(() => (window as unknown as { __teacherSpokenWords: string[] }).__teacherSpokenWords.length),
          )
          .toBe(spokenCount)
        await page.screenshot({ path: info.outputPath('resumed-backward-chain.png') })
      }
      if (step === 4) {
        const count = strokeOrderGuide({ id: 'count', text: character }).strokes.length
        await expect(teacher.locator('.teacher-supplied-stroke')).toHaveCount(Math.floor(count / 3))
      }
      if (step === 5) {
        await expect(teacher.locator('.lg-stroke-guide path')).toHaveCount(0)
        await expect(teacher.locator('.lg-stroke-marker')).toHaveCount(0)
      }
      await drawRemaining(page, character)
      await page.getByRole('button', { name: step === 5 ? 'Compare' : 'Next step', exact: true }).click()
      if (step === 5) {
        await expect(page.getByRole('img', { name: `Correct character: ${character}`, exact: true })).toBeVisible()
        if (characterIndex === 0) {
          await page.getByRole('button', { name: 'Trace it again', exact: true }).click()
          await expect(teacher).toHaveAttribute('data-step', '5')
          await expect(teacher.locator('svg[role="application"]')).toHaveAttribute('data-next-stroke', '0')
          await expect
            .poll(() =>
              page.evaluate(
                () => (window as unknown as { __teacherSpokenWords: string[] }).__teacherSpokenWords.length,
              ),
            )
            .toBe(++spokenCount)
          await drawRemaining(page, character)
          await page.getByRole('button', { name: 'Compare', exact: true }).click()
        }
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
  expect(saved.completedTeachingSteps.slice(0, 2)).toEqual([10, 1])
  expect(saved.acquisition.flow.targetIndex).toBe(1)
  expect(JSON.stringify(saved)).not.toMatch(/handwriting|learnerInk|recordingUrl/)
})

test('five-step backward chain rejects errors in place and preserves the old preview record', async ({ page }) => {
  await syntheticAudio(page)
  const now = '2026-10-15T00:00:00.000Z'
  let saved = createWritingProgress(
    writingPreviewLesson(WRITING_PREVIEW_POLICY),
    WRITING_PREVIEW_OWNER,
    'five-step-errors',
    now,
  )
  for (let i = 0; i < 2; i++) {
    saved = advanceWritingProgress(
      saved,
      {
        id: `error-step-${i}`,
        kind: 'complete-teaching-step',
        expectedRevision: i,
        position: teachingPosition(saved)!,
      },
      now,
    )
  }
  const oldKey = 'ninja-writing-integration-preview-v5:synthetic-owner'
  const oldBytes = JSON.stringify(
    createWritingProgress(writingPreviewLesson(), WRITING_PREVIEW_OWNER, 'six-step-reference', now),
  )
  await page.addInitScript(
    ({ key, value, oldKey, oldBytes }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value)
      if (!localStorage.getItem(oldKey)) localStorage.setItem(oldKey, oldBytes)
    },
    { key: WRITING_PREVIEW_KEY, value: JSON.stringify(saved), oldKey, oldBytes },
  )
  await page.goto('/grade2-writing-preview.html')
  await page.getByRole('button', { name: 'Start or resume writing', exact: true }).click()
  const teacher = page.getByRole('region', { name: 'Stroke order teacher' })
  const pad = teacher.locator('svg[role="application"]')
  const strokes = strokeOrderGuide({ id: 'error-guide', text: '英' }).strokes
  const layout = getStrokeLayout(strokes)
  for (const step of [3, 4, 5]) {
    await expect(teacher).toHaveAttribute('data-step', String(step))
    const next = Number(await pad.getAttribute('data-next-stroke'))
    const bounds = (await pad.boundingBox())!
    const points = [...strokes[next]].reverse()
    const xy = (point: readonly [number, number]) =>
      [
        bounds.x + ((point[0] * layout.scale + layout.offsetX) * bounds.width) / 100,
        bounds.y + ((point[1] * layout.scale + layout.offsetY) * bounds.height) / 100,
      ] as const
    await page.mouse.move(...xy(points[0]))
    await page.mouse.down()
    for (const point of points.slice(1)) await page.mouse.move(...xy(point))
    await page.mouse.up()
    await expect(teacher.getByRole('status')).toContainText('Go the other way')
    await expect(teacher).toHaveAttribute('data-step', String(step))
    await expect(pad).toHaveAttribute('data-next-stroke', String(next))
    await expect(pad.locator('.lg-stroke-guide > path')).toHaveCount(1)
    await expect(page.getByRole('button', { name: step === 5 ? 'Compare' : 'Next step', exact: true })).toBeDisabled()
    await drawRemaining(page, '英')
    await page.getByRole('button', { name: step === 5 ? 'Compare' : 'Next step', exact: true }).click()
  }
  await page.getByRole('button', { name: 'I slayed it', exact: true }).click()
  await expect(teacher).toHaveAttribute('data-character-index', '1')
  expect(await page.evaluate((key) => localStorage.getItem(key), oldKey)).toBe(oldBytes)
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
