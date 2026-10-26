import { writeFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { koreAudioSegments } from '../../src/audio/koreVoice.ts'
import { GAME_LANGUAGE } from '../../src/ninjaSkills/gameLanguagePreviewCatalog.ts'
import { newlySupported, nextLessonSnapshot } from './fixtures.ts'

type Probe = {
  ended: string[]
  speech: string[]
  rates: number[]
  phase: 'playback' | 'report' | 'exit'
  errors: { name: string; message: string; phase: string; source: string }[]
}
type SoundWindow = Window & { importedAudio: Probe }
const probe = (page: Page) => page.evaluate(() => (window as SoundWindow).importedAudio)
async function recordProbe(name: string, value: Probe) {
  const path = test.info().outputPath(name)
  writeFileSync(path, JSON.stringify(value, null, 2))
  await test.info().attach(name, { path, contentType: 'application/json' })
}

test.beforeEach(async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-11-02T19:00:00Z'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    const top = window.top as SoundWindow
    top.importedAudio ||= { ended: [], speech: [], errors: [], rates: [], phase: 'playback' }
    const p = top.importedAudio
    const blobs = new WeakMap<Blob, string>()
    const urls = new Map<string, string>()
    const fetchAudio = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const response = await fetchAudio(input, init)
      if (url.includes('/audio/kore/')) {
        const blob = response.blob.bind(response)
        response.blob = async () => {
          const value = await blob()
          blobs.set(value, url)
          return value
        }
      }
      return response
    }
    const create = URL.createObjectURL.bind(URL)
    URL.createObjectURL = (blob) => {
      const url = create(blob)
      if (blob instanceof Blob && blobs.has(blob)) urls.set(url, blobs.get(blob)!)
      return url
    }
    const play = HTMLMediaElement.prototype.play
    const observed = new WeakSet<HTMLMediaElement>()
    HTMLMediaElement.prototype.play = function () {
      if (!observed.has(this)) {
        observed.add(this)
        this.addEventListener('ended', () => {
          const path = urls.get(this.src)
          if (path) p.ended.push(path)
        })
      }
      if (urls.has(this.src)) p.rates.push(this.playbackRate)
      const source = urls.get(this.src)
      return play.call(this).catch((error) => {
        if (source) p.errors.push({ name: error.name, message: error.message, phase: p.phase, source })
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
          if (/\p{Script=Han}/u.test(u.text)) {
            p.speech.push(u.text)
            setTimeout(() => u.onerror?.({ error: 'not-allowed' } as SpeechSynthesisErrorEvent), 0)
          } else {
            u.onstart?.({} as SpeechSynthesisEvent)
            setTimeout(() => u.onend?.({} as SpeechSynthesisEvent), 0)
          }
        },
      },
    })
  })
})

for (const grade of newlySupported) {
  for (const game of ['Sushi Scramble', 'Dictation Streak']) {
    test(`${grade.slug}: ${game} finishes its newly recorded sentence without Mandarin fallback`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const row = GAME_LANGUAGE[grade.grade].find((row) => row[0] === grade.writing[0])!
      const audio = koreAudioSegments({ text: row[3].join(''), language: 'zh-CN', rate: 0.65 })[0].storagePath!
      expect(audio).toMatch(/^audio\/kore\//)
      await page.route('**/curriculum/beta/*.json', (route) => route.fulfill({ json: nextLessonSnapshot(grade.slug) }))
      await page.goto(`./family-beta-preview.html?grade=${grade.slug}`)
      const frame = page.frameLocator('iframe:visible')
      await frame.getByRole('button', { name: /Practice.*Ninja Skills/ }).click()
      await frame.getByRole('button', { name: game, exact: true }).click()
      await expect
        .poll(async () => (await probe(page)).ended.some((url) => url.endsWith(audio)), { timeout: 35000 })
        .toBe(true)
      expect((await probe(page)).speech).toEqual([])
      if (game === 'Sushi Scramble') {
        const before = (await probe(page)).ended.filter((url) => url.endsWith(audio)).length
        await frame.getByRole('button', { name: 'Hear slowly', exact: true }).click()
        await expect
          .poll(async () => (await probe(page)).ended.filter((url) => url.endsWith(audio)).length, { timeout: 35000 })
          .toBeGreaterThan(before)
        expect((await probe(page)).rates.some((rate) => Math.abs(rate - 0.5 / 0.65) < 0.001)).toBe(true)
      }
      const beforeInterruption = await probe(page)
      await recordProbe('before-report.json', beforeInterruption)
      expect(beforeInterruption.errors).toEqual([])
      await page.evaluate(() => {
        ;(window as SoundWindow).importedAudio.phase = 'report'
      })
      await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
      await expect(frame.locator('html')).toHaveAttribute('data-activity-paused', 'true')
      await page.getByRole('button', { name: 'Close and return', exact: true }).click()
      await recordProbe('after-report.json', await probe(page))
      await page.evaluate(() => {
        ;(window as SoundWindow).importedAudio.phase = 'exit'
      })
      await frame.getByRole('button', { name: 'Exit learning module', exact: true }).click()
      expect((await probe(page)).speech).toEqual([])
      const afterExit = await probe(page)
      await recordProbe('new-kore-native-playback.json', afterExit)
      // Report/Exit deliberately cancel any trailing dictation repeats. A
      // rejected pending play at those boundaries is expected; failures during
      // playback, non-cancellation errors, and fallback speech remain failures.
      expect(
        afterExit.errors.every((error) => error.name === 'AbortError' && ['report', 'exit'].includes(error.phase)),
      ).toBe(true)
      expect(errors).toEqual([])
    })
  }
}
