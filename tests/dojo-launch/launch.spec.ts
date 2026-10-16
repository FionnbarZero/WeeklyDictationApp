import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { finishEnabledTeacher } from '../family-sync/writingTeacherDriver.ts'
import { strokeOrderGuide } from '../../src/familyBeta/strokeOrderSlay.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'

const grades = [
  {
    slug: 'kindergarten',
    write: 'Writing characters',
    read: 'High-frequency words',
    first: '土',
    next: '花',
    week: '2026-10-12',
  },
  { slug: 'grade2', write: 'Learn to Write', read: 'Read the Words', first: '走', next: '最', week: '2026-10-13' },
  { slug: 'grade5', write: 'Learn to Write', read: 'Read the Words', first: '盐', next: '咸', week: '2026-10-05' },
]
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-16T19:00:00Z'))
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

async function dojo(page: Page, grade: (typeof grades)[number]) {
  await page.goto(`/family-beta-preview.html?grade=${grade.slug}`)
  await expect(page.getByRole('note')).toContainText('Prototype 1')
  const frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await expect(frame.locator('.learning-hub-activity')).toHaveCount(4)
  // Never select a historical week to make this test pass.
  await expect(page.getByLabel('Practice week')).toHaveValue('')
  await expect(page.locator('iframe:visible')).toHaveAttribute('data-family-week', grade.week)
  return frame
}
async function open(page: Page, frame: ReturnType<Page['frameLocator']>, button: string) {
  await frame.getByRole('button', { name: button, exact: true }).click()
  const warmup = frame.getByRole('button', { name: 'Skip Warmup', exact: true })
  const started = frame.getByRole('button', { name: /^(Exit game|Exit reading|Pause and return)$/ })
  await expect(warmup.or(started)).toBeVisible()
  if (await warmup.isVisible()) await warmup.click()
  await expect(started).toBeVisible()
}

async function firstTeachingStep(page: Page, character: string) {
  const frame = page.frameLocator('iframe:visible')
  const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
  const pad = teacher.locator('svg[role="application"]')
  const strokes = strokeOrderGuide({ id: 'resume-check', text: character }).strokes
  const layout = getStrokeLayout(strokes)
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
  await frame.getByRole('button', { name: 'Next step', exact: true }).click()
  await expect(teacher).toHaveAttribute('data-step', '2')
}

for (const grade of grades) {
  test(`${grade.slug}: reporting pauses teaching and returns without changing its saved position`, async ({ page }) => {
    const frame = await dojo(page, grade)
    await open(page, frame, grade.write)
    await firstTeachingStep(page, grade.first)
    const saved = () =>
      page.evaluate(() =>
        Object.fromEntries(
          Object.entries(localStorage).filter(
            ([key]) => key.startsWith('family-beta-acquisition-v1:') || key.endsWith(':lesson-workspace-v1'),
          ),
        ),
      )
    const before = await saved()
    expect(Object.keys(before).length).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Close and return', exact: true })).toBeVisible()
    expect(await saved()).toEqual(before)
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '2')
    expect(await saved()).toEqual(before)
  })

  test(`${grade.slug}: ordinary Writing resumes teaching after closing, without Saved lessons`, async ({ page }) => {
    let frame = await dojo(page, grade)
    await open(page, frame, grade.write)
    await firstTeachingStep(page, grade.first)
    // Abrupt navigation, not a graceful Exit; only confirmed steps are retained.
    // Saturday alone must not replace the unchanged active teacher lesson.
    const refreshed = JSON.parse(
      readFileSync(new URL(`../fixtures/dojo-launch-2026-10-16/${grade.slug}.json`, import.meta.url), 'utf8'),
    )
    refreshed.retrievedAt = '2026-10-17T18:00:00Z'
    await page.route(`**/curriculum/beta/${grade.slug}.json`, (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(refreshed) }),
    )
    await page.clock.setFixedTime(new Date('2026-10-17T19:00:00Z'))
    frame = await dojo(page, grade)
    await open(page, frame, grade.write)
    await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '2')
  })
}

for (const grade of grades)
  test(`${grade.slug}: ordinary Writing resumes the last validated lesson when offline after reopening`, async ({
    page,
  }) => {
    let frame = await dojo(page, grade)
    await open(page, frame, grade.write)
    await firstTeachingStep(page, grade.first)
    // Keep the local preview assets reachable, as a preinstalled offline shell
    // would; only curriculum retrieval is disconnected. No checkpoint edits.
    await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }))
    frame = await dojo(page, grade)
    await expect(page.getByRole('alert').filter({ hasText: /last validated teacher lesson/ })).toBeVisible()
    await open(page, frame, grade.write)
    await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '2')
  })

