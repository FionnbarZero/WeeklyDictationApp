import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import catalog from '../../src/audio/kore/catalog.json' with { type: 'json' }
import { inspectSnapshot } from '../../src/familyBeta/curriculum.ts'
import { reinforcementGames } from '../../src/familyBeta/gamePools.ts'
import { recoverGrade2Wetland } from '../../src/familyBeta/grade2WetlandReview.ts'
import { withGameLanguage } from '../w2-recovery/contentFixtures.ts'

const snapshot = (slug: string) =>
  JSON.parse(readFileSync(`tests/fixtures/game-content-2026-10-26/${slug}.json`, 'utf8'))
const frame = (p: Page) => p.frameLocator('iframe:visible')
type Sound = { requests: string[]; plays: { rate: number; start: number; end?: number }[]; fallback: string[] }
type SoundWindow = Window & { reportSound: Sound }
const sound = (page: Page) => page.evaluate(() => (window as SoundWindow).reportSound)
test.beforeEach(async ({ page, context }) => {
  await page.clock.setSystemTime(new Date('2026-10-26T19:00:00Z'))
  await context.route('**/curriculum/beta/*.json', (route) =>
    route.fulfill({
      json: snapshot(
        route
          .request()
          .url()
          .match(/(kindergarten|grade2|grade5)\.json/)![1],
      ),
    }),
  )
  await context.addInitScript(() => {
    if (
      (HTMLMediaElement.prototype.play as typeof HTMLMediaElement.prototype.play & { reportAudioObserved?: boolean })
        .reportAudioObserved
    )
      return
    const top = window.top as SoundWindow
    top.reportSound ||= { requests: [], plays: [], fallback: [] }
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      this.muted = true
      if (!this.src.startsWith('blob:')) return play.call(this)
      const entry = { rate: this.playbackRate, start: performance.now(), end: undefined as number | undefined }
      top.reportSound.plays.push(entry)
      this.addEventListener('ended', () => (entry.end = performance.now()), { once: true })
      return play.call(this)
    }
    Object.defineProperty(HTMLMediaElement.prototype.play, 'reportAudioObserved', { value: true })
    const fetchOriginal = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('/audio/kore/')) top.reportSound.requests.push(url)
      return fetchOriginal(input, init)
    }
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices: () => [],
        speak(u: SpeechSynthesisUtterance) {
          if (u.text.trim()) top.reportSound.fallback.push(u.text)
          u.onerror?.({ error: 'synthesis-failed' } as SpeechSynthesisErrorEvent)
        },
      },
    })
  })
})
test('Sushi replay uses slower native Kore audio', async ({ page }) => {
  await page.goto('./family-beta-preview.html?grade=grade2')
  const f = frame(page)
  await f.getByRole('button', { name: /Practice.*Ninja Skills/ }).click({ timeout: 30000 })
  await f.getByRole('button', { name: 'Sushi Scramble', exact: true }).click()
  await expect
    .poll(async () => (await sound(page)).plays.filter((p) => p.end).length, { timeout: 30000 })
    .toBeGreaterThan(0)
  const before = (await sound(page)).plays.length
  await f.getByRole('button', { name: 'Hear sentence again', exact: true }).click()
  // A hosted click may finish the silent gesture primer while the sentence
  // downloads. Wait for the requested slower clip's own completion.
  await expect
    .poll(
      async () =>
        (await sound(page)).plays.slice(before).filter((play) => play.end && Math.abs(play.rate - 0.5 / 0.65) < 0.001)
          .length,
      { timeout: 30000 },
    )
    .toBeGreaterThan(0)
  expect((await sound(page)).fallback).toEqual([])
})
test('Context Gap speaks only the two sides, slowly, with silence for the answer', async ({ page }) => {
  const source = inspectSnapshot(await recoverGrade2Wetland(snapshot('grade2')))
  const game = reinforcementGames(withGameLanguage(source.datasets), '2026-10-19', 'Grade 2').find(
    (g) => g.capability.status === 'ready' && g.capability.pack.moduleId === 'context-gap-dash',
  )!
  if (game.capability.status !== 'ready' || game.capability.pack.moduleId !== 'context-gap-dash')
    throw Error('missing test pack')
  const round = game.capability.pack.rounds[0]
  await page.goto('./family-beta-preview.html?grade=grade2')
  const f = frame(page)
  await f.getByRole('button', { name: /Practice.*Ninja Skills/ }).click({ timeout: 30000 })
  await f.getByRole('button', { name: 'Context Gap Dash', exact: true }).click()
  const parts = [round.sentenceBefore, round.sentenceAfter].filter((text) => /\p{Script=Han}/u.test(text))
  await expect
    .poll(async () => (await sound(page)).plays.filter((p) => p.end && Math.abs(p.rate - 0.5 / 0.65) < 0.001).length, {
      timeout: 30000,
    })
    .toBe(parts.length)
  const heard = await sound(page),
    assets = catalog.assets as Record<string, string>,
    key = (s: string) => s.trim().replace(/[。！？.!?]+$/u, '')
  await test.info().attach('context-sound', { body: JSON.stringify(heard, null, 2), contentType: 'application/json' })
  for (const part of parts)
    expect(
      heard.requests.some((url) => url.endsWith(assets[key(part)])),
      part,
    ).toBe(true)
  const whole = assets[key(round.audioText || '')]
  if (whole) expect(heard.requests.some((url) => url.endsWith(whole))).toBe(false)
  const promptPlays = heard.plays.filter((p) => Math.abs(p.rate - 0.5 / 0.65) < 0.001)
  for (const play of promptPlays) expect(play.rate).toBeCloseTo(0.5 / 0.65, 3)
  if (promptPlays.length === 2) expect(promptPlays[1].start - promptPlays[0].end!).toBeGreaterThanOrEqual(1100)
  expect(heard.fallback).toEqual([])
  await f.getByRole('button', { name: 'Replay sentence', exact: true }).click()
  await f.getByRole('button', { name: 'Exit learning module', exact: true }).click()
  const afterExit = (await sound(page)).plays.length
  await page.waitForTimeout(1600)
  expect((await sound(page)).plays.length).toBe(afterExit)
})

test('new reading word plays native Mandarin before recording even when English speech is unavailable', async ({
  page,
  context,
}) => {
  await context.addInitScript(() =>
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(new DOMException('Test denied', 'NotAllowedError')) },
    }),
  )
  await page.goto('./family-beta-preview.html?grade=grade2')
  const f = frame(page)
  await f.getByRole('button', { name: /Final Boss/ }).click({ timeout: 30000 })
  await f.getByRole('button', { name: 'Re-enter the Dojo', exact: true }).click()
  await f.getByRole('button', { name: 'Reenter the Dojo · reading', exact: true }).click()
  // The unchanged reading policy starts with two familiar distractors, then introduces the new word.
  for (let i = 0; i < 2; i++) {
    await f.getByRole('button', { name: 'Record my reading', exact: true }).click()
    await f.getByRole('button', { name: 'Continue without recording', exact: true }).click()
    await f.getByRole('button', { name: 'Yes', exact: true }).click()
  }
  await expect(f.getByText('Listen, then read this word aloud', { exact: true })).toBeVisible()
  const word = (await f.locator('.reading-answer-word').textContent())!.trim(),
    assets = catalog.assets as Record<string, string>
  await expect(f.getByRole('button', { name: 'Record my reading', exact: true })).toBeVisible({ timeout: 30000 })
  expect((await sound(page)).requests.some((url) => url.endsWith(assets[word]))).toBe(true)
  expect((await sound(page)).fallback).toEqual([])
})
