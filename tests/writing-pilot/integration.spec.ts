import { expect, test, type Page, type FrameLocator } from '@playwright/test'
import { strokeOrderGuide } from '../../src/familyBeta/strokeOrderSlay.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'
import { createWritingLesson } from '../../src/application/writingAcquisition/lesson.ts'
import {
  advanceWritingProgress,
  createWritingProgress,
  teachingPosition,
  type WritingProgress,
} from '../../src/application/writingAcquisition/progress.ts'

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

async function openDojo(page: Page) {
  await page.goto('/family-beta-preview.html?grade=grade2')
  const frame = page.frameLocator('iframe:visible')
  await expect(frame.getByRole('heading', { name: /Ready for your next/ })).toBeVisible()
  if ((await page.getByLabel('Practice week').inputValue()) !== '2026-09-29') {
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByLabel('Practice week').selectOption({ label: '9/29–10/2' })
    await expect(page.locator('iframe:visible')).toHaveAttribute('src', /week=2026-09-29/)
  }
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  return frame
}

async function launch(page: Page, beforeSkip?: () => Promise<void>) {
  const frame = await openDojo(page)
  await frame.getByRole('button', { name: 'Learn to Write', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Skip Warmup', exact: true })).toBeVisible()
  await beforeSkip?.()
  await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
  return frame
}

for (const tryOtherActivity of [false, true]) {
  test(`Start retries the exact initial checkpoint after a lost save confirmation${tryOtherActivity ? ' and rejects Stroke Order without hiding retry' : ''}`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const get = Storage.prototype.getItem,
        set = Storage.prototype.setItem
      let failRead = false,
        failed = false
      const writes: string[] = []
      Object.assign(window, { writingLaunchWrites: writes })
      Storage.prototype.getItem = function (key) {
        if (key === 'family-beta-activity:preview-1:lesson-workspace-v1' && failRead) {
          failRead = false
          throw new Error('Synthetic initial save readback failure')
        }
        return get.call(this, key)
      }
      Storage.prototype.setItem = function (key, raw) {
        set.call(this, key, raw)
        if (key !== 'family-beta-activity:preview-1:lesson-workspace-v1') return
        const records = JSON.parse(raw).records as Record<string, string>
        if (
          !Object.entries(records).some(
            ([name, value]) =>
              name.startsWith('weekly-dictation-checkpoint-v1:activity:') && JSON.parse(value).schema === 2,
          )
        )
          return
        writes.push(raw)
        if (!failed) {
          failed = true
          failRead = true
        }
      }
    })
    const frame = await openDojo(page)
    const start = frame.getByRole('button', { name: 'Learn to Write', exact: true })
    await start.click()
    await expect(frame.getByText(/could not (?:be saved|save its initial progress record)/).first()).toBeVisible()
    await expect(frame.getByRole('button', { name: 'Skip Warmup', exact: true })).toHaveCount(0)
    if (tryOtherActivity) {
      const writesBefore = await page.evaluate(
        () => (window as unknown as { writingLaunchWrites: string[] }).writingLaunchWrites.length,
      )
      for (let attempt = 0; attempt < 2; attempt++) {
        await frame.getByRole('button', { name: 'Stroke Order Slay', exact: true }).click()
        await expect(
          frame.getByText('Retry Learn to Write before starting another activity. Your pending lesson is preserved.', {
            exact: true,
          }),
        ).toBeVisible()
        await expect(start).toBeVisible()
        await expect(frame.getByText('Opening Warmup…', { exact: true })).toHaveCount(0)
        await expect(frame.getByRole('button', { name: 'Skip Warmup', exact: true })).toHaveCount(0)
      }
      expect(
        await page.evaluate(() => (window as unknown as { writingLaunchWrites: string[] }).writingLaunchWrites.length),
      ).toBe(writesBefore)
    }
    await start.click()
    await expect(frame.getByRole('button', { name: 'Skip Warmup', exact: true })).toBeVisible()
    const writes = await page.evaluate(
      () => (window as unknown as { writingLaunchWrites: string[] }).writingLaunchWrites,
    )
    expect(writes.length).toBeGreaterThanOrEqual(2)
    expect(writes[1]).toBe(writes[0])
    await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
    await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '1')
    if (tryOtherActivity) {
      // Once confirmation succeeds, the ordinary Stroke Order entry still works.
      await frame.getByRole('button', { name: 'Exit game', exact: true }).click()
      await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
      await frame.getByRole('button', { name: 'Stroke Order Slay', exact: true }).click()
      await expect(frame.getByRole('button', { name: 'Skip Warmup', exact: true })).toBeVisible()
    }
  })
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
    for (let step = 1; step <= 5; step++) {
      await expect(teacher()).toHaveAttribute('data-character-index', String(index))
      await expect(teacher()).toHaveAttribute('data-step', String(step))
      await expect(teacher().locator('.lg-round-label')).toContainText(`Step ${step} of 5`)
      const labels = [
        'Watch and trace',
        'Trace again',
        'Finish the last third',
        'Finish the last two-thirds',
        'Write and compare',
      ]
      await expect(teacher().locator('.lg-phase-steps')).toHaveAttribute(
        'aria-label',
        `Current step: ${labels[step - 1]}`,
      )
      if (index === 0 && step === 3) {
        frame = await launch(page)
        await expect(teacher()).toHaveAttribute('data-step', '3')
        await expect(teacher().locator('.teacher-supplied-stroke')).toHaveCount(5)
        await page.screenshot({ path: info.outputPath('teacher-resumed.png'), fullPage: true })
      }
      await drawRemaining(page, frame, character)
      await frame.getByRole('button', { name: step === 5 ? 'Compare' : 'Next step', exact: true }).click()
      if (step === 5) await frame.getByRole('button', { name: 'I slayed it', exact: true }).click()
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

test('the integrated view resumes a pinned six-step save without relabeling its final trial', async ({ page }) => {
  await launch(page)
  const key = 'family-beta-activity:preview-1:lesson-workspace-v1'
  const workspace = JSON.parse((await page.evaluate((key) => localStorage.getItem(key), key))!)
  const entry = Object.entries(workspace.records as Record<string, string>).find(
    ([name, raw]) => name.startsWith('weekly-dictation-checkpoint-v1:activity:') && JSON.parse(raw).schema === 2,
  )!
  const record = JSON.parse(entry[1])
  const current = record.values.writingAcquisitionProgress[0] as WritingProgress
  // Disposable fixture representing a predecessor's confirmed checkpoint. No
  // real records are migrated; the production reader must preserve this policy.
  let previous = createWritingProgress(
    createWritingLesson(current.lesson.dataset),
    current.owner,
    current.attemptId,
    current.createdAt,
    { initial: current.acquisition },
  )
  for (let i = 0; i < 5; i++)
    previous = advanceWritingProgress(
      previous,
      {
        id: `legacy-teaching-${i}`,
        kind: 'complete-teaching-step',
        expectedRevision: i,
        position: teachingPosition(previous)!,
      },
      current.updatedAt,
    )
  record.values.writingAcquisitionProgress = [previous]
  workspace.records[entry[0]] = JSON.stringify(record)
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw: JSON.stringify(workspace) })
  const frame = await launch(page)
  const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
  await expect(teacher).toHaveAttribute('data-character-index', '0')
  await expect(teacher).toHaveAttribute('data-step', '6')
  await expect(teacher.locator('.lg-round-label')).toContainText('Step 6 of 6')
  await expect(teacher.locator('.lg-phase-steps')).toHaveAttribute('aria-label', 'Current step: Write and compare')
  await drawRemaining(page, frame, '英')
  await frame.getByRole('button', { name: 'Compare', exact: true }).click()
  await frame.getByRole('button', { name: 'I slayed it', exact: true }).click()
  await expect(teacher).toHaveAttribute('data-character-index', '1')
  await expect(teacher.locator('.lg-round-label')).toContainText('Step 1 of 6')
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
