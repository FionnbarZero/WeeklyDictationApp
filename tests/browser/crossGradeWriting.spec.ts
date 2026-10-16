import { expect, type Page, test } from '@playwright/test'
import {
  advanceWritingProgress,
  createWritingProgress,
  teachingPosition,
} from '../../src/application/writingAcquisition/progress.ts'
import { strokeOrderGuide } from '../../src/familyBeta/strokeOrderSlay.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'
import {
  CROSS_GRADE_PREVIEW_OWNER,
  crossGradeLessons,
  crossGradePreviewKey,
} from '../../src/writingAcquisition/crossGradeLessons.ts'

test.beforeEach(async ({ page, baseURL }) => {
  const allowedOrigin = new URL(baseURL!).origin
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === allowedOrigin ? route.continue() : route.abort(),
  )
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
})
async function begin(page: Page, grade: string) {
  await page.goto('/cross-grade-writing-preview.html')
  await page.getByLabel('Grade', { exact: true }).selectOption(grade)
  if (grade === 'Grade 5')
    await page.getByLabel('Teacher-source lesson').selectOption('grade-5__2026-27__2026-09-14__2026-09-18')
  await page.getByRole('button', { name: 'Start or resume writing', exact: true }).click()
  return page.getByRole('region', { name: 'Stroke order teacher' })
}
async function draw(page: Page, character: string) {
  const strokes = strokeOrderGuide({ id: 'cross-grade-browser', text: character }).strokes
  const layout = getStrokeLayout(strokes)
  const pad = page.getByRole('region', { name: 'Stroke order teacher' }).locator('svg[role="application"]')
  await pad.scrollIntoViewIfNeeded()
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
test('direct grade links open the intended prototype without a login', async ({ page }) => {
  for (const [query, grade] of [
    ['kindergarten', 'Kindergarten'],
    ['grade5', 'Grade 5'],
  ]) {
    const entry = process.env.CROSS_GRADE_URL ? '/' : '/cross-grade-writing-preview.html'
    await page.goto(`${entry}?grade=${query}`)
    await expect(page.getByLabel('Grade', { exact: true })).toHaveValue(grade)
    await expect(page.getByRole('button', { name: 'Start or resume writing', exact: true })).toBeEnabled()
    if (process.env.CROSS_GRADE_REVISION)
      await expect(page.locator('meta[name="build-revision"]')).toHaveAttribute(
        'content',
        process.env.CROSS_GRADE_REVISION,
      )
  }
})
for (const grade of ['Kindergarten', 'Grade 5']) {
  test(`${grade}: whole-word teacher, native acquisition, next-word teacher and isolated resume`, async ({
    page,
  }, info) => {
    await page.setViewportSize(
      process.env.CROSS_GRADE_PORTRAIT ? { width: 768, height: 1024 } : { width: 1024, height: 768 },
    )
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const teacher = await begin(page, grade)
    const word = grade === 'Kindergarten' ? '牛' : '或者'
    for (const [characterIndex, character] of [...word].entries()) {
      for (let step = 1; step <= 5; step++) {
        await expect(teacher).toHaveAttribute('data-character-index', String(characterIndex))
        await expect(teacher).toHaveAttribute('data-step', String(step))
        if (characterIndex === 0 && step === 2) {
          await page.reload()
          await expect(page.getByLabel('Grade', { exact: true })).toHaveValue(grade)
          await page.getByRole('button', { name: 'Start or resume writing', exact: true }).click()
          await expect(teacher).toHaveAttribute('data-step', '2')
          await expect(teacher.locator('svg[role="application"]')).toHaveAttribute('data-next-stroke', '0')
        }
        if (step === 5) {
          const guides = teacher.locator('.lg-stroke-guide path')
          if (grade === 'Kindergarten') expect(await guides.count()).toBeGreaterThan(0)
          else await expect(guides).toHaveCount(0)
        }
        await draw(page, character)
        await page.getByRole('button', { name: step === 5 ? 'Compare' : 'Next step', exact: true }).click()
        if (step === 5) await page.getByRole('button', { name: 'I slayed it', exact: true }).click()
      }
    }
    await expect(teacher).toHaveCount(0)
    await expect(page.locator('.slay-writing-integration')).toBeVisible()
    await expect(page.locator('.set-chip')).toContainText('Familiar DT')
    const skip = page.getByRole('button', { name: 'Skip Timer', exact: true })
    const correct = page.getByRole('button', { name: 'I got it right', exact: true })
    // Preserve the grade's two introductory DTs, then trace and independent.
    for (const kind of ['familiar-dt', 'familiar-dt', 'show-copy', 'target']) {
      expect(
        await page.evaluate(() => {
          const key = Object.keys(localStorage).find((key) => key.startsWith('ninja-cross-grade-writing-preview-v1:'))!
          return JSON.parse(localStorage.getItem(key)!).acquisition.flow.prompt.kind
        }),
      ).toBe(kind)
      if (kind === 'show-copy') {
        await expect(page.locator('.skywriting-trace-character')).toHaveCount([...word].length)
        await page.screenshot({ path: info.outputPath('slay-acquisition.png'), fullPage: true })
      }
      for (const control of [
        skip,
        page.getByRole('button', { name: 'Hear', exact: true }),
        page.getByRole('button', { name: 'Done for today', exact: true }),
        page.getByRole('button', { name: 'Report a problem', exact: true }),
      ]) {
        const b = (await control.boundingBox())!
        expect(b.x).toBeGreaterThanOrEqual(0)
        expect(b.y).toBeGreaterThanOrEqual(0)
        expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1)
        expect(b.y + b.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1)
      }
      await skip.click()
      await correct.click()
      await expect(skip.or(teacher)).toBeVisible()
    }
    for (let i = 0; i < 35 && !(await teacher.isVisible()); i++) {
      await expect(skip.or(correct).or(teacher)).toBeVisible()
      if (await teacher.isVisible()) break
      if (await skip.isVisible()) await skip.click()
      await correct.click()
      await expect(skip.or(teacher)).toBeVisible()
    }
    await expect(teacher).toHaveAttribute('data-step', '1')
    await expect(teacher).toHaveAttribute('data-character-index', '0')
    await expect(page.getByText(grade === 'Kindergarten' ? '羊' : '了解', { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Exit game', exact: true }).click()
    await page.reload()
    await expect(page.getByLabel('Grade', { exact: true })).toHaveValue(grade)
    await page.getByRole('button', { name: 'Start or resume writing', exact: true }).click()
    await expect(teacher).toHaveAttribute('data-step', '1')
    await page.screenshot({ path: info.outputPath('next-word-teacher.png'), fullPage: true })
    expect(errors).toEqual([])
    expect(
      await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('family-beta-'))),
    ).toEqual([])
  })
  test(`${grade}: report pauses the seven-second clue and drawing; grade switching preserves its checkpoint`, async ({
    page,
  }) => {
    await page.clock.install()
    const teacher = await begin(page, grade)
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    const before = await teacher.getAttribute('data-step')
    await page.clock.fastForward(9000)
    await expect(page.getByRole('button', { name: 'Next step', exact: true })).toBeDisabled()
    await expect(page.locator('.lg-vocabulary-main')).toBeVisible()
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await page.clock.fastForward(8000)
    await expect(page.locator('.lg-vocabulary-main')).toBeHidden()
    await expect(teacher).toHaveAttribute('data-step', before!)
    await page.getByRole('button', { name: 'Exit game', exact: true }).click()
    await page.getByLabel('Grade', { exact: true }).selectOption(grade === 'Grade 5' ? 'Kindergarten' : 'Grade 5')
    await page.getByRole('button', { name: 'Start or resume writing', exact: true }).click()
    await expect(teacher).toHaveAttribute('data-step', '1')
    expect(
      await page.evaluate(
        () => Object.keys(localStorage).filter((key) => key.startsWith('ninja-cross-grade-writing-preview-v1:')).length,
      ),
    ).toBe(2)
  })
}

test('Grade 5: three- and four-character acquisition fit the tablet, with usable completion and report controls', async ({
  page,
}, info) => {
  await page.setViewportSize(
    process.env.CROSS_GRADE_PORTRAIT ? { width: 768, height: 1024 } : { width: 1024, height: 768 },
  )
  const now = '2026-10-15T22:00:00.000Z'
  for (const text of ['神奇的', '各种各样']) {
    const lesson = crossGradeLessons('Grade 5').find((lesson) => lesson.targets.some((target) => target.text === text))!
    let progress = createWritingProgress(lesson, CROSS_GRADE_PREVIEW_OWNER, `layout-${text.length}`, now)
    // Reach a legitimate completed-teaching checkpoint through the same reducer.
    // The full interactive teaching path is covered above; this isolates layout size.
    for (let i = 0; i < 500; i++) {
      const position = teachingPosition(progress)
      const prompt = progress.acquisition.flow.prompt!
      if (!position && prompt.kind === 'show-copy' && prompt.word.text === text) break
      progress = advanceWritingProgress(
        progress,
        position
          ? { id: `layout-${i}`, kind: 'complete-teaching-step', expectedRevision: progress.revision, position }
          : {
              id: `layout-${i}`,
              kind: 'answer',
              expectedRevision: progress.revision,
              promptId: prompt.id,
              correct: true,
              revealMethod: 'skip_timer',
            },
        now,
      )
    }
    expect(progress.acquisition.flow.prompt?.word.text).toBe(text)
    await page.goto(`/cross-grade-writing-preview.html?grade=grade5&week=${lesson.dataset.id}`)
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
      key: crossGradePreviewKey('Grade 5', lesson.dataset.id),
      value: JSON.stringify(progress),
    })
    await page.getByRole('button', { name: 'Start or resume writing', exact: true }).click()
    const boxes = page.locator('.skywriting-scroll-cell')
    await expect(boxes).toHaveCount(text.length)
    await expect(page.locator('.skywriting-trace-character')).toHaveCount(text.length)
    for (const box of await boxes.all()) {
      const b = (await box.boundingBox())!
      expect(b.width).toBeGreaterThan(200)
      expect(b.height).toBeGreaterThan(200)
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width)
      expect(b.y + b.height).toBeLessThanOrEqual(page.viewportSize()!.height)
    }
    await page.screenshot({ path: info.outputPath(`acquisition-${text.length}-characters.png`), fullPage: true })
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Skip Timer', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await page.getByRole('button', { name: 'Done for today', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Start or resume writing', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Start or resume writing', exact: true }).click()
    await expect(boxes).toHaveCount(text.length)
  }
})
