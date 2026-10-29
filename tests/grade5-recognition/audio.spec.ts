import { expect, test } from '@playwright/test'
import catalog from '../../src/audio/kore/catalog.json' with { type: 'json' }
import reviewed from '../../src/grade5RecognitionReview/source.json' with { type: 'json' }

test('all 50 Kore clips decode and native teaching audio finishes before recording', async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-10-26T19:00:00Z'))
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(new DOMException('Test denied', 'NotAllowedError')) },
    })
    const top = window.top as Window & { reviewAudio: { ended: number; speech: string[]; errors: string[] } }
    top.reviewAudio ||= { ended: 0, speech: [], errors: [] }
    const original = HTMLMediaElement.prototype.play
    const seen = new WeakSet<HTMLMediaElement>()
    HTMLMediaElement.prototype.play = function () {
      this.muted = true
      if (!seen.has(this)) {
        seen.add(this)
        this.addEventListener('ended', () => top.reviewAudio.ended++)
      }
      return original.call(this).catch((error) => {
        top.reviewAudio.errors.push(error.message)
        throw error
      })
    }
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices: () => [],
        speak(u: SpeechSynthesisUtterance) {
          if (/\p{Script=Han}/u.test(u.text)) top.reviewAudio.speech.push(u.text)
          u.onstart?.({} as SpeechSynthesisEvent)
          setTimeout(() => u.onend?.({} as SpeechSynthesisEvent), 5)
        },
      },
    })
  })
  await page.goto('/family-beta-preview.html?grade=grade5')
  const files = reviewed.targets.map((row) => (catalog.assets as Record<string, string>)[row.text])
  const decoded = await page.evaluate(async (paths) => {
    const context = new AudioContext()
    try {
      let count = 0
      for (const path of paths) {
        const response = await fetch(new URL(path, location.href))
        if (!response.ok) throw new Error('Missing word audio')
        const audio = await context.decodeAudioData(await response.arrayBuffer())
        if (audio.duration <= 0 || audio.numberOfChannels < 1) throw new Error('Empty word audio')
        count++
      }
      return count
    } finally {
      await context.close()
    }
  }, files)
  expect(decoded).toBe(50)
  const f = page.frameLocator('iframe:visible')
  await f.getByRole('button', { name: /Enter the Dojo/ }).click({ timeout: 30000 })
  await f.getByRole('button', { name: 'Read the Words', exact: true }).click()
  // Complete the grade-owned two familiar diagnostics, then observe the
  // reviewed word's actual automatic Kore introduction before Record unlocks.
  const record = f.getByRole('button', { name: 'Record my reading', exact: true })
  for (let diagnostic = 0; diagnostic < 2; diagnostic++) {
    await expect(record).toBeEnabled({ timeout: 30000 })
    await record.click()
    await f.getByRole('button', { name: 'Continue without recording', exact: true }).click()
    await f.getByRole('button', { name: 'Yes', exact: true }).click()
  }
  await expect(f.locator('.reading-answer-word')).toHaveText('需要')
  await expect(record).toBeEnabled({ timeout: 30000 })
  const result = await page.evaluate(
    () => (window as Window & { reviewAudio: { ended: number; speech: string[]; errors: string[] } }).reviewAudio,
  )
  expect(result.speech).toEqual([])
  expect(result.errors).toEqual([])
  expect(result.ended).toBeGreaterThanOrEqual(5)
  await f.getByRole('button', { name: 'Exit reading', exact: true }).click()
})
