import { expect, type Page, test } from '@playwright/test'
import { validateCurriculum } from '../../src/familyBeta/curriculum.ts'
import { strokeOrderGuide } from '../../src/familyBeta/strokeOrderSlay.ts'
import { grade2StrokeMedians } from '../../src/learningGames/strokeOrder/grade2StrokeAssets.ts'
import { wetlandStrokeMedians } from '../../src/learningGames/strokeOrder/wetlandStrokeAssets.ts'
import { buildStrokeOrderRounds } from '../../src/learningGames/strokeOrder/rounds.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'
import { expectedSnapshotHash, futureSnapshot, grades, snapshot } from './fixtures.ts'

const endpoint = '**/weekly-dictation-curriculum-*/curriculum/beta/*.json'
const currentFrame = (page: Page) => page.locator('iframe:visible')
const frame = (page: Page) => page.frameLocator('iframe:visible')
async function reopen(page: Page, slug: string) {
  await page.goto(`./family-beta-preview.html?grade=${slug}`)
  await expect(frame(page).getByRole('button', { name: /Enter the Dojo/ })).toBeVisible()
  await frame(page)
    .locator('body')
    .evaluate(() => document.fonts.ready.then(() => undefined))
}
async function write(page: Page, grade: (typeof grades)[number]) {
  const dojo = frame(page).getByRole('button', { name: /Enter the Dojo/ })
  await expect(dojo.or(frame(page).getByRole('button', { name: grade.write, exact: true }))).toBeVisible()
  if (await dojo.isVisible()) await dojo.click()
  await frame(page)
    .locator('body')
    .evaluate(() => document.fonts.ready.then(() => undefined))
  await frame(page).getByRole('button', { name: grade.write, exact: true }).click()
  const teacher = frame(page).getByRole('region', { name: 'Stroke order teacher' })
  const warmup = frame(page).getByRole('button', { name: 'Skip Warmup', exact: true })
  await expect(teacher.or(warmup)).toBeVisible()
  if (await warmup.isVisible()) await warmup.click()
  await expect(teacher).toBeVisible()
  return teacher
}
async function writingRecords(page: Page) {
  return page.evaluate(() => {
    const saved: Record<string, string> = {}
    for (const [key, raw] of Object.entries(localStorage)) {
      if (!key.includes('automatic-curriculum-preview-') || key.includes('source') || key.includes('lesson-launch'))
        continue
      if (!key.includes('lesson-workspace')) {
        saved[key] = raw
        continue
      }
      const workspace = JSON.parse(raw)
      for (const [recordKey, value] of Object.entries(workspace.records || {})) {
        let record
        try {
          record = JSON.parse(value as string)
        } catch {
          continue
        }
        for (const progress of record.values?.writingAcquisitionProgress || []) {
          const identity = progress.lesson.targets.map((target: { id: string }) => target.id).join('|')
          saved[`${key}:${recordKey}:${identity}`] = JSON.stringify(progress)
        }
      }
    }
    return saved
  })
}
async function firstStep(page: Page) {
  const teacher = frame(page).getByRole('region', { name: 'Stroke order teacher' })
  const word = null
  const text = await teacher.getAttribute('data-report-target')
  const character = await page.evaluate(
    ({ text, word }) => {
      for (const raw of Object.values(localStorage)) {
        let record
        try {
          record = JSON.parse(raw)
        } catch {
          continue
        }
        const candidates = [record?.writing]
        for (const nested of Object.values(record?.records || {})) {
          try {
            candidates.push(...(JSON.parse(nested as string).values?.writingAcquisitionProgress || []))
          } catch {
            /* other records */
          }
        }
        for (const candidate of candidates) {
          const target = candidate?.lesson?.targets?.find((t: { id: string }) => t.id === text)
          if (target) return [...target.text][0]
        }
      }
      return word
    },
    { text, word },
  )
  expect(character).toBeTruthy()
  const target = { id: text!, text: character! }
  const strokes =
    process.env.REPORT_REPAIRS_AUDIT === '1'
      ? buildStrokeOrderRounds([target], { ...grade2StrokeMedians, ...wetlandStrokeMedians }).rounds[0].strokes
      : strokeOrderGuide(target).strokes
  const layout = getStrokeLayout(strokes)
  const pad = teacher.locator('svg[role="application"]')
  for (let i = 0; i < strokes.length; i++) {
    const b = (await pad.boundingBox())!
    const xy = (p: readonly [number, number]) =>
      [
        b.x + ((p[0] * layout.scale + layout.offsetX) * b.width) / 100,
        b.y + ((p[1] * layout.scale + layout.offsetY) * b.height) / 100,
      ] as const
    await page.mouse.move(...xy(strokes[i][0]))
    await page.mouse.down()
    for (const p of strokes[i].slice(1)) await page.mouse.move(...xy(p))
    await page.mouse.up()
    await expect(pad).toHaveAttribute('data-next-stroke', String(i + 1))
  }
  await frame(page).getByRole('button', { name: 'Next step', exact: true }).click()
  await expect(teacher).toHaveAttribute('data-step', '2')
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-23T19:00:00Z'))
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

for (const grade of grades) {
  test(`${grade.slug}: automatic updates wait for the date and safe menu; reviewed writing resumes`, async ({
    page,
  }) => {
    const currentWeek = process.env.REPORT_REPAIRS_AUDIT === '1' && grade.slug === 'grade2' ? '2026-10-19' : grade.week
    let live = snapshot(grade.slug),
      requests = 0
    const future = futureSnapshot(grade.slug)
    expect(
      (await validateCurriculum(JSON.stringify(future), grade.label)).datasets.some(
        (d) => d.startDate === '2026-10-26',
      ),
    ).toBe(true)
    await page.route(endpoint, (route) => {
      requests++
      return route.fulfill({ json: live })
    })
    await reopen(page, grade.slug)
    await expect(currentFrame(page)).toHaveAttribute('data-family-week', currentWeek)
    await write(page, grade)
    await firstStep(page)
    const original = await writingRecords(page),
      id = await currentFrame(page).getAttribute('data-family-slot')
    live = future
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect.poll(() => requests).toBe(2)
    await page.waitForTimeout(1300)
    await expect(currentFrame(page)).toHaveAttribute('data-family-slot', id!)
    await expect(currentFrame(page)).toHaveAttribute('data-family-week', currentWeek)
    expect(await writingRecords(page)).toEqual(original)
    await frame(page)
      .getByRole('button', { name: /^(Exit game|Pause and return)$/ })
      .click()
    await expect(currentFrame(page)).toHaveAttribute('data-family-curriculum', await expectedSnapshotHash(future))
    await expect(currentFrame(page)).toHaveAttribute('data-family-week', currentWeek)
    await write(page, grade)
    await expect(frame(page).getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '2')
    expect(await writingRecords(page)).toEqual(original)
    await reopen(page, grade.slug)
    await write(page, grade)
    await expect(frame(page).getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '2')
    expect(await writingRecords(page)).toEqual(original)
    const beforeMetadata = requests
    const resumedId = await currentFrame(page).getAttribute('data-family-slot')
    live = { ...future, retrievedAt: '2026-10-25T12:00:00Z' }
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect.poll(() => requests).toBe(beforeMetadata + 1)
    await page.waitForTimeout(1100)
    await expect(currentFrame(page)).toHaveAttribute('data-family-slot', resumedId!)
    await page.clock.setFixedTime(new Date('2026-10-26T19:00:00Z'))
    await page.waitForTimeout(1100)
    await expect(currentFrame(page)).toHaveAttribute('data-family-week', currentWeek)
    await frame(page)
      .getByRole('button', { name: /^(Exit game|Pause and return)$/ })
      .click()
    await expect(currentFrame(page)).toHaveAttribute('data-family-week', '2026-10-26')
    await write(page, grade)
    await expect(frame(page).getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '1')
    const after = await writingRecords(page)
    for (const [key, raw] of Object.entries(original)) expect(after[key]).toBe(raw)
  })

  test(`${grade.slug}: outages, invalid and older responses preserve the validated lesson and recover`, async ({
    page,
  }) => {
    const good = snapshot(grade.slug)
    let response: 'good' | 'outage' | 'invalid' | 'older' = 'good',
      requests = 0
    await page.route(endpoint, (route) => {
      requests++
      return response === 'outage'
        ? route.fulfill({ status: 503 })
        : route.fulfill({
            json:
              response === 'invalid'
                ? { ...good, contentSha256: '0'.repeat(64) }
                : response === 'older'
                  ? { ...good, retrievedAt: '2026-10-01T12:00:00Z' }
                  : good,
          })
    })
    await reopen(page, grade.slug)
    const source = await currentFrame(page).getAttribute('data-family-source')
    response = 'outage'
    await reopen(page, grade.slug)
    await expect(page.getByRole('alert').filter({ hasText: 'last validated teacher lesson' })).toBeVisible()
    await expect(currentFrame(page)).toHaveAttribute('data-family-source', source!)
    for (const mode of ['invalid', 'older', 'good'] as const) {
      response = mode
      const before = requests
      await page.evaluate(() => window.dispatchEvent(new Event('online')))
      await expect.poll(() => requests).toBeGreaterThan(before)
      if (mode !== 'good')
        await expect(
          page.getByRole('alert').filter({ hasText: mode === 'invalid' ? 'checksum' : 'older curriculum' }),
        ).toBeVisible()
      else await expect(page.getByRole('alert').filter({ hasText: 'Previously validated' })).toHaveCount(0)
      await expect(currentFrame(page)).toHaveAttribute('data-family-curriculum', await expectedSnapshotHash(good))
      if (mode !== 'good') {
        await reopen(page, grade.slug)
        await expect(currentFrame(page)).toHaveAttribute('data-family-curriculum', await expectedSnapshotHash(good))
        await expect(
          page.getByRole('alert').filter({ hasText: mode === 'invalid' ? 'checksum' : 'older curriculum' }),
        ).toBeVisible()
      }
    }
  })
}

test('Report holds a pending update; metadata-only checks do not recreate an idle menu', async ({ page }) => {
  let live = snapshot('kindergarten'),
    requests = 0
  await page.route(endpoint, (route) => {
    requests++
    return route.fulfill({ json: live })
  })
  await reopen(page, 'kindergarten')
  const id = await currentFrame(page).getAttribute('data-family-slot')
  live = { ...live, retrievedAt: '2026-10-24T12:00:00Z' }
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(() => requests).toBe(2)
  await page.waitForTimeout(1100)
  await expect(currentFrame(page)).toHaveAttribute('data-family-slot', id!)
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  live = futureSnapshot('kindergarten')
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(() => requests).toBe(3)
  await page.waitForTimeout(1100)
  await expect(currentFrame(page)).toHaveAttribute('data-family-slot', id!)
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  await expect(currentFrame(page)).toHaveAttribute('data-family-curriculum', await expectedSnapshotHash(live))
  await expect(currentFrame(page)).not.toHaveAttribute('data-family-slot', id!)
})

test('fresh unavailable source shows retry without substituting bundled lessons', async ({ page }) => {
  await page.route(endpoint, (route) => route.fulfill({ status: 503 }))
  await page.goto('./family-beta-preview.html?grade=kindergarten')
  await expect(page.getByRole('alert').filter({ hasText: 'No previously validated teacher lesson' })).toBeVisible()
  await expect(currentFrame(page)).toHaveCount(0)
  await page.unroute(endpoint)
  await page.route(endpoint, (route) => route.fulfill({ json: snapshot('kindergarten') }))
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(frame(page).getByRole('button', { name: /Enter the Dojo/ })).toBeVisible()
  await frame(page)
    .locator('body')
    .evaluate(() => document.fonts.ready.then(() => undefined))
})

test('polling and focus refresh preserve an open game until Exit', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-23T19:00:00Z') })
  let live = snapshot('grade5'),
    requests = 0
  await page.route(endpoint, (route) => {
    requests++
    return route.fulfill({ json: live })
  })
  await reopen(page, 'grade5')
  await frame(page)
    .getByRole('button', { name: /Practice.*Ninja Skills/ })
    .click()
  await frame(page).getByRole('button', { name: 'Shuriken Match', exact: true }).click()
  await expect(frame(page).getByRole('button', { name: 'Exit learning module', exact: true })).toBeVisible()
  const id = await currentFrame(page).getAttribute('data-family-slot')
  live = futureSnapshot('grade5')
  await page.clock.fastForward(300001)
  await expect.poll(() => requests).toBeGreaterThanOrEqual(2)
  await expect(currentFrame(page)).toHaveAttribute('data-family-slot', id!)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect.poll(() => requests).toBeGreaterThanOrEqual(3)
  await expect(currentFrame(page)).toHaveAttribute('data-family-slot', id!)
  await frame(page).getByRole('button', { name: 'Exit learning module', exact: true }).click()
  await expect(currentFrame(page)).toHaveAttribute('data-family-curriculum', await expectedSnapshotHash(live))
})

