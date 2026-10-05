import { expect, test } from '@playwright/test'

test.use({
  permissions: ['microphone'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
})

test('sound check decodes recorded audio and records, compares, then releases a real browser media stream', async ({
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
  await page.goto('/family-beta-preview.html?grade=kindergarten')
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
