import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { inspectSnapshot } from '../../src/familyBeta/curriculum.ts'
import { reinforcementGames } from '../../src/familyBeta/gamePools.ts'

test.beforeEach(async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-10-23T19:00:00Z'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
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
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('playing'))
      setTimeout(() => this.dispatchEvent(new Event('ended')), 10)
      return Promise.resolve()
    }
  })
})

for (const [slug, grade] of [
  ['kindergarten', 'Kindergarten'],
  ['grade2', 'Grade 2'],
  ['grade5', 'Grade 5'],
] as const) {
  const source = inspectSnapshot(
    JSON.parse(readFileSync(new URL(`../fixtures/dojo-launch-2026-10-16/${slug}.json`, import.meta.url), 'utf8')),
  )
  const anchor = [...source.datasets]
    .filter((d) => d.startDate <= '2026-10-23')
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0].startDate
  const games = reinforcementGames(source.datasets, anchor, grade)
  for (const { capability, datasets } of games) {
    // Lanterns has its own repeated/failure matrix; unavailable content is
    // explicitly disabled by the menu and never fabricated for this test.
    if (
      capability.status !== 'ready' ||
      capability.pack.moduleId === 'memory-flip' ||
      capability.pack.moduleId === 'dictation-streak'
    )
      continue
    const pack = capability.pack
    test(`${grade}: ${pack.title} completes its actual earlier target set and returns`, async ({ page }, info) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      if (!info.project.use.hasTouch && ['sentence-scramble', 'context-gap-dash'].includes(pack.moduleId))
        await page.setViewportSize({ width: 983, height: 638 })
      await page.goto(`/family-beta-preview.html?grade=${slug}`)
      const f = page.frameLocator('iframe:visible')
      await f.getByRole('button', { name: /Practice.*Ninja Skills/ }).click()
      await f.getByRole('button', { name: pack.title, exact: true }).click()
      if (pack.moduleId === 'speed-match') {
        for (const pair of pack.pairs) {
          await expect(f.locator('.lg-shuriken-board')).not.toHaveClass(/is-correct|is-incorrect/)
          for (const side of [pair.left, pair.right])
            await f.getByRole('button', { name: `${side.label}. Click to hear and select.`, exact: true }).click()
        }
      } else if (pack.moduleId === 'target-blast') {
        for (const [i, round] of pack.rounds.entries()) {
          await expect(f.locator('.lg-round-label')).toHaveText(`Training strike ${i + 1} of ${pack.rounds.length}`)
          await f.locator(`[data-choice-id=${JSON.stringify(round.correctChoiceId)}]`).click()
        }
      } else if (pack.moduleId === 'sentence-scramble') {
        for (const [i, round] of pack.rounds.entries()) {
          await expect(f.locator('.lg-round-label')).toHaveText(`Sentence ${i + 1} of ${pack.rounds.length}`)
          for (const [pos, id] of round.correctTokenIds.entries()) {
            const token = round.tokens.find((t) => t.id === id)!
            await expect(f.locator('.lg-sushi-bar')).toBeInViewport({ ratio: 1 })
            await expect(f.locator('.lg-sushi-plate')).toBeInViewport({ ratio: 1 })
            await f
              .locator('.lg-sushi-bar')
              .getByRole('button', { name: `Place ${token.label} in sentence position ${pos + 1}`, exact: true })
              .and(f.locator('button:enabled'))
              .first()
              .click()
          }
        }
      } else if (pack.moduleId === 'context-gap-dash') {
        for (const round of pack.rounds) {
          await expect(f.locator('.lg-dash-context-clue strong')).toHaveText(round.cueText!, { timeout: 30000 })
          const choice = f
            .locator(info.project.use.hasTouch ? '.lg-mobile-gate-choices button' : '.lg-canvas-access button')
            .nth(round.choices.findIndex((c) => c.id === round.correctChoiceId))
          await expect(choice).toBeEnabled({ timeout: 30000 })
          if (info.project.use.hasTouch) await choice.tap()
          else {
            await choice.focus()
            await choice.press('Enter')
          }
        }
      }
      const done = f.getByRole('button', {
        name:
          pack.moduleId === 'target-blast'
            ? 'Celebrate and return'
            : pack.moduleId === 'context-gap-dash'
              ? 'Celebrate and finish'
              : 'Back to Ninja Skills',
        exact: true,
      })
      await expect(done).toBeVisible({ timeout: 30000 })
      await done.click()
      await expect(f.getByRole('button', { name: pack.title, exact: true })).toBeVisible()
      const results = await page.evaluate(() =>
        Object.entries(localStorage)
          .filter(([k]) => k.startsWith('family-beta-preview-results-v1:'))
          .map(([, v]) => JSON.parse(v)),
      )
      expect(results).toHaveLength(1)
      expect(results[0].datasetIds.sort()).toEqual(datasets.map((d) => d.id).sort())
      const count = 'pairs' in pack ? pack.pairs.length : pack.rounds.length
      expect(results[0]).toMatchObject({
        grade,
        activity: pack.title,
        channel: 'game',
        attempted: count,
        correct: count,
      })
      expect(errors).toEqual([])
    })
  }
}