for (const grade of grades)
  test(`${grade.slug}: actual teacher service opens writing and reading`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-26T19:00:00Z'))
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await reopen(page, grade.slug)
    const raw = await currentFrame(page).getAttribute('data-family-source')
    const loaded = await validateCurriculum(raw!, grade.label)
    expect(loaded.snapshot.retrievedAt).not.toBe(snapshot(grade.slug).retrievedAt)
    const teacher = await write(page, grade)
    await expect(teacher).toHaveAttribute('data-step', '1')
    await expect(teacher.locator('svg[role="application"]')).toBeInViewport()
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Report a problem', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await page.screenshot({ path: test.info().outputPath('live-writing.png'), fullPage: true })
    await frame(page)
      .getByRole('button', { name: /^(Exit game|Pause and return)$/ })
      .click()
    const dojo = frame(page).getByRole('button', { name: /Enter the Dojo/ })
    const reading = frame(page).getByRole('button', {
      name: grade.slug === 'kindergarten' ? 'High-frequency words' : 'Read the Words',
      exact: true,
    })
    await expect(dojo.or(reading)).toBeVisible()
    if (await dojo.isVisible()) await dojo.click()
    await reading.click()
    const warmup = frame(page).getByRole('button', { name: 'Skip Warmup', exact: true })
    const exit = frame(page).getByRole('button', { name: /^(Exit reading|Pause and return)$/ })
    await expect(warmup.or(exit)).toBeVisible()
    if (await warmup.isVisible()) await warmup.click()
    await expect(exit).toBeVisible()
    await exit.click()
    expect(errors).toEqual([])
    await test.info().attach('live-source.json', {
      body: JSON.stringify({
        grade: grade.label,
        retrievedAt: loaded.snapshot.retrievedAt,
        hash: loaded.snapshot.contentSha256,
        weeks: loaded.datasets.map((d) => d.startDate),
      }),
      contentType: 'application/json',
    })
  })

