import { expect, type Page, test } from '@playwright/test'
import { strokeOrderGuide } from '../../src/familyBeta/strokeOrderSlay.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'
import { finishEnabledTeacher } from '../family-sync/writingTeacherDriver.ts'

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-19T19:00:00Z'))
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === new URL(test.info().project.use.baseURL!).origin
      ? route.continue()
      : route.abort(),
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
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('playing'))
      setTimeout(() => this.dispatchEvent(new Event('ended')), 10)
      return Promise.resolve()
    }
  })
})

async function dojo(page: Page, week = '2026-10-19') {
  await page.goto('/family-beta-preview.html?grade=kindergarten')
  await expect(page.getByRole('note')).toContainText('Kindergarten October 19 resources / Prototype 1')
  const frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await expect(page.getByLabel('Practice week')).toHaveValue('')
  await expect(page.locator('iframe:visible')).toHaveAttribute('data-family-week', week)
  return frame
}
async function writing(page: Page, week?: string) {
  const frame = await dojo(page, week)
  await frame.getByRole('button', { name: 'Writing characters', exact: true }).click()
  const warmup = frame.getByRole('button', { name: 'Skip Warmup', exact: true })
  const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
  await expect(warmup.or(teacher)).toBeVisible()
  if (await warmup.isVisible()) await warmup.click()
  await expect(teacher).toBeVisible()
  return frame
}
async function firstStep(page: Page, character: string) {
  const frame = page.frameLocator('iframe:visible')
  const pad = frame.locator('svg[role="application"]')
  const strokes = strokeOrderGuide({ id: 'october19-check', text: character }).strokes
  const layout = getStrokeLayout(strokes)
  for (let i = 0; i < strokes.length; i++) {
    const box = (await pad.boundingBox())!
    const xy = (point: readonly [number, number]) =>
      [
        box.x + ((point[0] * layout.scale + layout.offsetX) * box.width) / 100,
        box.y + ((point[1] * layout.scale + layout.offsetY) * box.height) / 100,
      ] as const
    await page.mouse.move(...xy(strokes[i][0]))
    await page.mouse.down()
    for (const point of strokes[i].slice(1)) await page.mouse.move(...xy(point))
    await page.mouse.up()
    await expect(pad).toHaveAttribute('data-next-stroke', String(i + 1))
  }
  await frame.getByRole('button', { name: 'Next step', exact: true }).click()
  await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '2')
}
const saved = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('family-beta-acquisition-v1:'))),
  )

test('October 19: exact new recordings are non-empty WAV files in the isolated package', async ({ request }) => {
  const manifest = await (await request.get('/dojo-launch-manifest.json')).json()
  expect(manifest.prototype).toBe('Kindergarten October 19 resources / Prototype 1')
  expect(manifest.resourceLessonStartDate).toBe('2026-10-19')
  for (const stem of ['u866b', 'u4f60', 'u5bb6', 'u68ee-u6797']) {
    const response = await request.get(`/audio/kindergarten/${stem}.wav`)
    expect(response.ok()).toBe(true)
    const bytes = await response.body()
    expect(bytes.subarray(0, 4).toString()).toBe('RIFF')
    expect(bytes.subarray(8, 12).toString()).toBe('WAVE')
    expect(bytes.length).toBeGreaterThan(4096)
    expect(bytes.subarray(4096).some((value) => value !== 0)).toBe(true)
  }
})

test('October 19: new six-stroke teaching resumes and report/exit preserve the exact checkpoint', async ({ page }) => {
  let frame = await writing(page)
  const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
  await expect(teacher.getByRole('heading', { name: '虫', exact: true })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('october19-teacher.png'), fullPage: true })
  await firstStep(page, '虫')
  const before = await saved(page)
  expect(Object.keys(before)).toHaveLength(1)
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Close and return', exact: true })).toBeVisible()
  expect(await saved(page)).toEqual(before)
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  await frame.getByRole('button', { name: 'Exit game', exact: true }).click()
  frame = await writing(page)
  await expect(teacher).toHaveAttribute('data-step', '2')
  expect(await saved(page)).toEqual(before)
  await page.reload()
  frame = await writing(page)
  await expect(teacher).toHaveAttribute('data-step', '2')
  await expect(frame.locator('svg[role="application"]')).toHaveAttribute('data-next-stroke', '0')
  expect(await saved(page)).toEqual(before)
})

test('October 19: both words complete guided teaching and enter native acquisition on repeated use', async ({
  page,
}) => {
  test.setTimeout(240_000)
  expect(process.env.FAMILY_CURRENT_WRITING).toBe('1')
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let frame = await writing(page)
  const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
  await finishEnabledTeacher(page)
  await expect(frame.locator('.slay-writing-integration')).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('october19-acquisition.png'), fullPage: true })
  await frame.getByRole('button', { name: 'Exit game', exact: true }).click()
  frame = await dojo(page)
  await frame.getByRole('button', { name: 'Writing characters', exact: true }).click()
  await expect(frame.locator('.slay-writing-integration')).toBeVisible()
  await expect(teacher).toBeHidden()
  for (let trial = 0; trial < 40 && !(await teacher.isVisible()); trial++) {
    const skip = frame.getByRole('button', { name: 'Skip Timer', exact: true })
    const right = frame.getByRole('button', { name: 'I got it right', exact: true })
    await expect(teacher.or(skip).or(right)).toBeVisible()
    if (await teacher.isVisible()) break
    if (await skip.isVisible()) {
      await expect(skip).toBeEnabled()
      await skip.click()
    }
    await right.click()
  }
  await expect(teacher).toHaveAttribute('data-step', '1')
  await expect(teacher.getByRole('heading', { name: '小', exact: true })).toBeVisible()
  await finishEnabledTeacher(page)
  await expect(frame.locator('.slay-writing-integration')).toBeVisible()
  expect(errors).toEqual([])
})

test('October 19: reading opens, reports, exits and reopens with the source cohort intact', async ({ page }) => {
  for (let visit = 0; visit < 2; visit++) {
    const frame = await dojo(page)
    await frame.getByRole('button', { name: 'High-frequency words', exact: true }).click()
    await expect(frame.getByRole('button', { name: 'Record my reading', exact: true })).toBeVisible()
    await expect(frame.locator('.reading-answer-word')).toHaveText('你')
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await expect(frame.getByRole('button', { name: 'Record my reading', exact: true })).toBeVisible()
    await frame.getByRole('button', { name: 'Exit reading', exact: true }).click()
    await expect(frame.getByRole('button', { name: 'Record my reading', exact: true })).toBeHidden()
  }
})

test('October 19: scheduled activation keeps the previous unfinished lesson unchanged', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-18T19:00:00Z'))
  await writing(page, '2026-10-12')
  await firstStep(page, '土')
  const before = await saved(page)
  await page.clock.setFixedTime(new Date('2026-10-19T19:00:00Z'))
  const frame = await writing(page)
  const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
  await expect(teacher).toHaveAttribute('data-step', '1')
  await expect(teacher.getByRole('heading', { name: '虫', exact: true })).toBeVisible()
  for (const [key, raw] of Object.entries(before))
    expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(raw)
})
