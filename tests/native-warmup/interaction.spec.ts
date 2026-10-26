import { expect, type FrameLocator, type Page, test } from '@playwright/test'
import { writingCharacterGuides } from '../../src/application/writingAcquisition/lesson.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'
import { grades, snapshot } from '../automatic-curriculum/fixtures.ts'

test.beforeEach(async ({ page, context }) => {
  await page.clock.setSystemTime(new Date('2026-10-23T19:00:00Z'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await context.route('**/curriculum/beta/*.json', (route) =>
    route.fulfill({
      json: snapshot(
        route
          .request()
          .url()
          .match(/(kindergarten|grade2|grade5)\.json/)![1],
      ),
    }),
  )
  await context.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('playing'))
      setTimeout(() => this.dispatchEvent(new Event('ended')), 50)
      return Promise.resolve()
    }
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices: () => [],
        speak(u: SpeechSynthesisUtterance) {
          u.onstart?.({} as SpeechSynthesisEvent)
          setTimeout(() => u.onend?.({} as SpeechSynthesisEvent), 50)
        },
      },
    })
  })
})
async function launch(page: Page, grade: (typeof grades)[number]) {
  const f = page.frameLocator('iframe:visible')
  const section = f.getByRole('button', {
    name: grade.slug === 'kindergarten' ? /Enter the Spirit Realm/ : /Enter the Dojo/,
  })
  const activity = f.getByRole('button', {
    name: grade.slug === 'kindergarten' ? 'Writing mastery warmup' : grade.write,
    exact: true,
  })
  await expect(section.or(activity)).toBeVisible()
  if (await section.isVisible()) await section.click()
  await f
    .getByRole('button', { name: grade.slug === 'kindergarten' ? 'Writing mastery warmup' : grade.write, exact: true })
    .click()
  if (grade.slug !== 'kindergarten') await f.getByRole('button', { name: 'Begin Warmup', exact: false }).click()
  await expect(f.locator('.native-warmup')).toBeVisible()
  return f
}
async function trial(page: Page, f: FrameLocator) {
  const id = await f.locator('.native-warmup').getAttribute('data-report-target')
  return page.evaluate((id) => {
    const key = Object.keys(localStorage).find(
      (k) => k.includes('native-writing-warmup-trial-v1:') && k.includes(`:${id}:`),
    )!
    return { key, word: key.split(':').at(-1)!, state: JSON.parse(localStorage.getItem(key)!) }
  }, id)
}
async function compare(f: FrameLocator) {
  const skip = f.getByRole('button', { name: 'Skip Timer', exact: true })
  await expect(skip).toBeEnabled({ timeout: 30_000 })
  await skip.click()
  await expect(f.locator('.native-warmup')).toHaveAttribute('data-report-phase', 'compare')
}
async function trace(page: Page, f: FrameLocator, word: string, start = 0) {
  const guides = writingCharacterGuides(word)
  for (let c = start; c < guides.length; c++) {
    const region = f.getByRole('region', { name: 'Warmup stroke guide' })
    await expect(region).toHaveAttribute('data-character-index', String(c))
    const pad = region.locator('svg[role="application"]')
    await expect(pad).toBeInViewport({ ratio: 1 })
    const box = (await pad.boundingBox())!
    expect(box.width).toBeGreaterThan(230)
    const layout = getStrokeLayout(guides[c])
    const xy = (p: readonly [number, number]) =>
      [
        box.x + ((p[0] * layout.scale + layout.offsetX) * box.width) / 100,
        box.y + ((p[1] * layout.scale + layout.offsetY) * box.height) / 100,
      ] as const
    for (const [i, stroke] of guides[c].entries()) {
      await page.mouse.move(...xy(stroke[0]))
      await page.mouse.down()
      for (const p of stroke.slice(1)) await page.mouse.move(...xy(p))
      await page.mouse.up()
      await expect(pad).toHaveAttribute('data-next-stroke', String(i + 1))
    }
    await region.getByRole('button', { name: /^(Next character|Write the whole word)$/ }).click()
  }
  await expect(f.locator('.native-warmup')).toHaveAttribute('data-report-phase', 'memory')
}
for (const grade of grades) {
  test(`${grade.label}: native words, correction, report, exit/reopen and first-attempt result`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`./family-beta-preview.html?grade=${grade.slug}`)
    let f = await launch(page, grade)
    await compare(f)
    await f.getByRole('button', { name: 'I got it wrong', exact: true }).click()
    await expect(f.locator('.native-warmup')).toHaveAttribute('data-report-phase', 'trace')
    const first = await trial(page, f)
    expect(first.state.firstAnswers).toEqual([false])
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await expect(f.locator('html')).toHaveAttribute('data-activity-paused', 'true')
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await f.getByRole('button', { name: 'Exit game', exact: true }).click()
    // Reopen through the actual grade menu; never through a demonstration route.
    f = await launch(page, grade)
    await expect(f.locator('.native-warmup')).toHaveAttribute('data-report-phase', 'trace')
    expect((await trial(page, f)).key).toEqual(first.key)
    await trace(page, f, first.word)
    await compare(f)
    await f.getByRole('button', { name: 'I got it wrong', exact: true }).click()
    await trace(page, f, first.word)
    await compare(f)
    await f.getByRole('button', { name: 'I got it right', exact: true }).click()
    await expect(f.locator('.native-warmup')).toHaveAttribute('data-report-position', '2')
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).firstAnswers, first.key)).toEqual([
      false,
    ])
    await compare(f)
    await f.getByRole('button', { name: 'I got it wrong', exact: true }).click()
    const second = await trial(page, f)
    // Reload, then the normal entry must retain the second word's correction.
    await page.reload()
    f = await launch(page, grade)
    await expect(f.locator('.native-warmup')).toHaveAttribute('data-report-position', '2')
    await expect(f.locator('.native-warmup')).toHaveAttribute('data-report-phase', 'trace')
    expect((await trial(page, f)).key).toEqual(second.key)
    expect(errors).toEqual([])
    await page.screenshot({ path: test.info().outputPath(`${grade.slug}-native-warmup.png`), fullPage: true })
  })
}

