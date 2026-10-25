import { readFileSync } from 'node:fs'
import { expect, type FrameLocator, test } from '@playwright/test'
import { inspectSnapshot } from '../../src/familyBeta/curriculum.ts'
import { reinforcementGames } from '../../src/familyBeta/gamePools.ts'
import type { BetaResult } from '../../src/familyBeta/model.ts'
import { withGameLanguage } from '../w2-recovery/contentFixtures.ts'

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-23T19:00:00Z'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices: () => [],
        speak(u: SpeechSynthesisUtterance) {
          u.onstart?.({} as SpeechSynthesisEvent)
          setTimeout(() => u.onend?.({} as SpeechSynthesisEvent), 5)
        },
      },
    })
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('playing'))
      setTimeout(() => this.dispatchEvent(new Event('ended')), 10)
      return Promise.resolve()
    }
  })
})

async function boardFits(frame: FrameLocator) {
  const cards = frame.locator('.lg-word-seal')
  await expect(cards.first()).toBeVisible()
  for (const card of await cards.all()) await expect(card).toBeInViewport({ ratio: 0.99 })
  expect(
    await cards.evaluateAll((nodes) =>
      nodes.every((node) => {
        const text = node.querySelector('span')!
        return (
          node.clientHeight >= 44 && text.scrollWidth <= text.clientWidth + 1 && text.scrollHeight <= node.clientHeight
        )
      }),
    ),
  ).toBe(true)
  expect(
    await frame
      .locator('.lg-word-seal.is-word span')
      .first()
      .evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
  ).toBeGreaterThanOrEqual(36)
}

test('mastered Shuriken keeps guided correction and every card visible', async ({ page }) => {
  await page.goto('/family-beta-preview.html?grade=grade5')
  const frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: /Enter the Spirit Realm/ }).click()
  await frame.getByRole('button', { name: 'Shuriken Match', exact: true }).click()
  await frame.locator('body').evaluate(() => document.fonts.ready)
  await boardFits(frame)
  const words = frame.locator('.lg-word-seal.is-word')
  await words.nth(0).click()
  await words.nth(1).click()
  await expect(frame.locator('.lg-guided-match')).toBeVisible()
  const hint = await frame.locator('.is-correction-hint').getAttribute('aria-label')
  expect(hint).toBeTruthy()
  await expect(frame.locator('.lg-shuriken-board')).not.toHaveClass(/is-incorrect/)
  await boardFits(frame)
  await page.screenshot({ path: test.info().outputPath('guided-correction.png') })
  await frame.getByRole('button', { name: hint!, exact: true }).click()
  await expect(frame.locator('.lg-word-seal.is-matched')).toHaveCount(2)
})

test('saved Shuriken keeps every card visible and resumes its confirmed match', async ({ page }) => {
  await page.goto('/family-beta-preview.html?grade=grade5&example=game-recovery')
  await page.evaluate(() => document.fonts.ready)
  await page.getByRole('button', { name: 'Shuriken Match', exact: true }).click()
  const frame = page.frameLocator('iframe:visible')
  await frame.locator('body').evaluate(() => document.fonts.ready)
  await boardFits(frame)
  const { pack } = JSON.parse((await page.locator('iframe:visible').getAttribute('data-family-game'))!)
  for (const side of [pack.pairs[0].left, pack.pairs[0].right])
    await frame.getByRole('button', { name: `${side.label}. Click to hear and select.`, exact: true }).click()
  await expect(frame.locator('.lg-word-seal.is-matched')).toHaveCount(2)
  await page.reload()
  await page.evaluate(() => document.fonts.ready)
  await page.getByRole('button', { name: 'Resume Shuriken Match', exact: true }).click()
  await expect(frame.locator('.lg-word-seal.is-matched')).toHaveCount(2)
  await boardFits(frame)
})

