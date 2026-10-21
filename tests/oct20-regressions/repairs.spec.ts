import { expect, type Page, test } from '@playwright/test'
import { strokeOrderGuide } from '../../src/familyBeta/strokeOrderSlay.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'

test.beforeEach(async ({ page }) => {
  if (!test.info().title.includes('Lily Pads')) await page.clock.setFixedTime(new Date('2026-10-20T19:00:00Z'))
  // Fault injection is deliberately separate from the real-media check below.
  await page.addInitScript(() => {
    const host = window.top as unknown as { regressionAudio?: { hold: boolean; played: string[] } }
    host.regressionAudio ||= { hold: false, played: [] }
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
          setTimeout(() => u.onend?.({} as SpeechSynthesisEvent), 10)
        },
      },
    })
    HTMLMediaElement.prototype.play = function () {
      host.regressionAudio!.played.push(this.src)
      this.dispatchEvent(new Event('playing'))
      if (!(host.regressionAudio!.hold && this.src.startsWith('blob:')))
        setTimeout(() => this.dispatchEvent(new Event('ended')), 20)
      return Promise.resolve()
    }
    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: class {
        static isTypeSupported() {
          return true
        }
        state = 'inactive'
        mimeType = 'audio/wav'
        ondataavailable?: (event: { data: Blob }) => void
        onstop?: () => void
        start() {
          this.state = 'recording'
        }
        stop() {
          this.state = 'inactive'
          const data = new ArrayBuffer(204)
          const wav = new DataView(data)
          const text = (offset: number, s: string) =>
            [...s].forEach((c, i) => wav.setUint8(offset + i, c.charCodeAt(0)))
          text(0, 'RIFF')
          wav.setUint32(4, 196, true)
          text(8, 'WAVE')
          text(12, 'fmt ')
          wav.setUint32(16, 16, true)
          wav.setUint16(20, 1, true)
          wav.setUint16(22, 1, true)
          wav.setUint32(24, 8000, true)
          wav.setUint32(28, 16000, true)
          wav.setUint16(32, 2, true)
          wav.setUint16(34, 16, true)
          text(36, 'data')
          wav.setUint32(40, 160, true)
          this.ondataavailable?.({ data: new Blob([data], { type: 'audio/wav' }) })
          this.onstop?.()
        }
        pause() {
          this.state = 'paused'
        }
        resume() {
          this.state = 'recording'
        }
      },
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        async getUserMedia() {
          return { getTracks: () => [{ stop() {}, enabled: true }] }
        },
      },
    })
  })
})

const frameOf = (page: Page) => page.frameLocator('iframe:visible')
async function launch(page: Page, grade: string, section: RegExp, activity: string) {
  await page.goto(`/family-beta-preview.html?grade=${grade}`)
  await expect(page.getByRole('note')).toContainText('October 20 regression repairs / Prototype 1')
  const frame = frameOf(page)
  await frame.getByRole('button', { name: section }).click()
  await frame.getByRole('button', { name: activity, exact: true }).click()
  return frame
}
const stored = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      Object.entries(localStorage).filter(
        ([key]) => key.startsWith('family-beta-acquisition-v1:') || key.endsWith(':lesson-workspace-v1'),
      ),
    ),
  )