test('newly active targets start teaching while the older unfinished lesson stays preserved', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-11T19:00:00Z'))
  const earlier = { ...grades[0], week: '2026-10-05', first: '牛' }
  let frame = await dojo(page, earlier)
  await open(page, frame, earlier.write)
  await firstTeachingStep(page, earlier.first)
  const oldRecords = await page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('family-beta-acquisition-v1:'))),
  )
  expect(Object.keys(oldRecords)).toHaveLength(1)
  await page.clock.setFixedTime(new Date('2026-10-12T19:00:00Z'))
  frame = await dojo(page, grades[0])
  await open(page, frame, grades[0].write)
  const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
  await expect(teacher).toHaveAttribute('data-step', '1')
  await expect(teacher.getByRole('heading', { name: '土', exact: true })).toBeVisible()
  for (const [key, raw] of Object.entries(oldRecords))
    expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(raw)
})

for (const grade of grades) {
  for (const button of [grade.write, grade.read, 'Stroke Order Slay', 'Whispering Scrolls']) {
    test(`${grade.slug}: current-week ${button} opens, exits, and opens again`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      for (let visit = 0; visit < 2; visit++) {
        const frame = await dojo(page, grade)
        await open(page, frame, button)
        if (button === grade.write) {
          const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
          await expect(teacher).toBeVisible()
          await expect(teacher).toHaveAttribute('data-step', '1')
          await expect(teacher.getByRole('heading', { name: grade.first, exact: true })).toBeVisible()
        } else if (button === grade.read || button === 'Whispering Scrolls') {
          await expect(frame.getByRole('button', { name: 'Record my reading', exact: true })).toBeVisible()
        } else {
          await expect(frame.getByRole('heading', { name: 'Stroke Order Slay', exact: true })).toBeVisible()
        }
        await frame.getByRole('button', { name: /^(Exit game|Exit reading|Pause and return)$/ }).click()
        // Some existing exit controls park the owned frame in "Your paused
        // work"; others return to its hub. Both must leave active controls.
        await expect(frame.getByRole('button', { name: /^(Exit game|Exit reading|Pause and return)$/ })).toBeHidden()
      }
      expect(errors).toEqual([])
      expect(
        await page.evaluate(() =>
          Object.keys(localStorage).filter((k) => k.startsWith('family-beta-preview-results-v1:')),
        ),
      ).toEqual([])
    })
  }
}

test('missing future Kindergarten writing audio gives a visible error without blocking reading', async ({ page }) => {
  const snapshot = JSON.parse(
    readFileSync(new URL('../fixtures/dojo-launch-2026-10-16/kindergarten.json', import.meta.url), 'utf8'),
  )
  // Synthetic fixture only: replace this week's writing character, not the teacher file.
  snapshot.payload = JSON.parse(JSON.stringify(snapshot.payload).replaceAll('土', '龘'))
  snapshot.contentSha256 = createHash('sha256').update(JSON.stringify(snapshot.payload)).digest('hex')
  await page.route('**/curriculum/beta/kindergarten.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(snapshot) }),
  )
  const frame = await dojo(page, grades[0])
  await frame.getByRole('button', { name: grades[0].write, exact: true }).click()
  const alert = frame.getByRole('alert').filter({ hasText: /Writing audio.*龘/ })
  await expect(alert).toBeVisible()
  const box = (await alert.boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  await frame.getByRole('button', { name: grades[0].read, exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Record my reading', exact: true })).toBeVisible()
})

for (const grade of grades) {
  test(`${grade.slug}: repaired writing teaches, resumes, enters acquisition and teaches the next word`, async ({
    page,
  }) => {
    test.setTimeout(240_000)
    let frame = await dojo(page, grade)
    await open(page, frame, grade.write)
    const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
    await expect(teacher).toHaveAttribute('data-step', '1')
    await finishEnabledTeacher(page)
    await expect(frame.getByRole('button', { name: 'Skip Timer', exact: true })).toBeVisible()
    // Exit/reload must preserve the completed teacher rather than repeat it.
    await frame.getByRole('button', { name: 'Exit game', exact: true }).click()
    frame = await dojo(page, grade)
    await open(page, frame, grade.write)
    await expect(teacher).toBeHidden()
    for (let trial = 0; trial < 40 && !(await teacher.isVisible()); trial++) {
      const right = frame.getByRole('button', { name: 'I got it right', exact: true })
      const skip = frame.getByRole('button', { name: 'Skip Timer', exact: true })
      if (await skip.isVisible()) {
        await expect(skip).toBeEnabled()
        await skip.click()
      }
      await right.click()
      await expect(teacher.or(skip).or(right)).toBeVisible()
    }
    await expect(teacher).toBeVisible()
    await expect(teacher).toHaveAttribute('data-step', '1')
    await expect(teacher.getByRole('heading', { name: grade.next, exact: true })).toBeVisible()
  })
}