test('new Kindergarten recordings play through the native browser media decoder', async ({ page }) => {
  // A fresh page avoids the suite's sequencing-only media stub.
  const native = await page.context().browser()!.newPage()
  await native.goto(new URL('./family-beta-preview.html', test.info().project.use.baseURL).href)
  for (const name of ['u9a6c', 'u7eff-u8272', 'u9ec4-u8272', 'u5403']) {
    const result = await native.evaluate(async (name) => {
      // Match prepareRecordingSource: Firebase's raw range behavior is not
      // Safari-compatible, so the app fetches complete bytes into a Blob URL.
      const response = await fetch(`audio/kindergarten/automatic/${name}.wav`)
      if (!response.ok) throw new Error(`Recording fetch ${response.status}`)
      const source = URL.createObjectURL(await response.blob())
      const audio = new Audio(source)
      audio.muted = true
      const finished = new Promise<{ duration: number; error: number | null }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Media did not finish')), 10000)
        audio.onended = () => {
          clearTimeout(timer)
          resolve({ duration: audio.duration, error: audio.error?.code || null })
        }
        audio.onerror = () => {
          clearTimeout(timer)
          reject(new Error(`Media error ${audio.error?.code}`))
        }
      })
      try {
        await audio.play()
        return await finished
      } finally {
        URL.revokeObjectURL(source)
      }
    }, name)
    expect(result.duration).toBeGreaterThan(0)
    expect(result.error).toBeNull()
  }
  await native.close()
})