for (const [grade, activity, character] of [
  ['kindergarten', 'Writing characters', '虫'],
  ['grade2', 'Learn to Write', '走'],
]) {
  test(`${grade}: enlarged teacher scrolls, reports and resumes its confirmed step`, async ({ page }) => {
    let frame = await launch(page, grade, /Enter the Dojo/, activity)
    const warmup = frame.getByRole('button', { name: 'Skip Warmup', exact: true })
    const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
    await expect(warmup.or(teacher)).toBeVisible()
    if (await warmup.isVisible()) await warmup.click()
    await expect(teacher).toHaveAttribute('data-step', '1')
    const pad = teacher.locator('svg[role="application"]')
    await pad.scrollIntoViewIfNeeded()
    const box = (await pad.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(320)
    const strokes = strokeOrderGuide({ id: 'test', text: [...character][0] }).strokes
    const layout = getStrokeLayout(strokes)
    for (let i = 0; i < strokes.length; i++) {
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
    const before = await stored(page)
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await page.getByLabel('What did you see or hear?').fill('Synthetic layout check — no child information.')
    await page.getByRole('button', { name: 'Save report on this device', exact: true }).click()
    await page.getByRole('button', { name: 'Report another problem', exact: true }).click()
    await expect(page.getByLabel('What did you see or hear?')).toBeFocused()
    await page.getByLabel('What did you see or hear?').fill('Second synthetic report.')
    await page.getByRole('button', { name: 'Save report on this device', exact: true }).click()
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    expect(await stored(page)).toEqual(before)
    await frame.getByRole('button', { name: 'Exit game', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Your paused work' })).toBeHidden()
    await expect(frame.getByRole('button', { name: activity, exact: true })).toBeVisible()
    await frame.getByRole('button', { name: activity, exact: true }).click()
    await expect(teacher).toHaveAttribute('data-step', '2')
    await page.reload()
    frame = frameOf(page)
    await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
    await frame.getByRole('button', { name: activity, exact: true }).click()
    await expect(teacher).toHaveAttribute('data-step', '2')
    await page.screenshot({ path: test.info().outputPath(`${grade}-teacher.png`), fullPage: true })
  })
}

test('Grade 2 Warmup has larger writing boxes and exits to the same activity menu', async ({ page }) => {
  const frame = await launch(page, 'grade2', /Enter the Dojo/, 'Learn to Write')
  await frame.getByRole('button', { name: 'Begin Warmup', exact: true }).click()
  const canvas = frame.locator('.skywriting-scroll-cell svg').first()
  await expect(canvas).toBeVisible()
  expect((await canvas.boundingBox())!.width).toBeGreaterThan(230)
  await frame.getByRole('button', { name: 'Exit practice', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Learn to Write', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your paused work' })).toBeHidden()
})

for (const grade of ['kindergarten', 'grade2']) {
  test(`${grade}: reading recovers stalled playback and a failed save without losing the prompt`, async ({ page }) => {
    const frame = await launch(
      page,
      grade,
      /Enter the Dojo/,
      grade === 'kindergarten' ? 'High-frequency words' : 'Read the Words',
    )
    const current = frame.locator('[data-report-activity="Reading practice"]')
    await expect(frame.getByRole('button', { name: 'Record my reading', exact: true })).toBeVisible()
    await page.evaluate(() => {
      ;(window as unknown as { regressionAudio: { hold: boolean } }).regressionAudio.hold = true
    })
    await frame.getByRole('button', { name: 'Record my reading', exact: true }).click()
    await frame.getByRole('button', { name: 'Stop recording', exact: true }).click()
    await expect(frame.getByRole('button', { name: 'Restart playback', exact: true })).toBeVisible()
    const position = await current.getAttribute('data-report-position')
    await page.evaluate(() => {
      ;(window as unknown as { regressionAudio: { hold: boolean } }).regressionAudio.hold = false
    })
    await frame.getByRole('button', { name: 'Restart playback', exact: true }).click()
    const review = frame.getByRole('button', { name: /^(Continue|Yes)$/ })
    await expect(review).toBeEnabled()
    const activityFrame = await (await page.locator('iframe:visible').elementHandle())!.contentFrame()
    await activityFrame!.evaluate(() => {
      const original = Storage.prototype.setItem
      let once = true
      Storage.prototype.setItem = function (key, value) {
        if (once && key.startsWith('family-beta-acquisition-v1:')) {
          once = false
          throw new Error('Synthetic full disk')
        }
        original.call(this, key, value)
      }
    })
    await review.click()
    await expect(frame.getByRole('button', { name: 'Retry saving response', exact: true })).toBeVisible()
    expect(await current.getAttribute('data-report-position')).toBe(position)
    await frame.getByRole('button', { name: 'Retry saving response', exact: true }).click()
    await expect(frame.getByRole('button', { name: 'Retry saving response', exact: true })).toBeHidden()
    await expect(frame.getByRole('button', { name: 'Record my reading', exact: true })).toBeVisible()
    await frame.getByRole('button', { name: 'Exit reading', exact: true }).click()
    await expect(
      frame.getByRole('button', {
        name: grade === 'kindergarten' ? 'High-frequency words' : 'Read the Words',
        exact: true,
      }),
    ).toBeVisible()
  })
}

for (const game of ['Shadow Strike Dojo', 'Memory Lanterns', 'Listening Lily Pads']) {
  test(`Kindergarten: ${game} responds repeatedly and exits without a saved-game dialog`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let frame = await launch(page, 'kindergarten', /Practice your Ninja Skills/, game)
    for (let visit = 0; visit < 2; visit++) {
      await expect(frame.getByRole('button', { name: /^Exit (game|learning module)$/ })).toBeVisible()
      if (game === 'Memory Lanterns') {
        const lanterns = frame.locator('.lg-lantern-card:not(:disabled)')
        await expect(lanterns.first()).toBeVisible()
        await lanterns.nth(0).click()
        await lanterns.nth(1).click()
        await expect(frame.locator('.lg-stat-row')).toContainText('1')
      } else if (game === 'Listening Lily Pads') {
        await expect(frame.locator('.lg-phaser-stage canvas')).toBeVisible()
        await expect(frame.locator('.lg-phaser-stage')).toHaveAttribute('data-input-ready', 'true', { timeout: 20000 })
        const box = (await frame.locator('.lg-phaser-stage').boundingBox())!
        expect(box.width).toBeLessThanOrEqual(test.info().project.use.viewport!.width)
        await frame.getByRole('button', { name: 'Hear clue', exact: true }).click()
        await frame.locator('.lg-phaser-stage').click({ position: { x: box.width * 0.79, y: box.height * 0.7 } })
        await expect(frame.locator('.lg-progress')).toContainText('1/3', { timeout: 20000 })
      } else {
        const targets = frame.getByRole('group', { name: 'Answer choices', exact: true }).getByRole('button')
        await expect(targets.first()).toBeVisible()
        await targets.first().click()
        await expect(frame.locator('.lg-feedback')).toBeVisible()
      }
      await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
      await expect(page.getByRole('dialog', { name: 'Report a problem', exact: true })).toContainText(game)
      await page.getByRole('button', { name: 'Close and return', exact: true }).click()
      await frame.getByRole('button', { name: /^Exit (game|learning module)$/ }).click()
      await expect(frame.getByRole('button', { name: game, exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Your paused work' })).toBeHidden()
      if (visit === 0) {
        await frame.getByRole('button', { name: game, exact: true }).click()
        frame = frameOf(page)
      }
    }
    expect(errors).toEqual([])
  })
}

test('Grade 2 Shuriken accepts multiple pairs and does not checkpoint each timer tick', async ({ page }) => {
  const frame = await launch(page, 'grade2', /Practice your Ninja Skills/, 'Shuriken Match')
  const cards = frame.locator('.lg-word-seal')
  await expect(cards.first()).toBeVisible()
  const first = cards.filter({ hasText: /^英雄$/ })
  expect(
    await first.locator('span').evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(40)
  await page.screenshot({ path: test.info().outputPath('grade2-shuriken.png'), fullPage: true })
  // Public teacher vocabulary: Mandarin/English, never synthetic lesson edits.
  await first.click()
  await cards.filter({ hasText: /^hero$/i }).click()
  await expect(frame.locator('.lg-shuriken-stat-row')).toContainText('1 targets cleared')
  const active = frame.locator('.lg-word-seal:not(:disabled)')
  await active.first().click()
  await expect(frame.locator('.lg-word-seal.is-selected')).toHaveCount(1)
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => /game-checkpoint/.test(key)))).toEqual([])
  await frame.getByRole('button', { name: 'Exit learning module', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Shuriken Match', exact: true })).toBeVisible()
})

test('Final Boss exits directly, frees the temporary visit and returns to its test menu', async ({ page }) => {
  const frame = await launch(page, 'kindergarten', /The Final Boss Test/, 'Reading Test')
  await expect(frame.getByRole('button', { name: 'Pause and return', exact: true })).toBeHidden()
  await frame.getByRole('button', { name: 'Exit without saving', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Reading Test', exact: true })).toBeVisible()
  await expect(frame.getByRole('heading', { name: 'Exit without saving?', exact: true })).toBeHidden()
})

test('Lily Pads completed game survives a failed save and retries exactly one result', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const frame = await launch(page, 'kindergarten', /Practice your Ninja Skills/, 'Listening Lily Pads')
  const stage = frame.locator('.lg-phaser-stage')
  for (let crossing = 1; crossing <= 3; crossing++) {
    await expect(stage).toHaveAttribute('data-input-ready', 'true', { timeout: 20000 })
    const box = (await stage.boundingBox())!
    await stage.click({ position: { x: box.width * 0.79, y: box.height * 0.7 } })
    await expect(frame.locator('.lg-progress')).toContainText(`${crossing}/3`, { timeout: 20000 })
  }
  const canvas = await frame.locator('.lg-phaser-stage canvas').elementHandle()
  await page.screenshot({ path: test.info().outputPath('kindergarten-lily.png'), fullPage: true })
  const activityFrame = await (await page.locator('iframe:visible').elementHandle())!.contentFrame()
  await activityFrame!.evaluate(() => {
    const host = window as unknown as { failScoreSave: boolean }
    host.failScoreSave = true
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (host.failScoreSave && key.startsWith('family-beta-preview-results-v1:'))
        throw new Error('Synthetic full storage')
      original.call(this, key, value)
    }
  })
  const finish = frame.getByRole('button', { name: 'Celebrate and finish', exact: true })
  await finish.click()
  await expect(frame.getByRole('alert')).toContainText('could not be saved')
  expect(await canvas!.evaluate((el) => el.isConnected)).toBe(true)
  const box = (await stage.boundingBox())!
  await stage.click({ position: { x: box.width * 0.79, y: box.height * 0.7 } })
  await expect(frame.locator('.lg-progress')).toContainText('3/3')
  await activityFrame!.evaluate(() => {
    ;(window as unknown as { failScoreSave: boolean }).failScoreSave = false
  })
  await finish.click()
  await expect(frame.getByRole('button', { name: 'Listening Lily Pads', exact: true })).toBeVisible()
  const results = await page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([key]) => key.startsWith('family-beta-preview-results-v1:'))
      .map(([, raw]) => JSON.parse(raw)),
  )
  expect(results).toHaveLength(1)
  expect(results[0].attempted).toBe(3)
  expect(errors).toEqual([])
})
