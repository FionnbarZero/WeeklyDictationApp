import type { Page } from '@playwright/test'
import {
  advanceWritingProgress,
  createWritingProgress,
  teachingPosition,
} from '../../src/application/writingAcquisition/progress.ts'
import {
  IPAD_PREVIEW_KEY,
  REFINEMENT_PREVIEW_POLICY,
  WRITING_PREVIEW_OWNER,
  writingPreviewLesson,
} from '../../src/writingAcquisition/previewLesson.ts'
import { expect, test } from './fixtures.ts'

// Model WebKit's gesture gate, not sound output. A normal success-only speech
// mock would miss the original bug. Empty voices also exercise delayed loading.
async function gestureSpeech(page: Page) {
  await page.addInitScript(() => {
    const diagnostic = { unlocked: false, inClick: false, spoken: [] as string[], blocked: [] as string[] }
    Object.assign(window, { speechDiagnostic: diagnostic })
    document.addEventListener(
      'click',
      () => {
        diagnostic.inClick = true
      },
      true,
    )
    document.addEventListener('click', () => {
      diagnostic.inClick = false
    })
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices() {
          return []
        },
        speak(u: SpeechSynthesisUtterance) {
          if (diagnostic.inClick) diagnostic.unlocked = true
          if (!diagnostic.unlocked) {
            diagnostic.blocked.push(u.text)
            return
          }
          if (!u.text) return
          diagnostic.spoken.push(u.text)
          u.onstart?.({} as SpeechSynthesisEvent)
          setTimeout(() => u.onend?.({} as SpeechSynthesisEvent), 10)
        },
      },
    })
  })
}
async function seed(page: Page) {
  let progress = createWritingProgress(
    writingPreviewLesson(REFINEMENT_PREVIEW_POLICY),
    WRITING_PREVIEW_OWNER,
    'ipad-layout',
    '2026-10-15T00:00:00.000Z',
  )
  while (teachingPosition(progress))
    progress = advanceWritingProgress(
      progress,
      {
        id: `step-${progress.revision}`,
        expectedRevision: progress.revision,
        kind: 'complete-teaching-step',
        position: teachingPosition(progress)!,
      },
      '2026-10-15T00:00:00.000Z',
    )
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value)
    },
    { key: IPAD_PREVIEW_KEY, value: JSON.stringify(progress) },
  )
}

test('v8 Start unlocks automatic teaching audio, including fresh reload/resume', async ({ page }) => {
  await gestureSpeech(page)
  await page.goto('/grade2-writing-preview.html')
  for (let visit = 0; visit < 2; visit++) {
    await page.getByRole('button', { name: 'Start or resume writing', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute(
      'data-report-audio',
      'ready',
    )
    expect(
      await page.evaluate(
        () => (window as unknown as { speechDiagnostic: { blocked: string[] } }).speechDiagnostic.blocked,
      ),
    ).toEqual([])
    expect(
      await page.evaluate(
        () => (window as unknown as { speechDiagnostic: { spoken: string[] } }).speechDiagnostic.spoken,
      ),
    ).toContain('英雄')
    await page.reload()
  }
})

for (const viewport of [
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 1180, height: 720 },
]) {
  test(`v8 iPad ${viewport.width}x${viewport.height}: large scrolls, automatic audio, controls and rotation`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport)
    await gestureSpeech(page)
    await seed(page)
    await page.goto('/grade2-writing-preview.html')
    await page.getByRole('button', { name: 'Start or resume writing', exact: true }).click()
    const skip = page.getByRole('button', { name: 'Skip Timer', exact: true })
    await expect(skip).toBeEnabled()
    const pads = page.locator('.skywriting-scroll-cell .skywriting-pad')
    const pad = (await pads.first().boundingBox())!
    expect(pad.width).toBeGreaterThan(viewport.width === 768 ? 310 : viewport.width === 1024 ? 380 : 330)
    const heading = (await page.locator('.tier1-writing-instructions h1').boundingBox())!
    expect(pad.y - heading.y - heading.height).toBeLessThan(65)
    for (const item of [
      pads.first(),
      pads.last(),
      skip,
      page.getByRole('button', { name: 'Hear', exact: true }),
      page.getByRole('textbox'),
    ]) {
      const box = (await item.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
    }
    console.log(`v8 ${viewport.width}x${viewport.height} tracing pad: ${pad.width} x ${pad.height}`)
    await page.screenshot({ path: info.outputPath('ipad-tracing.png') })
    // A mark survives orientation changes; no teaching or saved score is advanced.
    await page.mouse.move(pad.x + 50, pad.y + 50)
    await page.mouse.down()
    await page.mouse.move(pad.x + 120, pad.y + 120, { steps: 8 })
    await page.mouse.up()
    await expect(page.locator('.skywriting-stroke').first()).toBeVisible()
    await page.setViewportSize({ width: viewport.height, height: viewport.width })
    await expect(page.locator('.skywriting-stroke').first()).toBeVisible()
    await page.setViewportSize(viewport)
    await skip.click()
    await page.getByRole('button', { name: 'I got it right', exact: true }).click()
    await expect(page.locator('.skywriting-trace-character')).toHaveCount(0)
    await expect(skip).toBeEnabled()
    expect(
      await page.evaluate(
        () => (window as unknown as { speechDiagnostic: { blocked: string[] } }).speechDiagnostic.blocked,
      ),
    ).toEqual([])
  })
}
