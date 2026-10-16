import { expect, type Page, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { installFamilyFixtures } from '../family-sync/fixtures.ts'
import { finishEnabledTeacher } from '../family-sync/writingTeacherDriver.ts'

test.beforeEach(async ({ page }) => {
  if (process.env.DOJO_FAMILY_PACKAGE === '1') {
    await installFamilyFixtures(page)
    await page.route('**/curriculum/beta/*.json', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: readFileSync(
          new URL(
            `../fixtures/dojo-launch-2026-10-16/${new URL(route.request().url()).pathname.split('/').pop()!}`,
            import.meta.url,
          ),
          'utf8',
        ),
      }),
    )
  }
  await page.clock.setFixedTime(new Date('2026-10-16T19:00:00Z'))
  await page.addInitScript(() => {
    type Diagnostics = { mode: string; spoken: { text: string; rate: number }[] }
    const host = window.top as unknown as { audioRecovery?: Diagnostics }
    host.audioRecovery ||= { mode: 'ready', spoken: [] }
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices: () => [],
        speak(u: SpeechSynthesisUtterance) {
          host.audioRecovery!.spoken.push({ text: u.text, rate: u.rate })
          if (host.audioRecovery!.mode === 'error') {
            setTimeout(() => u.onerror?.({ error: 'not-allowed' } as SpeechSynthesisErrorEvent), 5)
            return
          }
          u.onstart?.({} as SpeechSynthesisEvent)
          setTimeout(
            () => u.onend?.({} as SpeechSynthesisEvent),
            host.audioRecovery!.mode === 'slow' && u.text.length > 4 ? 16_500 : 10,
          )
        },
      },
    })
    HTMLMediaElement.prototype.play = function () {
      // Exercise the same browser-speech fallback used when a recording fails.
      return Promise.reject(new Error('Synthetic unavailable recording'))
    }
  })
})

async function mode(page: Page, value: string) {
  await page.evaluate((value) => {
    ;(window as unknown as { audioRecovery: { mode: string } }).audioRecovery.mode = value
  }, value)
}

async function launch(page: Page, grade = 'grade5') {
  await page.goto(`/family-beta-preview.html?grade=${grade}`)
  const frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await frame
    .getByRole('button', { name: grade === 'kindergarten' ? 'Writing characters' : 'Learn to Write', exact: true })
    .click()
  const warmup = frame.getByRole('button', { name: 'Skip Warmup', exact: true })
  const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
  await expect(warmup.or(teacher)).toBeVisible()
  return { frame, warmup, teacher }
}

test('Grade 2: repeated Warmup exit returns to activities without reload or discard', async ({ page }) => {
  const { frame } = await launch(page, 'grade2')
  for (let visit = 0; visit < 2; visit++) {
    await frame.getByRole('button', { name: 'Begin Warmup', exact: true }).click()
    await expect(frame.locator('[data-report-phase="warmup:acquisition:dictation"]')).toBeVisible()
    await frame.getByRole('button', { name: 'Exit practice', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Your paused work' })).toBeHidden()
    await expect(frame.getByRole('button', { name: /Enter the Dojo/ })).toBeVisible()
    await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
    await frame.getByRole('button', { name: 'Learn to Write', exact: true }).click()
    await expect(frame.getByRole('button', { name: 'Begin Warmup', exact: true })).toBeVisible()
  }
})

test('Grade 5: a slow prompt completes, and repeated audio errors recover without scoring or changing the trial', async ({
  page,
}) => {
  test.setTimeout(240_000)
  const { frame, warmup } = await launch(page)
  if (await warmup.isVisible()) await warmup.click()
  await finishEnabledTeacher(page)
  const practice = frame.locator('[data-report-activity="Writing practice"]')
  const skip = frame.getByRole('button', { name: 'Skip Timer', exact: true })
  // Preserve native Grade 5: two Familiar DTs, one trace, then its first target.
  for (let trial = 0; trial < 3; trial++) {
    await expect(skip).toBeEnabled()
    await skip.click()
    if (trial === 2) await mode(page, 'error')
    await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
  }
  await expect(practice).toHaveAttribute('data-report-audio', 'error')
  await expect(practice).toHaveAttribute('data-report-target', 'grade-5__2026-27__2026-10-05__2026-10-09-1')
  const saved = await page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith('family-beta-acquisition-v1:'))),
  )
  const target = await practice.getAttribute('data-report-target')
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  await expect(practice).toHaveAttribute('data-report-audio', 'error')
  for (let retry = 0; retry < 2; retry++) {
    await expect(frame.getByRole('alert')).toContainText('Tap Hear')
    await expect(skip).toBeDisabled()
    await frame.getByRole('button', { name: 'Hear', exact: true }).click()
    await expect(practice).toHaveAttribute('data-report-audio', 'error')
    expect(
      await page.evaluate(() =>
        Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith('family-beta-acquisition-v1:'))),
      ),
    ).toEqual(saved)
  }
  await mode(page, 'slow')
  await frame.getByRole('button', { name: 'Hear', exact: true }).click()
  await expect(practice).toHaveAttribute('data-report-audio', 'loading')
  await expect(skip).toBeDisabled()
  // This exceeds the old 15-second per-cue cutoff. Real voices are device-tested separately.
  await expect(skip).toBeEnabled({ timeout: 80_000 })
  await expect(practice).toHaveAttribute('data-report-target', target!)
  await expect(frame.getByRole('timer')).toHaveText('00:25')
  await skip.click()
  await expect(frame.getByRole('button', { name: 'I got it right', exact: true })).toBeVisible()
  await mode(page, 'ready')
  await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
  await expect(skip).toBeEnabled()
  await frame.getByRole('button', { name: 'Exit game', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your paused work' })).toBeHidden()
  const enter = frame.getByRole('button', { name: /Enter the Dojo/ })
  const write = frame.getByRole('button', { name: 'Learn to Write', exact: true })
  await expect(enter.or(write)).toBeVisible()
  if (await enter.isVisible()) await enter.click()
  await write.click()
  await expect(skip).toBeEnabled()
  await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toBeHidden()
})

test('Kindergarten: acquisition fallback is slower while the approved teacher stays at its original rate', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const { frame } = await launch(page, 'kindergarten')
  await finishEnabledTeacher(page)
  await expect(frame.getByRole('button', { name: 'Skip Timer', exact: true })).toBeEnabled()
  const spoken = await page.evaluate(
    () => (window as unknown as { audioRecovery: { spoken: { text: string; rate: number }[] } }).audioRecovery.spoken,
  )
  expect(spoken.length).toBeGreaterThan(5)
  for (const cue of spoken.filter((cue) => cue.text)) expect(cue.rate).toBeCloseTo(0.7, 4)
  await frame.getByRole('button', { name: 'Exit game', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your paused work' })).toBeHidden()
})
