import { expect, test } from '@playwright/test'

test.use({
  permissions: ['microphone'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
})

test('Grade 5 sound check decodes recorded audio and records, compares, then releases a real browser media stream', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = { tracks: [] as MediaStreamTrack[], revoked: [] as string[], played: [] as string[] }
    Object.assign(window, { audioCheckEvidence: state })
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await getUserMedia(constraints)
      state.tracks.push(...stream.getTracks())
      return stream
    }
    const revoke = URL.revokeObjectURL.bind(URL)
    URL.revokeObjectURL = (url) => {
      state.revoked.push(url)
      revoke(url)
    }
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      state.played.push(this.src)
      return play.call(this)
    }
  })
  await page.goto('/family-beta-preview.html?grade=grade5')
  await page.getByRole('button', { name: 'Check sound & microphone' }).click()
  const dialog = page.getByRole('dialog', { name: 'Check sound and microphone' })
  await dialog.getByRole('button', { name: 'Play test word' }).click()
  await expect(dialog.getByRole('status')).toContainText('Playback finished', { timeout: 15000 })
  await dialog.getByRole('button', { name: 'Record my reading' }).click()
  await expect(dialog.locator('.recording-live')).toBeVisible()
  // Allow a real MediaRecorder chunk to be produced from Chromium's synthetic microphone.
  await page.waitForTimeout(400)
  await dialog.getByRole('button', { name: 'Stop recording' }).click()
  await expect(dialog.getByRole('button', { name: 'Replay comparison' })).toBeVisible({ timeout: 15000 })
  await expect(dialog.getByText('Did your reading match the example?')).toBeVisible()
  await dialog.getByRole('button', { name: 'Close sound check' }).click()
  const evidence = await page.evaluate(() => {
    const state = (
      window as unknown as { audioCheckEvidence: { tracks: MediaStreamTrack[]; revoked: string[]; played: string[] } }
    ).audioCheckEvidence
    return {
      tracks: state.tracks.map((t) => t.readyState),
      revoked: state.revoked,
      played: state.played,
      stored: Object.values(localStorage),
    }
  })
  expect(evidence.tracks).toEqual(['ended'])
  expect(evidence.revoked.some((url) => url.startsWith('blob:'))).toBe(true)
  expect(evidence.played.some((url) => url.startsWith('blob:'))).toBe(true)
  expect(evidence.played.filter((url) => url.includes('u725b.wav')).length).toBeGreaterThanOrEqual(2)
  expect(evidence.stored.join('')).not.toMatch(/blob:|audio\/webm|data:audio/)
})

test('denied microphone access offers permission guidance and a retry', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Denied', 'NotAllowedError')
    }
  })
  await page.goto('/family-beta-preview.html?grade=grade5')
  await page.getByRole('button', { name: 'Check sound & microphone' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Record my reading' }).click()
  await expect(dialog.getByRole('alert')).toContainText('allow Microphone')
  await expect(dialog.getByRole('button', { name: 'Try microphone again' })).toBeEnabled()
})

for (const [round, section] of [
  [1, 'Practice your Ninja Skills'],
  [2, 'The Final Boss'],
] as const) {
  test(`Grade 5 reading Boss round ${round} records every response and saves the exact score after reload`, async ({
    page,
  }) => {
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
            setTimeout(() => {
              utterance.onstart?.({} as SpeechSynthesisEvent)
              utterance.onend?.({} as SpeechSynthesisEvent)
            }, 0)
          },
        },
      })
    })
    await page.goto('/family-beta-preview.html?grade=grade5')
    const frame = page.frameLocator('iframe')
    await frame.getByRole('button', { name: new RegExp(section) }).click()
    await frame.getByRole('button', { name: 'Reading Test', exact: true }).click()
    const record = frame.getByRole('button', { name: 'Record my reading', exact: true })
    const submit = frame.getByRole('button', { name: 'Submit final review', exact: true })
    let collected = 0
    for (; collected < 40; collected++) {
      await expect(record.or(submit)).toBeVisible()
      if (await submit.isVisible()) break
      await record.click()
      await expect(frame.locator('.recording-live')).toBeVisible()
      await page.waitForTimeout(400)
      await frame.getByRole('button', { name: 'Stop recording', exact: true }).click()
      await frame.getByRole('button', { name: 'Save response and continue' }).click()
    }
    expect(collected).toBeGreaterThan(0)
    expect(collected).toBeLessThan(40)
    const rows = frame.locator('.deferred-review-row')
    await expect(rows).toHaveCount(collected)
    for (let i = 0; i < collected; i++) {
      const row = rows.nth(i)
      await expect(row.getByRole('button', { name: 'Yes', exact: true })).toBeDisabled()
      await row.getByRole('button', { name: /Play my reading, then the correct pronunciation/ }).click()
      await row.getByRole('button', { name: i === 0 ? 'Not yet' : 'Yes', exact: true }).click()
    }
    await submit.click()
    await page.reload()
    await page.getByRole('button', { name: 'Progress', exact: true }).click()
    await expect(page.getByRole('cell', { name: `${collected - 1} / ${collected}`, exact: true })).toBeVisible()
    const records = await page.evaluate(() =>
      Object.entries(localStorage)
        .filter(([key]) => key.startsWith('family-beta-preview-results-v1:'))
        .map(([, raw]) => JSON.parse(raw)),
    )
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ channel: 'reading', correct: collected - 1, attempted: collected })
    expect(await page.evaluate(() => Object.values(localStorage).join(''))).not.toMatch(/blob:|audio\/webm|data:audio/)
  })
}
