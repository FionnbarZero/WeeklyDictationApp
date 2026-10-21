import { expect, test } from '@playwright/test'
import { TARGETS } from '../../src/grade5PresentationPreview/assessmentData.ts'

for (const game of ['Shuriken Match', 'Memory Lanterns', 'Sushi Scramble']) {
  test(`Boss games completion: ${game} keeps the assessment words and returns to Boss Games`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.setSystemTime(new Date('2026-10-21T19:00:00Z'))
    await page.addInitScript(() => {
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: {
          cancel() {},
          resume() {},
          getVoices() {
            return []
          },
          speak(utterance: SpeechSynthesisUtterance) {
            utterance.onstart?.({} as SpeechSynthesisEvent)
            setTimeout(() => utterance.onend?.({} as SpeechSynthesisEvent), 5)
          },
        },
      })
      HTMLMediaElement.prototype.play = function () {
        this.dispatchEvent(new Event('playing'))
        setTimeout(() => this.dispatchEvent(new Event('ended')), 10)
        return Promise.resolve()
      }
    })
    await page.goto('/family-beta-preview.html?grade=grade5')
    const frame = page.frameLocator('iframe:visible')
    await frame.getByRole('button', { name: /Final Boss/ }).click()
    await frame.getByRole('button', { name: 'Boss Games', exact: true }).click()
    await frame.getByRole('button', { name: game, exact: true }).click()
    await expect(frame.locator('.lg-heading')).toContainText('Grade 5 · Boss Games')
    if (game === 'Shuriken Match') {
      await expect(frame.locator('.lg-word-seal')).toHaveCount(16)
      for (const target of TARGETS) {
        await expect(frame.locator('.lg-shuriken-board')).not.toHaveClass(/is-correct|is-incorrect/)
        for (const label of [target.text, target.meaning])
          await frame.getByRole('button', { name: `${label}. Click to hear and select.`, exact: true }).click()
      }
    } else if (game === 'Memory Lanterns') {
      await expect(frame.locator('.lg-memory-card')).toHaveCount(16)
      for (const target of TARGETS) {
        const cards = frame
          .locator('.lg-memory-card')
          .filter({ has: frame.locator('.lg-card-face b', { hasText: new RegExp(`^${target.text}$`) }) })
        await expect(cards).toHaveCount(2)
        await cards.nth(0).click()
        await cards.nth(1).click()
      }
    } else {
      for (const [index, target] of TARGETS.entries()) {
        await expect(frame.locator('.lg-round-label')).toHaveText(`Sentence ${index + 1} of 8`)
        for (const [position, token] of target.tokens.entries())
          await frame
            .locator('.lg-sushi-bar')
            .getByRole('button', { name: `Place ${token} in sentence position ${position + 1}`, exact: true })
            .and(frame.locator('button:enabled'))
            .first()
            .click()
      }
    }
    await frame.getByRole('button', { name: 'Back to Boss Games', exact: true }).click()
    await expect(frame.locator('.learning-hub-activity-grid button')).toHaveText([
      'Shuriken Match',
      'Shadow Strike Dojo',
      'Memory Lanterns',
      'Context Gap Dash',
      'Sushi Scramble',
    ])
    const results = await page.evaluate(() =>
      Object.entries(localStorage)
        .filter(([key]) => key.startsWith('family-beta-preview-results-v1:'))
        .map(([, raw]) => JSON.parse(raw)),
    )
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      activity: game,
      channel: 'game',
      correct: 8,
      attempted: 8,
      datasetIds: ['grade-5__2026-27__2026-10-19__2026-10-23'],
    })
    await frame.getByRole('button', { name: '← Back to Final Boss', exact: true }).click()
    await expect(frame.locator('.learning-hub-activity-grid button')).toHaveText([
      'Boss Test',
      'Boss Games',
      'Need more training?',
    ])
    expect(errors).toEqual([])
  })
}