for (const [slug, grade, childId] of [
  ['kindergarten', 'Kindergarten', 'preview-0'],
  ['grade2', 'Grade 2', 'preview-1'],
  ['grade5', 'Grade 5', 'preview-2'],
] as const) {
  for (const game of ['Shuriken Match', 'Dictation Streak']) {
    test(`${grade}: ${game} keeps play visible through a mistake, completion and reopening`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      const source = inspectSnapshot(
        JSON.parse(readFileSync(new URL(`../fixtures/dojo-launch-2026-10-16/${slug}.json`, import.meta.url), 'utf8')),
      )
      const datasets = withGameLanguage(source.datasets)
      const anchor = [...datasets]
        .filter((d) => d.startDate <= '2026-10-23')
        .sort((a, b) => b.startDate.localeCompare(a.startDate))[0].startDate
      const initial = reinforcementGames(datasets, anchor, grade).find(
        (g) => g.capability.status === 'ready' && g.capability.pack.title === game,
      )!
      const results: BetaResult[] =
        slug === 'grade2'
          ? Array.from({ length: 11 }, (_, i) => ({
              schema: 1,
              id: `compact-visit-${i}`,
              childId,
              grade,
              activity: game,
              channel: 'game',
              datasetIds: initial.datasets.map((d) => d.id),
              correct: 1,
              attempted: 1,
              completedAt: '2026-10-22T19:00:00.000Z',
              day: '2026-10-22',
            }))
          : []
      const capability = reinforcementGames(datasets, anchor, grade, results, childId).find(
        (g) => g.capability.status === 'ready' && g.capability.pack.title === game,
      )!.capability
      if (capability.status !== 'ready') throw new Error('Expected a real playable cohort')
      const pack = capability.pack
      await page.addInitScript((results) => {
        if (!localStorage.getItem('compact-layout-seeded')) {
          localStorage.setItem('family-beta-preview-results-v1', JSON.stringify(results))
          localStorage.setItem('compact-layout-seeded', 'true')
        }
      }, results)
      await page.goto(`/family-beta-preview.html?grade=${slug}`)
      const frame = page.frameLocator('iframe:visible')
      await frame.getByRole('button', { name: /Practice.*Ninja Skills/ }).click()
      await frame.getByRole('button', { name: game, exact: true }).click()
      await frame.locator('body').evaluate(() => document.fonts.ready)
      const exit = frame.getByRole('button', { name: 'Exit learning module', exact: true })
      await expect(exit).toBeInViewport({ ratio: 0.99 })
      if (pack.moduleId === 'speed-match') {
        await boardFits(frame)
        await page.screenshot({ path: test.info().outputPath('initial-board.png') })
        const card = (label: string) =>
          frame.getByRole('button', { name: `${label}. Click to hear and select.`, exact: true })
        await card(pack.pairs[0].left.label).click()
        await card(pack.pairs[1].right.label).click()
        await expect(frame.locator('.lg-shuriken-board')).toHaveClass(/is-incorrect/)
        await expect(frame.locator('.lg-shuriken-board')).not.toHaveClass(/is-incorrect/)
        await boardFits(frame)
        await page.screenshot({ path: test.info().outputPath('retry-board.png') })
        await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
        await page.getByRole('button', { name: 'Close and return', exact: true }).click()
        for (const pair of pack.pairs) {
          await expect(frame.locator('.lg-shuriken-board')).not.toHaveClass(/is-correct|is-incorrect/)
          for (const side of [pair.left, pair.right]) {
            const button = card(side.label)
            if (!(await button.getAttribute('class'))?.includes('is-selected')) await button.click()
          }
        }
      } else if (pack.moduleId === 'dictation-streak') {
        const input = frame.locator('input')
        await expect(input).toBeInViewport({ ratio: 0.99 })
        await expect(frame.getByRole('button', { name: 'Replay transmission', exact: true })).toBeInViewport({
          ratio: 0.99,
        })
        for (const [i, round] of pack.rounds.entries()) {
          await expect(frame.locator('.lg-round-label')).toHaveText(`Prompt ${i + 1} of ${pack.rounds.length}`)
          if (i === 0) {
            const step = round.pinyinSteps![0]
            await input.fill(step.pinyin)
            for (const option of await frame.getByRole('option').all())
              await expect(option).toBeInViewport({ ratio: 0.99 })
            await page.screenshot({ path: test.info().outputPath('pinyin-choices.png') })
            await frame
              .getByRole('option', {
                name: step.candidates.find((c) => c !== Array.from(round.targetText)[0])!,
                exact: true,
              })
              .click()
            await expect(frame.locator('.lg-pinyin-correction-card')).toBeInViewport({ ratio: 0.99 })
            await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
            await page.getByRole('button', { name: 'Close and return', exact: true }).click()
            await expect(input).toBeEnabled({ timeout: 10000 })
          }
          let answer = ''
          for (const [index, step] of round.pinyinSteps!.entries()) {
            await input.fill(answer + step.pinyin)
            const option = frame.getByRole('option', { name: Array.from(round.targetText)[index], exact: true })
            await expect(option).toBeInViewport({ ratio: 0.99 })
            await option.click()
            answer += Array.from(round.targetText)[index]
            await expect(input).toHaveValue(answer)
          }
          const check = frame.getByRole('button', { name: 'Check characters', exact: true })
          await expect(check).toBeInViewport({ ratio: 0.99 })
          await check.click()
        }
      }
      await frame.getByRole('button', { name: 'Back to Ninja Skills', exact: true }).click()
      await frame.getByRole('button', { name: game, exact: true }).click()
      await expect(exit).toBeInViewport({ ratio: 0.99 })
      expect(errors).toEqual([])
    })
  }
}
