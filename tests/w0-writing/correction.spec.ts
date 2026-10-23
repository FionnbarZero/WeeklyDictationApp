import { expect, type Page, test } from '@playwright/test'
import type { WritingProgress } from '../../src/application/writingAcquisition/contracts.ts'
import { finishEnabledTeacher } from '../family-sync/writingTeacherDriver.ts'

const grades = [
  {
    slug: 'kindergarten',
    write: 'Writing characters',
    read: 'High-frequency words',
    policy: 'kindergarten-five-step-preview-v1',
    week: '2026-10-12',
  },
  {
    slug: 'grade2',
    write: 'Learn to Write',
    read: 'Read the Words',
    policy: 'grade2-copy-memory-preview-v8',
    week: '2026-10-13',
  },
  {
    slug: 'grade5',
    write: 'Learn to Write',
    read: 'Read the Words',
    policy: 'grade5-five-step-preview-v1',
    week: '2026-10-05',
  },
]
test.beforeEach(async ({ context, page, baseURL }) => {
  await page.clock.setFixedTime(new Date('2026-10-16T19:00:00Z'))
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === new URL(baseURL!).origin ? route.continue() : route.abort(),
  )
  await context.addInitScript(() => {
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
})

async function launch(page: Page, grade: (typeof grades)[number], writing = true, referenceWeek = true) {
  await page.goto(`/family-beta-preview.html?grade=${grade.slug}`)
  await expect(page.locator('.beta-parent-tools > summary')).toBeVisible()
  if (referenceWeek) await expect(page.locator('iframe:visible')).toHaveAttribute('data-family-week', grade.week)
  const frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await expect(frame.getByRole('button', { name: 'Stroke Order Slay', exact: true })).toHaveCount(0)
  await expect(frame.getByRole('button', { name: 'Whispering Scrolls', exact: true })).toHaveCount(0)
  await frame.getByRole('button', { name: writing ? grade.write : grade.read, exact: true }).click()
  const warmup = frame.getByRole('button', { name: 'Skip Warmup', exact: true })
  const exit = frame.getByRole('button', { name: /^(Exit game|Exit reading|Pause and return)$/ })
  await expect(warmup.or(exit)).toBeVisible()
  if (await warmup.isVisible()) await warmup.click()
  await expect(exit).toBeVisible()
  return frame
}

async function saved(page: Page): Promise<WritingProgress> {
  return page.evaluate(() => {
    for (const raw of Object.values(localStorage)) {
      let record
      try {
        record = JSON.parse(raw)
      } catch {
        continue
      }
      if (record.writing) return record.writing
      for (const nested of Object.values(record.records || {})) {
        try {
          const progress = JSON.parse(nested as string).values?.writingAcquisitionProgress?.[0]
          if (progress) return progress
        } catch {
          /* Other protected records. */
        }
      }
    }
    throw new Error('No writing checkpoint saved')
  })
}
async function answer(page: Page, correct = true) {
  const before = await saved(page)
  const frame = page.frameLocator('iframe:visible')
  const skip = frame.getByRole('button', { name: 'Skip Timer', exact: true })
  const response = frame.getByRole('button', { name: correct ? 'I got it right' : 'I got it wrong', exact: true })
  await expect(skip.or(response)).toBeVisible()
  if (await skip.isVisible()) await skip.click()
  await response.click()
  await expect.poll(async () => (await saved(page)).revision).toBe(before.revision + 1)
}

for (const grade of grades) {
  test(`${grade.slug}: today's default writing link opens without selecting an older week`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-23T19:00:00Z'))
    const frame = await launch(page, grade, true, false)
    await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toBeVisible()
    expect((await saved(page)).lesson.policy).toBe(grade.policy)
  })
  test(`${grade.slug}: real teacher, acquisition, report pause and ordinary writing resume`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    let frame = await launch(page, grade)
    expect((await saved(page)).lesson.policy).toBe(grade.policy)
    await finishEnabledTeacher(page)
    const initial = await saved(page)
    expect(initial.completedTeachingSteps[0]).toBe([...initial.lesson.targets[0].text].length * 5)
    await answer(page)
    const before = await saved(page)
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Close and return', exact: true })).toBeVisible()
    expect(await saved(page)).toEqual(before)
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    expect(await saved(page)).toEqual(before)
    // Close mid-acquisition; use the ordinary writing route, not Saved lessons.
    frame = await launch(page, grade)
    expect(await saved(page)).toEqual(before)
    await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toBeHidden()
    await answer(page)
    await page.screenshot({ path: test.info().outputPath(`${grade.slug}-acquisition.png`), fullPage: true })
    // Native K/G5 rules remain pinned; every grade must finish this word and
    // teach the next one instead of dropping directly into acquisition.
    for (let i = 0; i < 35 && (await saved(page)).acquisition.flow.targetIndex === 0; i++) await answer(page)
    expect((await saved(page)).acquisition.flow.targetIndex).toBe(1)
    await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '1')
    await frame.getByRole('button', { name: /^(Exit game|Pause and return)$/ }).click()
    await expect(frame.getByRole('button', { name: grade.write, exact: true })).toBeVisible()
    expect(errors).toEqual([])
  })
  test(`${grade.slug}: reading still opens, exits and reopens`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    for (let i = 0; i < 2; i++) {
      const frame = await launch(page, grade, false)
      await frame.getByRole('button', { name: /^(Exit game|Exit reading|Pause and return)$/ }).click()
      await expect(frame.getByRole('button', { name: grade.read, exact: true })).toBeVisible()
    }
    expect(errors).toEqual([])
  })
}

test('grade2: four wrong memory trials remain copy/memory, reload both steps, then resume distractors', async ({
  page,
}) => {
  await launch(page, grades[1])
  await finishEnabledTeacher(page)
  await answer(page) // initial trace
  await answer(page, false) // independent error
  for (let i = 0; i < 4; i++) {
    let p = await saved(page)
    expect(p.acquisition.flow.phase).toBe('correction')
    expect(p.acquisition.flow.prompt!.kind).toBe('show-copy')
    expect(p.acquisition.flow.targetIndex).toBe(0)
    if (i === 0) {
      await launch(page, grades[1])
      expect(await saved(page)).toEqual(p)
    }
    await answer(page)
    p = await saved(page)
    expect(p.acquisition.flow.prompt!.kind).toBe('target')
    expect(p.acquisition.flow.prompt!.revealed).toBe(false)
    if (i === 0) {
      await launch(page, grades[1])
      expect(await saved(page)).toEqual(p)
    }
    await answer(page, false)
  }
  await answer(page)
  await answer(page)
  expect((await saved(page)).acquisition.flow.phase).toBe('expanded-trials')
  expect((await saved(page)).acquisition.flow.prompt!.kind).toBe('familiar-dt')
  for (let i = 0; i < 15 && (await saved(page)).acquisition.flow.targetIndex === 0; i++) await answer(page)
  await expect(
    page.frameLocator('iframe:visible').getByRole('region', { name: 'Stroke order teacher' }),
  ).toHaveAttribute('data-step', '1')
  expect((await saved(page)).acquisition.flow.targetIndex).toBe(1)
})
