import { readFileSync } from 'node:fs'
import { expect, test, type Page, type FrameLocator } from '@playwright/test'
import { inspectSnapshot } from '../../src/familyBeta/curriculum.ts'
import { reinforcementGames } from '../../src/familyBeta/gamePools.ts'
import type { GameCheckpoint } from '../../src/ninjaSkills/progress.ts'

test.beforeEach(async ({ context, page }) => {
  await page.clock.setSystemTime(new Date('2026-10-23T19:00:00Z'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await context.addInitScript(() => {
    const top = window.top as Window & { auditSpeech?: { text: string; rate: number }[] }
    top.auditSpeech ||= []
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices: () => [],
        speak(u: SpeechSynthesisUtterance) {
          top.auditSpeech!.push({ text: u.text, rate: u.rate })
          u.onstart?.({} as SpeechSynthesisEvent)
          setTimeout(() => u.onend?.({} as SpeechSynthesisEvent), 10)
        },
      },
    })
    HTMLMediaElement.prototype.play = function () {
      return Promise.reject(new Error('Synthetic browser speech fallback'))
    }
  })
})

async function checkpoint(page: Page): Promise<GameCheckpoint> {
  return page.evaluate(() => {
    const raw = Object.entries(localStorage).find(
      ([key]) => key.startsWith('family-beta-games-v1:') && key.includes(':checkpoint:'),
    )![1]
    return JSON.parse(raw)
  })
}
async function records(page: Page) {
  return page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('family-beta-games-v1:'))),
  )
}
async function finishPair(frame: FrameLocator, saved: GameCheckpoint, index: number) {
  if (saved.pack.moduleId !== 'speed-match') throw new Error('Expected Shuriken')
  await expect(frame.locator('.lg-shuriken-board')).not.toHaveClass(/is-correct|is-incorrect/)
  for (const side of [saved.pack.pairs[index].left, saved.pack.pairs[index].right])
    await frame.getByRole('button', { name: `${side.label}. Click to hear and select.`, exact: true }).click()
}
async function openShuriken(page: Page) {
  await page.goto('/family-beta-preview.html?grade=grade5&example=game-recovery')
  await page.getByRole('button', { name: 'Shuriken Match', exact: true }).click()
  const frame = page.frameLocator('iframe:visible')
  await expect(frame.locator('.lg-word-seal').first()).toBeEnabled()
  const initial = await checkpoint(page)
  await finishPair(frame, initial, 0)
  await expect.poll(async () => (await checkpoint(page)).cleared.length).toBe(1)
  return frame
}

for (const operation of ['timer', 'restart'] as const) {
  test(`saved Shuriken ${operation} conflict offers safe reopening and preserves confirmed turns`, async ({ page }) => {
    const frame = await openShuriken(page)
    if (operation === 'restart') {
      // A validated expired-timer fixture, not a discarded or reseeded lesson.
      await page.evaluate(() => {
        const key = Object.keys(localStorage).find(
          (k) => k.startsWith('family-beta-games-v1:') && k.includes(':checkpoint:'),
        )!
        const value = JSON.parse(localStorage.getItem(key)!)
        value.remainingMs = 0
        value.revision++
        localStorage.setItem(key, JSON.stringify(value))
      })
      await page.reload()
      await page.getByRole('button', { name: 'Resume Shuriken Match', exact: true }).click()
      await expect(frame.getByRole('button', { name: 'Restart mission', exact: true })).toBeEnabled()
    } else await expect.poll(async () => (await checkpoint(page)).remainingMs!).toBeLessThan(60000)
    await page.evaluate(() => {
      const key = Object.keys(localStorage).find(
        (k) => k.startsWith('family-beta-games-v1:') && k.includes(':checkpoint:'),
      )!
      const value = JSON.parse(localStorage.getItem(key)!)
      value.writerId = 'synthetic-other-device'
      value.attemptId = 'synthetic-other-attempt'
      value.revision++
      localStorage.setItem(key, JSON.stringify(value))
    })
    const changed = await checkpoint(page)
    const bytes = await records(page)
    if (operation === 'restart') await frame.getByRole('button', { name: 'Restart mission', exact: true }).click()
    await expect(frame.getByRole('alert')).toContainText('another tab')
    const reopen = frame.getByRole('button', { name: 'Reopen saved turns', exact: true })
    await expect(reopen).toBeVisible()
    await frame.getByRole('button', { name: 'Retry saving mission', exact: true }).click()
    await expect(frame.getByRole('alert')).toContainText('another tab')
    expect(await records(page)).toEqual(bytes)
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await expect(frame.locator('html')).toHaveAttribute('data-activity-paused', 'true')
    await reopen.evaluate((button) => (button as HTMLButtonElement).click())
    expect(await records(page)).toEqual(bytes)
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await reopen.click()
    await expect(frame.getByRole('alert')).toHaveCount(0)
    await expect(frame.locator('.lg-word-seal.is-matched')).toHaveCount(2)
    const resumed = await checkpoint(page)
    expect(resumed.prompts).toEqual(changed.prompts)
    expect(resumed.cleared).toEqual(changed.cleared)
    expect(resumed.cycle).toBe(changed.cycle)
    if (operation === 'restart') {
      await frame.getByRole('button', { name: 'Restart mission', exact: true }).click()
      await expect(frame.getByRole('button', { name: 'Restart mission', exact: true })).toBeHidden()
      const restarted = await checkpoint(page)
      expect(restarted.cycle).toBe(changed.cycle + 1)
      expect(restarted.prompts).toEqual(changed.prompts)
      expect(restarted.remainingMs).toBe(60000)
      await finishPair(frame, restarted, 0)
      await expect.poll(async () => (await checkpoint(page)).cleared.length).toBe(1)
    } else {
      await finishPair(frame, resumed, 1)
      await expect.poll(async () => (await checkpoint(page)).cleared.length).toBe(2)
    }
    await page.screenshot({ path: test.info().outputPath(`recovered-${operation}.png`), fullPage: true })
  })
}

