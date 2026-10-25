import { expect, test } from '@playwright/test'

test('Kindergarten recordings complete through the actual media engine before the timer runs', async ({ page }) => {
  const audioFailures: string[] = []
  page.on('requestfailed', (request) => {
    if (/\.(wav|mp3)/.test(request.url())) audioFailures.push(request.url())
  })
  await page.addInitScript(() => {
    const records: { type: string; at: number; source: string }[] = []
    ;(window as unknown as { mediaEvents: typeof records }).mediaEvents = records
    document.addEventListener(
      'playing',
      (e) => {
        const media = e.target as HTMLMediaElement
        records.push({ type: 'playing', at: performance.now(), source: media.currentSrc || media.src })
      },
      true,
    )
    document.addEventListener(
      'ended',
      (e) => {
        const media = e.target as HTMLMediaElement
        records.push({ type: 'ended', at: performance.now(), source: media.currentSrc || media.src })
      },
      true,
    )
  })
  await page.goto('/warmup-design-preview.html?grade=kindergarten')
  // The shared gesture-unlock audio element is detached, so observe its real
  // media events at play(), without replacing play or faking completion.
  await page.evaluate(() => {
    const original = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      const media = this
      media.addEventListener(
        'ended',
        () => {
          ;(window as unknown as { mediaEvents: object[] }).mediaEvents.push({
            type: 'ended',
            at: performance.now(),
            source: media.currentSrc || media.src,
          })
        },
        { once: true },
      )
      return original.call(this)
    }
  })
  await page.getByRole('button', { name: 'Start or resume Warmup', exact: true }).click()
  await expect(page.getByRole('timer')).toHaveText('00:10')
  await expect(page.getByRole('button', { name: 'Skip Timer', exact: true })).toBeEnabled({ timeout: 35000 })
  const events = await page.evaluate(
    () => (window as unknown as { mediaEvents: { type: string; source: string }[] }).mediaEvents,
  )
  expect(events.filter((e) => e.type === 'ended' && e.source.startsWith('blob:')).length).toBeGreaterThanOrEqual(4)
  await expect(page.getByRole('timer')).toHaveText(/00:0[89]/, { timeout: 2500 })
  await page.getByRole('button', { name: 'Hear', exact: true }).click()
  await expect(page.getByRole('timer')).toHaveText('00:10')
  await expect(page.getByRole('button', { name: 'Skip Timer', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Skip Timer', exact: true })).toBeEnabled({ timeout: 35000 })
  expect(audioFailures).toEqual([])
  await expect(page.locator('.skywriting-reveal-word')).toHaveText('人', { timeout: 12500 })
})

test('Blocked speech stays recoverable and never consumes the response timer', async ({ page }) => {
  await page.addInitScript(() => {
    let blocked = true
    ;(window as unknown as { allowSpeech: () => void }).allowSpeech = () => {
      blocked = false
    }
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices() {
          return []
        },
        speak(u: SpeechSynthesisUtterance) {
          if (!u.text) return
          if (blocked) setTimeout(() => u.onerror?.({ error: 'not-allowed' } as SpeechSynthesisErrorEvent), 10)
          else {
            u.onstart?.({} as SpeechSynthesisEvent)
            setTimeout(() => u.onend?.({} as SpeechSynthesisEvent), 10)
          }
        },
      },
    })
  })
  await page.goto('/warmup-design-preview.html?grade=grade2')
  await page.getByRole('button', { name: 'Start or resume Warmup', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Audio could not finish')
  await page.waitForTimeout(1200)
  await expect(page.getByRole('timer')).toHaveText('00:10')
  await expect(page.getByRole('button', { name: 'Skip Timer', exact: true })).toBeDisabled()
  await page.evaluate(() => (window as unknown as { allowSpeech: () => void }).allowSpeech())
  await page.getByRole('button', { name: 'Hear', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Skip Timer', exact: true })).toBeEnabled({ timeout: 15000 })
  await page.getByRole('button', { name: 'Exit game', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start or resume Warmup', exact: true })).toBeVisible()
})

test('Another tab cannot overwrite a reviewed first answer; saved ink remains absent', async ({ page, context }) => {
  await context.addInitScript(() => {
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
  })
  const other = await context.newPage()
  for (const tab of [page, other]) {
    await tab.goto('/warmup-design-preview.html?grade=grade2')
    await tab.getByRole('button', { name: 'Start or resume Warmup', exact: true }).click()
  }
  await page.bringToFront()
  await expect(page.getByRole('button', { name: 'Skip Timer', exact: true })).toBeEnabled({ timeout: 15000 })
  await page.getByRole('button', { name: 'Skip Timer', exact: true }).click()
  await page.getByRole('button', { name: 'I got it wrong', exact: true }).click()
  const committed = await page.evaluate(() => localStorage.getItem('ninja-warmup-design-v1:grade2'))
  await other.bringToFront()
  await expect(other.getByRole('button', { name: 'Skip Timer', exact: true })).toBeEnabled({ timeout: 15000 })
  await other.getByRole('button', { name: 'Skip Timer', exact: true }).click()
  await expect(other.getByRole('alert')).toContainText('changed in another tab')
  expect(await other.evaluate(() => localStorage.getItem('ninja-warmup-design-v1:grade2'))).toBe(committed)
  await other.getByRole('button', { name: 'Exit game', exact: true }).click()
  await other.getByRole('button', { name: 'Start or resume Warmup', exact: true }).click()
  await expect(other.getByRole('region', { name: 'Warmup stroke guide' })).toBeVisible()
})
