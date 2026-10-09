import { expect, test } from '@playwright/test'
import type { LearningModulePack } from '../../src/ninjaSkills/contracts.ts'
import { GAME_POLICIES } from '../../src/ninjaSkills/policy.ts'
import { grades, installFamilyFixtures } from './fixtures.ts'

test.beforeEach(async ({ page }) => installFamilyFixtures(page))

for (const [slug, grade, childId] of grades) {
  for (const title of ['Memory Lanterns', 'Shuriken Match', 'Context Gap Dash', 'Sushi Scramble']) {
    test(`${grade}: ${title} follows the approved policy and saves its reviewed round`, async ({ page, isMobile }) => {
      test.setTimeout(120000)
      await page.goto(`/?grade=${slug}`)
      await page.getByRole('button', { name: 'Ninja Skills', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Coming soon', exact: true })).toHaveCount(2)
      const launch = page.getByRole('button', { name: title, exact: true })
      await expect(launch.locator('..')).toContainText('source targets')
      await launch.click()
      const raw = await page.locator('iframe:visible').getAttribute('data-family-game')
      const pack = JSON.parse(raw!).pack as LearningModulePack
      const prompts = 'pairs' in pack ? pack.pairs : pack.rounds
      const selected = prompts.map((prompt) => pack.cohort.terms.find((term) => term.occurrenceId === prompt.targetId)!)
      expect(new Set(selected.map((term) => term.tier))).toEqual(new Set(GAME_POLICIES[pack.moduleId].tiers))
      const frame = page.frameLocator('iframe:visible')
      await expect(frame.getByRole('heading', { name: title, exact: true })).toBeVisible()
      // Opening reporting keeps the exact same pinned game and pauses its clock.
      await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
      await expect(frame.locator('html')).toHaveAttribute('data-activity-paused', 'true')
      await page.getByRole('button', { name: 'Close and return', exact: true }).click()
      await expect(frame.locator('html')).toHaveAttribute('data-activity-paused', 'false')
      expect(await page.locator('iframe:visible').getAttribute('data-family-game')).toBe(raw)

      if (pack.moduleId === 'memory-flip') {
        const cards = frame.locator('.lg-memory-card')
        const faces = await cards.locator('.lg-card-face b').allTextContents()
        const unique = [...new Set(faces)]
        for (const face of unique) {
          const indices = faces.flatMap((text, index) => (text === face ? [index] : []))
          await cards.nth(indices[0]).click()
          await cards.nth(indices[1]).click()
          if (face !== unique[unique.length - 1]) await expect(cards.nth(indices[0])).toHaveClass(/is-matched/)
        }
      } else if (pack.moduleId === 'speed-match') {
        for (const pair of pack.pairs) {
          const word = frame.getByRole('button', { name: `${pair.left.label}. Click to hear and select.`, exact: true })
          const meaning = frame.getByRole('button', {
            name: `${pair.right.label}. Click to hear and select.`,
            exact: true,
          })
          await word.click()
          await meaning.click()
          // Correct feedback unlocks the next pair; the last pair opens completion.
          if (pair !== pack.pairs[pack.pairs.length - 1]) await expect(word).toHaveClass(/is-matched/)
        }
      } else if (pack.moduleId === 'context-gap-dash') {
        for (const round of pack.rounds) {
          await expect(frame.locator('.lg-dash-context-clue strong')).toHaveText(round.cueText!, { timeout: 10000 })
          const index = round.choices.findIndex((choice) => choice.id === round.correctChoiceId)
          const choice = frame.locator(isMobile ? '.lg-mobile-gate-choices button' : '.lg-canvas-access button').nth(index)
          await expect(choice).toBeEnabled()
          if (isMobile) await choice.click()
          else await frame.locator('canvas').press(String(index + 1))
        }
      } else if (pack.moduleId === 'sentence-scramble') {
        for (const [roundIndex, round] of pack.rounds.entries()) {
          await expect(frame.locator('.lg-round-label')).toHaveText(
            `Sentence ${roundIndex + 1} of ${pack.rounds.length}`,
          )
          for (const [index, id] of round.correctTokenIds.entries()) {
            const token = round.tokens.find((token) => token.id === id)!
            const piece = frame
              .locator('.lg-sushi-bar')
              .getByRole('button', { name: `Place ${token.label} in sentence position ${index + 1}`, exact: true })
              .and(frame.locator('button:enabled'))
              .first()
            await piece.click()
          }
        }
      }
      await frame
        .getByRole('button', {
          name: pack.moduleId === 'context-gap-dash' ? 'Celebrate and finish' : 'Back to Ninja Skills',
          exact: true,
        })
        .click()
      await expect(page.getByRole('heading', { name: 'Practice your Ninja Skills', exact: true })).toBeVisible()
      const readResults = () =>
        page.evaluate(() =>
          Object.keys(localStorage)
            .filter((key) => key.startsWith('family-beta-preview-results-v1:'))
            .map((key) => JSON.parse(localStorage.getItem(key)!)),
        )
      const saved = await readResults()
      expect(saved).toHaveLength(1)
      expect(saved[0]).toMatchObject({
        childId,
        grade,
        activity: title,
        correct: prompts.length,
        attempted: prompts.length,
      })
      expect(saved[0]).not.toHaveProperty('response')
      await page.reload()
      await page.getByRole('button', { name: 'Progress', exact: true }).click()
      await expect(page.getByRole('cell', { name: `${prompts.length} / ${prompts.length}`, exact: true })).toBeVisible()
      expect(await readResults()).toEqual(saved)
    })
  }
}
