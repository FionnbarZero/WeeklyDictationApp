import { expect, test } from '@playwright/test'
import { strokeOrderGuide } from '../../src/familyBeta/strokeOrderSlay.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'

type FaultWindow = Window & { teacherTestFault?: 'event' | 'render' | null }

test('teacher failures retain confirmed steps, expose a safe report code, retry and exit without resets', async ({
  page,
}) => {
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
    // Fault injection belongs to this test, never the application or release.
    const win = window as FaultWindow
    const bounds = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function () {
      if (win.teacherTestFault === 'event' && this.matches('.lg-stroke-pad svg[role="application"]')) {
        win.teacherTestFault = null
        throw new Error('PRIVATE_CHILD_RESPONSE_DO_NOT_CAPTURE')
      }
      return bounds.call(this)
    }
    const create = Document.prototype.createElementNS
    Document.prototype.createElementNS = function (...args: Parameters<typeof create>) {
      if (win.teacherTestFault === 'render' && args[1] === 'g') throw new Error('PRIVATE_CHILD_RESPONSE_DO_NOT_CAPTURE')
      return create.apply(this, args)
    } as typeof create
  })
  await page.goto('/family-beta-preview.html?grade=grade2')
  const frame = page.frameLocator('iframe:visible')
  const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
  const recovery = frame.getByRole('alert', { name: 'Tracing needs a retry' })
  async function launch(fromHome = true) {
    if (fromHome) await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
    await frame.getByRole('button', { name: 'Learn to Write', exact: true }).click()
    const skip = frame.getByRole('button', { name: 'Skip Warmup', exact: true })
    await expect(skip.or(teacher)).toBeVisible()
    if (await skip.isVisible()) await skip.click()
    await expect(teacher).toBeVisible()
  }
  await launch()
  const pad = teacher.locator('svg[role="application"]')
  const strokes = strokeOrderGuide({ id: 'recovery-zou', text: '走' }).strokes
  const layout = getStrokeLayout(strokes)
  async function draw(points: readonly (readonly [number, number])[]) {
    const b = (await pad.boundingBox())!
    const xy = (p: readonly [number, number]) =>
      [
        b.x + ((p[0] * layout.scale + layout.offsetX) * b.width) / 100,
        b.y + ((p[1] * layout.scale + layout.offsetY) * b.height) / 100,
      ] as const
    await page.mouse.move(...xy(points[0]))
    await page.mouse.down()
    for (const p of points.slice(1)) await page.mouse.move(...xy(p))
    await page.mouse.up()
  }
  for (const stroke of strokes) await draw(stroke)
  await frame.getByRole('button', { name: 'Next step', exact: true }).click()
  await expect(teacher).toHaveAttribute('data-step', '2')
  const records = () =>
    page.evaluate(() =>
      Object.fromEntries(
        Object.entries(localStorage).filter(([key]) => !key.startsWith('family-beta-problem-report-v1:')),
      ),
    )
  const confirmed = await records()
  for (const [fault, code] of [
    ['event', 'ST-EVENT'],
    ['render', 'ST-RENDER'],
    ['promise', 'ST-PROMISE'],
  ] as const) {
    await draw(strokes[0])
    await expect(pad).toHaveAttribute('data-next-stroke', '1')
    // Use the actual activity's document, not the outer preview owner.
    if (fault === 'promise') {
      await teacher.evaluate(() => {
        void Promise.reject(new Error('PRIVATE_CHILD_RESPONSE_DO_NOT_CAPTURE'))
      })
    } else {
      await teacher.evaluate((_element, value) => {
        ;(window as FaultWindow).teacherTestFault = value
      }, fault)
      await draw([
        [5, 5],
        [95, 5],
        [5, 95],
        [95, 95],
      ])
    }
    await expect(recovery).toBeVisible()
    await expect(recovery).toHaveAttribute('data-report-phase', `teacher-recovery:${code}`)
    expect(await records()).toEqual(confirmed)
    await page.screenshot({ path: test.info().outputPath(`${code}-recovery.png`), fullPage: true })
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    // A queued/background click cannot navigate or retry while reporting is paused.
    await recovery.evaluate((element) => {
      for (const button of element.querySelectorAll('button')) button.click()
    })
    await expect(recovery).toBeVisible()
    expect(await records()).toEqual(confirmed)
    await page.getByLabel('What did you see or hear?').fill('Synthetic tracing recovery test')
    await page.getByRole('button', { name: 'Save report on this device', exact: true }).click()
    const reports = await page.evaluate(() =>
      Object.entries(localStorage)
        .filter(([key]) => key.startsWith('family-beta-problem-report-v1:'))
        .map(([, value]) => JSON.parse(value)),
    )
    expect(reports.some((report) => report.context.phase === `teacher-recovery:${code}`)).toBe(true)
    expect(JSON.stringify(reports)).not.toContain('PRIVATE_CHILD_RESPONSE_DO_NOT_CAPTURE')
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await recovery.evaluate(() => {
      ;(window as FaultWindow).teacherTestFault = null
    })
    await frame.getByRole('button', { name: 'Try this step again', exact: true }).click()
    await expect(teacher).toHaveAttribute('data-step', '2')
    await expect(pad).toHaveAttribute('data-next-stroke', '0')
    expect(await records()).toEqual(confirmed)
  }
  // A repeat failure remains recoverable, including through normal Exit/reopen.
  await teacher.evaluate(() => {
    void Promise.reject(new Error('synthetic repeated failure'))
  })
  await expect(recovery).toBeVisible()
  await frame.getByRole('button', { name: 'Return to Dojo', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Learn to Write', exact: true })).toBeVisible()
  expect(await records()).toEqual(confirmed)
  // The scoped error listeners must be gone after leaving the teacher.
  await frame.getByRole('button', { name: 'Learn to Write', exact: true }).evaluate(() => {
    window.dispatchEvent(new ErrorEvent('error', { message: 'synthetic error outside teacher' }))
  })
  await expect(recovery).toHaveCount(0)
  await page.reload()
  await launch()
  await expect(teacher).toHaveAttribute('data-step', '2')
  for (const stroke of strokes) await draw(stroke)
  await frame.getByRole('button', { name: 'Next step', exact: true }).click()
  await expect(teacher).toHaveAttribute('data-step', '3')
})