for (const grade of grades) {
  test(`${grade.label}: finish native Warmup and hand back to the grade-owned activity`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`./family-beta-preview.html?grade=${grade.slug}`)
    const f = await launch(page, grade)
    const progress = await f.getByLabel(/Game progress:/).getAttribute('aria-label')
    const total = Number(progress!.match(/\/ (\d+)/)![1])
    expect(total).toBeGreaterThan(0)
    for (let i = 0; i < total; i++) {
      await expect(f.locator('.native-warmup')).toHaveAttribute('data-report-position', String(i + 1))
      await compare(f)
      await f.getByRole('button', { name: 'I got it right', exact: true }).click()
    }
    if (grade.slug === 'kindergarten') {
      await expect(f.getByText(`${total} of ${total} correct on the first try.`)).toBeVisible()
      await f.getByRole('button', { name: 'Done', exact: true }).click()
      // Done acquires the native visit lock before committing its result.
      // Wait for that completion, rather than reading during the queued save.
      await expect(f.locator('.native-warmup')).toHaveCount(0)
      const stored = await page.evaluate(() =>
        Object.entries(localStorage).flatMap(([key, v]) => {
          if (!key.startsWith('family-beta-preview-results-v1:')) return []
          try {
            const x = JSON.parse(v)
            return x.activity === 'Spirit Realm · writing · warmup' ? [x] : []
          } catch {
            return []
          }
        }),
      )
      expect(stored).toHaveLength(1)
      expect(stored[0]).toMatchObject({ correct: total, attempted: total })
    } else await expect(f.getByRole('region', { name: 'Stroke order teacher' })).toBeVisible()
    expect(errors).toEqual([])
  })
  test(`${grade.label}: a failed checkpoint keeps the comparison; retry preserves the first failure`, async ({
    page,
  }) => {
    await page.goto(`./family-beta-preview.html?grade=${grade.slug}`)
    const f = await launch(page, grade)
    await compare(f)
    await f.locator('body').evaluate(() => {
      const original = Storage.prototype.setItem
      ;(window as Window & { restoreNativeWarmup: () => void }).restoreNativeWarmup = () => {
        Storage.prototype.setItem = original
      }
      Storage.prototype.setItem = function (k, v) {
        if (k.includes('native-writing-warmup-trial')) throw new Error('Synthetic storage failure')
        return original.call(this, k, v)
      }
    })
    await f.getByRole('button', { name: 'I got it wrong', exact: true }).click()
    await expect(f.getByRole('alert')).toContainText('Synthetic storage failure')
    await expect(f.locator('.native-warmup')).toHaveAttribute('data-report-phase', 'compare')
    await f
      .locator('body')
      .evaluate(() => (window as Window & { restoreNativeWarmup: () => void }).restoreNativeWarmup())
    await f.getByRole('button', { name: 'I got it wrong', exact: true }).click()
    await expect(f.locator('.native-warmup')).toHaveAttribute('data-report-phase', 'trace')
    expect((await trial(page, f)).state.firstAnswers).toEqual([false])
  })
}

test('Grade 2 Spirit Realm uses the same approved correction with native mastery facts', async ({ page }) => {
  await page.goto('./family-beta-preview.html?grade=grade2')
  const f = page.frameLocator('iframe:visible')
  await f.getByRole('button', { name: /Enter the Spirit Realm/ }).click()
  await f.getByRole('button', { name: 'Writing mastery warmup', exact: true }).click()
  await compare(f)
  await f.getByRole('button', { name: 'I got it wrong', exact: true }).click()
  await expect(f.locator('.native-warmup')).toHaveAttribute('data-report-phase', 'trace')
  const original = await trial(page, f)
  await trace(page, f, original.word)
  await compare(f)
  await f.getByRole('button', { name: 'I got it right', exact: true }).click()
  await expect(f.locator('.native-warmup')).toHaveAttribute('data-report-position', '2')
  const mastery = await page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([k]) => k.startsWith('family-beta-mastery-v1:') && k.endsWith(':Grade 2:writing'))
      .map(([, v]) => JSON.parse(v)),
  )
  expect(mastery).toHaveLength(1)
  expect(mastery[0].applied).toHaveLength(1)
  expect(mastery[0].states.some((s: { bucket: string }) => s.bucket === 'needs-attention')).toBe(true)
})