test('saved Shuriken retries a transient timer failure without reopening or losing answers', async ({ page }) => {
  const frame = await openShuriken(page)
  const before = await checkpoint(page)
  await frame.locator('body').evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('family-beta-games-v1:') && key.includes(':checkpoint:'))
        throw new Error('Synthetic timer refusal')
      original.call(this, key, value)
    }
    ;(window as Window & { restoreTimerWrites?: () => void }).restoreTimerWrites = () => {
      Storage.prototype.setItem = original
    }
  })
  await expect(frame.getByRole('alert')).toContainText('Synthetic timer refusal')
  await expect(frame.getByRole('button', { name: 'Reopen saved turns', exact: true })).toBeVisible()
  await frame
    .locator('body')
    .evaluate(() => (window as Window & { restoreTimerWrites?: () => void }).restoreTimerWrites!())
  await frame.getByRole('button', { name: 'Retry saving mission', exact: true }).click()
  await expect(frame.getByRole('alert')).toHaveCount(0)
  await expect(frame.getByRole('button', { name: 'Reopen saved turns', exact: true })).toHaveCount(0)
  const after = await checkpoint(page)
  expect(after.prompts).toEqual(before.prompts)
  expect(after.cleared).toEqual(before.cleared)
  expect(after.remainingMs!).toBeLessThan(before.remainingMs!)
})

test('early slow replay wins over automatic narration, repeated taps and the next prompt remain usable', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    let clicked = false
    new MutationObserver(() => {
      const button = [...document.querySelectorAll<HTMLButtonElement>('.lg-world-context-gap-dash button')].find(
        (b) => b.textContent?.trim() === 'Hear slowly',
      )
      if (!button || clicked) return
      clicked = true
      // Exercise the genuine interval between an enabled control mounting and
      // the scheduled 350ms automatic read, independently of test-driver speed.
      setTimeout(() => button.click(), 50)
    }).observe(document, { childList: true, subtree: true })
  })
  const source = inspectSnapshot(
    JSON.parse(readFileSync(new URL('../fixtures/dojo-launch-2026-10-16/grade5.json', import.meta.url), 'utf8')),
  )
  const anchor = source.datasets
    .filter((d) => d.startDate <= '2026-10-23')
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0].startDate
  const capability = reinforcementGames(source.datasets, anchor, 'Grade 5').find(
    (g) => g.capability.status === 'ready' && g.capability.pack.moduleId === 'context-gap-dash',
  )!.capability
  if (capability.status !== 'ready' || capability.pack.moduleId !== 'context-gap-dash')
    throw new Error('Missing Context fixture')
  const [first, second] = capability.pack.rounds
  await page.goto('/family-beta-preview.html?grade=grade5')
  const frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: /Practice.*Ninja Skills/ }).click()
  await frame.getByRole('button', { name: 'Context Gap Dash', exact: true }).click()
  const speech = () =>
    page.evaluate(() =>
      (window as Window & { auditSpeech: { text: string; rate: number }[] }).auditSpeech.filter((s) => s.text.trim()),
    )
  await expect.poll(speech).toEqual([{ text: first.audioText, rate: 0.5 }])
  // Check beyond both the pending auto-read and the browser voice-loading wait.
  await page.waitForTimeout(850)
  expect(await speech()).toEqual([{ text: first.audioText, rate: 0.5 }])
  const slow = frame.getByRole('button', { name: 'Hear slowly', exact: true })
  await slow.click()
  await expect.poll(speech).toHaveLength(2)
  expect((await speech())[1]).toEqual({ text: first.audioText, rate: 0.5 })
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await expect(frame.locator('html')).toHaveAttribute('data-activity-paused', 'true')
  await slow.evaluate((button) => (button as HTMLButtonElement).click())
  expect(await speech()).toHaveLength(2)
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  await frame.getByRole('button', { name: 'Replay sentence', exact: true }).click()
  await expect.poll(speech).toHaveLength(3)
  expect((await speech())[2]).toEqual({ text: first.audioText, rate: 0.75 })
  const choice = frame
    .locator(info.project.use.hasTouch ? '.lg-mobile-gate-choices button' : '.lg-canvas-access button')
    .nth(first.choices.findIndex((c) => c.id === first.correctChoiceId))
  await expect(choice).toBeEnabled({ timeout: 30000 })
  if (info.project.use.hasTouch) await choice.tap()
  else {
    await choice.focus()
    await choice.press('Enter')
  }
  await expect(frame.locator('.lg-dash-context-clue strong')).toHaveText(second.cueText!, { timeout: 30000 })
  await expect
    .poll(async () => (await speech()).filter((s) => s.text === second.audioText))
    .toEqual([{ text: second.audioText, rate: 0.75 }])
  await frame.getByRole('button', { name: 'Exit learning module', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Context Gap Dash', exact: true })).toBeVisible()
})
