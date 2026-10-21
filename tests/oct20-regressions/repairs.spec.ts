import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { inspectSnapshot } from '../../src/familyBeta/curriculum.ts'
import { reinforcementGames } from '../../src/familyBeta/gamePools.ts'
import { strokeOrderGuide } from '../../src/familyBeta/strokeOrderSlay.ts'
import { checkpointGameAnswer, gameScopeKey, startGameCheckpoint } from '../../src/ninjaSkills/progress.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'
import { finishEnabledTeacher } from '../family-sync/writingTeacherDriver.ts'

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
const gameCheckpoints = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      Object.entries(localStorage).filter(([key]) => /^family-beta-games-v1:[\w-]+:checkpoint:/.test(key)),
    ),
  )
async function launch(page: Page, grade: string, section: RegExp, activity: string) {
  await page.goto(`/family-beta-preview.html?grade=${grade}`)
  await expect(page.getByRole('note')).toContainText('October 20 regression repairs / Prototype 3')
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
  // Public teacher vocabulary: Mandarin/English, never synthetic lesson edits.
  await first.click()
  await page.screenshot({ path: test.info().outputPath('grade2-shuriken.png'), fullPage: true })
  await cards.filter({ hasText: /^hero$/i }).click()
  await expect(frame.locator('.lg-shuriken-stat-row')).toContainText('1 targets cleared')
  await cards.filter({ hasText: /^每个$/ }).click()
  await cards.filter({ hasText: /^each$/i }).click()
  await expect(frame.locator('.lg-shuriken-stat-row')).toContainText('2 targets cleared')
  expect(await gameCheckpoints(page)).toEqual({})
  await frame.getByRole('button', { name: 'Exit learning module', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Shuriken Match', exact: true })).toBeVisible()
})

for (const activity of ['Whispering Scrolls', 'Stroke Order Slay']) {
  for (const action of ['finish', 'scored finish', 'answer']) {
    test(`${activity}: delayed ${action} cannot write or close a reopened visit`, async ({ page }) => {
      const frame = await launch(page, 'kindergarten', /Enter the Dojo/, activity)
      await expect(frame.getByRole('heading', { name: activity, exact: true })).toBeVisible()
      async function prepareResponse() {
        if (activity === 'Whispering Scrolls') {
          await frame.getByRole('button', { name: 'Record my reading', exact: true }).click()
          await frame.getByRole('button', { name: 'Stop recording', exact: true }).click()
        } else {
          await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
        }
        await expect(frame.getByRole('button', { name: /^(Continue|Yes)$/ })).toBeEnabled()
      }
      if (action === 'scored finish') {
        for (let trial = 0; trial < 4; trial++) {
          await prepareResponse()
          const before = await stored(page)
          await frame.getByRole('button', { name: /^(Continue|Yes)$/ }).click()
          await expect.poll(() => stored(page)).not.toEqual(before)
        }
      } else if (action === 'answer') await prepareResponse()
      const ledgers = () =>
        page.evaluate(() =>
          Object.fromEntries(
            Object.entries(localStorage).filter(
              ([key]) =>
                key.startsWith('family-beta-preview-results-v1') || key.startsWith('family-beta-preview-pending-v1'),
            ),
          ),
        )
      const owner = await (await page.locator('iframe:visible').elementHandle())!.contentFrame()
      const moduleId = activity === 'Whispering Scrolls' ? 'whispering-scrolls' : 'stroke-order-slay'
      const lockName = await owner!.evaluate((moduleId) => {
        const entry = Object.entries(localStorage).find(
          ([key, value]) => key.startsWith('family-beta-acquisition-v1:') && value.includes(moduleId),
        )
        if (!entry) throw new Error('Expected an actual acquisition checkpoint')
        const name = `ninja-scrolls-write:${entry[0]}`
        const host = window as Window & { releaseAuditLock?: () => void; auditLockReady?: boolean }
        void navigator.locks.request(name, async () => {
          host.auditLockReady = true
          await new Promise<void>((resolve) => {
            host.releaseAuditLock = resolve
          })
        })
        return name
      }, moduleId)
      await expect
        .poll(() => owner!.evaluate(() => (window as Window & { auditLockReady?: boolean }).auditLockReady))
        .toBe(true)
      const before = await stored(page)
      const ledgerBefore = await ledgers()
      await frame
        .getByRole('button', { name: action === 'answer' ? /^(Continue|Yes)$/ : 'Done for today', exact: true })
        .click()
      await expect
        .poll(() =>
          owner!.evaluate(
            async (name) => (await navigator.locks.query()).pending?.filter((l) => l.name === name).length,
            lockName,
          ),
        )
        .toBe(1)
      await frame.getByRole('button', { name: 'Pause and return', exact: true }).click()
      await frame.getByRole('button', { name: activity, exact: true }).click()
      await expect(frame.getByRole('heading', { name: activity, exact: true })).toBeVisible()
      await owner!.evaluate(() => (window as Window & { releaseAuditLock?: () => void }).releaseAuditLock!())
      await expect
        .poll(() =>
          owner!.evaluate(async (name) => {
            const locks = await navigator.locks.query()
            return [...(locks.held || []), ...(locks.pending || [])].filter((l) => l.name === name).length
          }, lockName),
        )
        .toBe(0)
      await expect(frame.getByRole('heading', { name: activity, exact: true })).toBeVisible()
      expect(await stored(page)).toEqual(before)
      expect(await ledgers()).toEqual(ledgerBefore)
      // The new visit is still usable: its own completion exits normally.
      await frame.getByRole('button', { name: 'Done for today', exact: true }).click()
      await expect(frame.getByRole('button', { name: activity, exact: true })).toBeVisible()
      const completed = Object.entries(await ledgers()).filter(([key]) =>
        key.startsWith('family-beta-preview-results-v1:'),
      )
      expect(completed).toHaveLength(action === 'scored finish' ? 1 : 0)
      if (action === 'scored finish') expect(JSON.parse(completed[0][1]).attempted).toBe(1)
    })
  }
}

test('Legacy game checkpoint is detected but cannot change the current lesson or be overwritten', async ({ page }) => {
  const datasets = inspectSnapshot(
    JSON.parse(readFileSync(new URL('../../public/curriculum/beta/grade2.json', import.meta.url), 'utf8')),
  ).datasets
  const capability = reinforcementGames(datasets, '2026-10-05', 'Grade 2').find(
    ({ capability }) => capability.status === 'ready' && capability.pack.moduleId === 'speed-match',
  )!.capability
  if (capability.status !== 'ready' || capability.pack.moduleId !== 'speed-match')
    throw new Error('Missing real curriculum Shuriken pack')
  const pack = capability.pack
  const pair = pack.pairs[0]
  const saved = checkpointGameAnswer(
    startGameCheckpoint(
      { childId: 'preview-1', grade: 'Grade 2', week: '2026-10-05', gameId: 'speed-match' },
      pack,
      'synthetic-legacy-attempt',
      'synthetic-writer',
      '2026-10-06T19:00:00.000Z',
    ),
    {
      gameId: 'speed-match',
      promptId: pair.id,
      targetId: pair.targetId,
      correct: true,
      assessmentMode: 'automatic',
      response: [pair.left.id, pair.right.id],
    },
    '2026-10-06T19:01:00.000Z',
  )
  const key = `family-beta-games-v1:device-preview:checkpoint:${encodeURIComponent(gameScopeKey(saved.scope))}`
  const value = JSON.stringify(saved)
  await page.addInitScript(
    ({ key, value }) => {
      if (window === window.top) localStorage.setItem(key, value)
    },
    { key, value },
  )
  await page.goto('/family-beta-preview.html?grade=grade2')
  await expect(page.locator('iframe:visible')).toHaveAttribute('data-family-week', '2026-10-13')
  // Negative control for the same detector used by the no-checkpoint test.
  expect(await gameCheckpoints(page)).toEqual({ [key]: value })
  const frame = frameOf(page)
  await frame.getByRole('button', { name: /Practice your Ninja Skills/ }).click()
  await expect(page.getByRole('button', { name: 'Resume Shuriken Match', exact: true })).toBeHidden()
  await frame.getByRole('button', { name: 'Shuriken Match', exact: true }).click()
  await expect(page.locator('iframe:visible')).toHaveAttribute('data-family-week', '2026-10-13')
  await expect(frame.locator('.lg-shuriken-stat-row')).toContainText('0 targets cleared')
  await frame.getByRole('button', { name: 'Exit learning module', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Shuriken Match', exact: true })).toBeVisible()
  await expect(page.locator('iframe:visible')).toHaveAttribute('data-family-week', '2026-10-13')
  expect(await gameCheckpoints(page)).toEqual({ [key]: value })
})

for (const [grade, activity, next] of [
  ['kindergarten', 'Writing characters', '小'],
  ['grade2', 'Learn to Write', '最'],
]) {
  test(`${grade}: complete teacher and acquisition cycle resumes and teaches the next word`, async ({ page }) => {
    test.setTimeout(240_000)
    expect(process.env.FAMILY_CURRENT_WRITING).toBe('1')
    const frame = await launch(page, grade, /Enter the Dojo/, activity)
    const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
    await finishEnabledTeacher(page)
    await expect(frame.locator('.slay-writing-integration')).toBeVisible()
    const before = await stored(page)
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    expect(await stored(page)).toEqual(before)
    await frame.getByRole('button', { name: 'Exit game', exact: true }).click()
    await frame.getByRole('button', { name: activity, exact: true }).click()
    await expect(frame.locator('.slay-writing-integration')).toBeVisible()
    await expect(teacher).toBeHidden()
    for (let trial = 0; trial < 40 && !(await teacher.isVisible()); trial++) {
      const right = frame.getByRole('button', { name: 'I got it right', exact: true })
      const skip = frame.getByRole('button', { name: 'Skip Timer', exact: true })
      await expect(teacher.or(skip).or(right)).toBeVisible()
      if (await teacher.isVisible()) break
      if (await skip.isVisible()) await skip.click()
      await right.click()
    }
    await expect(teacher).toHaveAttribute('data-step', '1')
    await expect(teacher.getByRole('heading', { name: next, exact: true })).toBeVisible()
    await finishEnabledTeacher(page)
    await expect(frame.locator('.slay-writing-integration')).toBeVisible()
  })
}

test('Grade 2 reading recovers on the reported 雨林 expanded target and reaches the next word', async ({ page }) => {
  test.setTimeout(180_000)
  const frame = await launch(page, 'grade2', /Enter the Dojo/, 'Read the Words')
  const current = frame.locator('[data-report-activity="Reading practice"]')
  let exercisedReportedTarget = false
  for (let trial = 0; trial < 40; trial++) {
    await expect(frame.getByRole('button', { name: 'Record my reading', exact: true })).toBeVisible()
    if ((await current.getAttribute('data-report-position')) === '2') break
    const injectStall =
      !exercisedReportedTarget &&
      (await current.getAttribute('data-report-phase')) === 'expanded-trials · target' &&
      (await frame.locator('.reading-answer-word').textContent()) === '雨林'
    if (injectStall)
      await page.evaluate(() => {
        ;(window as unknown as { regressionAudio: { hold: boolean } }).regressionAudio.hold = true
      })
    await frame.getByRole('button', { name: 'Record my reading', exact: true }).click()
    await frame.getByRole('button', { name: 'Stop recording', exact: true }).click()
    if (injectStall) {
      await expect(frame.getByRole('button', { name: 'Restart playback', exact: true })).toBeVisible()
      const before = await stored(page)
      await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
      await page.getByRole('button', { name: 'Close and return', exact: true }).click()
      expect(await stored(page)).toEqual(before)
      await page.evaluate(() => {
        ;(window as unknown as { regressionAudio: { hold: boolean } }).regressionAudio.hold = false
      })
      await frame.getByRole('button', { name: 'Restart playback', exact: true }).click()
      exercisedReportedTarget = true
    }
    const before = await stored(page)
    await frame.getByRole('button', { name: /^(Continue|Yes)$/ }).click()
    await expect.poll(() => stored(page)).not.toEqual(before)
  }
  expect(exercisedReportedTarget).toBe(true)
  await expect(current).toHaveAttribute('data-report-position', '2')
  const before = await stored(page)
  await frame.getByRole('button', { name: 'Exit reading', exact: true }).click()
  await frame.getByRole('button', { name: 'Read the Words', exact: true }).click()
  await expect(current).toHaveAttribute('data-report-position', '2')
  expect(await stored(page)).toEqual(before)
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
