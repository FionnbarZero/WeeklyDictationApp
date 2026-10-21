import { expect, test } from '@playwright/test'

for (const grade of ['kindergarten', 'grade2', 'grade5']) {
  test(`${grade}: real WAV playback advances, balances quiet synthetic sound and unloads the temporary player`, async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-10-20T19:00:00Z'))
    await page.addInitScript(() => {
      const state = window as unknown as {
        players: HTMLMediaElement[]
        revoked: string[]
        playedBlobs: number[]
        recordings: string[]
      }
      state.players = []
      state.revoked = []
      state.playedBlobs = []
      state.recordings = []
      const createdBlobs = new Map<string, Blob>()
      const create = URL.createObjectURL
      URL.createObjectURL = (blob) => {
        const url = create.call(URL, blob)
        if (blob instanceof Blob) createdBlobs.set(url, blob)
        // This test's recording is 44,144 bytes; the silent activation cue is 204.
        if (blob instanceof Blob && blob.size > 10000) state.recordings.push(url)
        return url
      }
      const play = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function () {
        if (!state.players.includes(this)) state.players.push(this)
        const blob = createdBlobs.get(this.src)
        if (blob && blob.size > 10000) {
          // Inspect our generated tone directly. Fetching a blob URL would add a
          // test-only request blocked by the hosted connect-src 'self' policy.
          void blob.arrayBuffer().then((buffer) => {
            const wav = new DataView(buffer)
            if (buffer.byteLength > 10000) state.playedBlobs.push(Math.abs(wav.getInt16(100, true)))
          })
        }
        return play.call(this)
      }
      const revoke = URL.revokeObjectURL
      URL.revokeObjectURL = (url) => {
        state.revoked.push(url)
        createdBlobs.delete(url)
        revoke.call(URL, url)
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
            const data = new ArrayBuffer(44 + 44100)
            const wav = new DataView(data)
            const text = (offset: number, s: string) =>
              [...s].forEach((c, i) => wav.setUint8(offset + i, c.charCodeAt(0)))
            text(0, 'RIFF')
            wav.setUint32(4, data.byteLength - 8, true)
            text(8, 'WAVE')
            text(12, 'fmt ')
            wav.setUint32(16, 16, true)
            wav.setUint16(20, 1, true)
            wav.setUint16(22, 1, true)
            wav.setUint32(24, 44100, true)
            wav.setUint32(28, 88200, true)
            wav.setUint16(32, 2, true)
            wav.setUint16(34, 16, true)
            text(36, 'data')
            wav.setUint32(40, 44100, true)
            for (let i = 0; i < 22050; i++)
              wav.setInt16(44 + i * 2, Math.sin((i * 2 * Math.PI * 440) / 44100) * 500, true)
            this.state = 'inactive'
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
    await page.goto(`/family-beta-preview.html?grade=${grade}`)
    const frame = page.frameLocator('iframe:visible')
    await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
    await frame
      .getByRole('button', { name: grade === 'kindergarten' ? 'High-frequency words' : 'Read the Words', exact: true })
      .click()
    await frame.getByRole('button', { name: 'Record my reading', exact: true }).click()
    await frame.getByRole('button', { name: 'Stop recording', exact: true }).click()
    await expect(frame.getByRole('button', { name: 'Yes', exact: true })).toBeEnabled({ timeout: 25000 })
    const activityFrame = await (await page.locator('iframe:visible').elementHandle())!.contentFrame()
    await expect
      .poll(() =>
        activityFrame!.evaluate(() =>
          (window as unknown as { playedBlobs: number[] }).playedBlobs.some((amplitude) => amplitude > 500),
        ),
      )
      .toBe(true)
    const progress = () =>
      page.evaluate(() =>
        Object.fromEntries(
          Object.entries(localStorage).filter(([key]) => key.startsWith('family-beta-acquisition-v1:')),
        ),
      )
    const before = await progress()
    await frame.getByRole('button', { name: 'Yes', exact: true }).click()
    await expect.poll(progress).not.toEqual(before)
    await expect(frame.getByRole('button', { name: 'Record my reading', exact: true })).toBeVisible()
    // Keep direct Exit coverage too: the first clip was released by advancing,
    // whereas this second, unsubmitted response must be released by Exit itself.
    const confirmed = await progress()
    await frame.getByRole('button', { name: 'Record my reading', exact: true }).click()
    await frame.getByRole('button', { name: 'Stop recording', exact: true }).click()
    await expect(frame.getByRole('button', { name: 'Yes', exact: true })).toBeEnabled({ timeout: 25000 })
    expect(await progress()).toEqual(confirmed)
    await frame.getByRole('button', { name: 'Exit reading', exact: true }).click()
    expect(await progress()).toEqual(confirmed)
    const host = await (await page.locator('iframe:visible').elementHandle())!.contentFrame()
    const diagnostics = await host!.evaluate(() => {
      const state = window as unknown as {
        players: HTMLMediaElement[]
        revoked: string[]
        playedBlobs: number[]
        recordings: string[]
      }
      // Chromium retains currentSrc metadata after unload; HAVE_NOTHING and no
      // src prove there is no loaded/replayable media, even if that string lingers.
      return {
        heldBlob: state.players.some(
          (p) => state.recordings.includes(p.src) || (state.recordings.includes(p.currentSrc) && p.readyState !== 0),
        ),
        recordingCount: state.recordings.length,
        recordingsRevoked: state.recordings.every((url) => state.revoked.includes(url)),
        amplitudes: state.playedBlobs,
      }
    })
    expect(diagnostics.heldBlob).toBe(false)
    expect(diagnostics.recordingCount).toBeGreaterThan(0)
    expect(diagnostics.recordingsRevoked).toBe(true)
    expect(diagnostics.amplitudes.some((amplitude) => amplitude > 500)).toBe(true)
    expect(await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))))).not.toMatch(
      /blob:|audio\/wav|base64/,
    )
  })
}
