import { expect, test } from '@playwright/test'
import type { LearningModulePack } from '../../src/ninjaSkills/contracts.ts'
import { GAME_POLICIES } from '../../src/ninjaSkills/policy.ts'
import { grades, installFamilyFixtures } from './fixtures.ts'

test.beforeEach(async ({ page }) => installFamilyFixtures(page))

for (const [slug, grade, childId] of grades) {
  test(`${grade}: embedded Ninja Skills menu shares the same four-game policy`, async ({ page }) => {
    await page.goto(`/?grade=${slug}`)
    const frame = page.frameLocator('iframe:visible')
    await frame.getByRole('button', { name: /Practice your Ninja Skills/ }).click()
    for (const title of ['Memory Lanterns', 'Shuriken Match', 'Context Gap Dash', 'Sushi Scramble']) {
      const button = frame.getByRole('button', { name: title, exact: true })
      await expect(button).toBeEnabled()
      await expect(button.locator('..')).toContainText('source targets')
    }
    for (const title of ['Shadow Strike Dojo', 'Dictation Streak']) {
      const card = frame.getByRole('heading', { name: title, exact: true }).locator('..')
      await expect(card.getByRole('button', { name: 'Coming soon', exact: true })).toBeDisabled()
    }
    await frame.getByRole('button', { name: 'Sushi Scramble', exact: true }).click()
    await expect(frame.locator('.lg-sushi-bar button').first()).toBeVisible()
    await expect(frame.getByRole('heading', { name: 'Sushi Scramble', exact: true })).toBeVisible()
  })
  test(`${grade}: unreadable score history preserves embedded completion and retries once`, async ({
    page,
    isMobile,
  }) => {
    await page.goto(`/?grade=${slug}`)
    const frame = page.frameLocator('iframe:visible')
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await frame.getByRole('button', { name: /Practice your Ninja Skills/ }).click()
    await frame.getByRole('button', { name: 'Memory Lanterns', exact: true }).click()
    const cards = frame.locator('.lg-memory-card')
    await expect(cards.first()).toBeVisible()
    const faces = await cards.locator('.lg-card-face b').allTextContents()
    const unique = [...new Set(faces)]
    for (const face of unique) {
      const indices = faces.flatMap((value, index) => (value === face ? [index] : []))
      for (const index of indices) {
        if (isMobile) await cards.nth(index).tap()
        else await cards.nth(index).click()
      }
      if (face !== unique[unique.length - 1]) await expect(cards.nth(indices[0])).toHaveClass(/is-matched/)
    }
    const done = frame.getByRole('button', { name: 'Back to Ninja Skills', exact: true })
    await expect(done).toBeVisible()
    const completedRound = await frame.locator('.lg-complete').innerText()
    const before = await page.evaluate(() =>
      Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])),
    )
    const brokenKey = 'family-beta-preview-results-v1:synthetic-unreadable-history'
    await page.evaluate((key) => localStorage.setItem(key, '{}'), brokenKey)
    await done.click()
    await expect(frame.getByRole('alert').filter({ hasText: 'This game result could not be saved' })).toBeVisible()
    await expect(done).toBeVisible()
    expect(await frame.locator('.lg-complete').innerText()).toBe(completedRound)
    expect(await page.evaluate((key) => localStorage.getItem(key), brokenKey)).toBe('{}')
    const results = () =>
      page.evaluate(() =>
        Object.keys(localStorage)
          .filter(
            (key) =>
              key.startsWith('family-beta-preview-results-v1:') &&
              key !== 'family-beta-preview-results-v1:synthetic-unreadable-history',
          )
          .map((key) => JSON.parse(localStorage.getItem(key)!)),
      )
    expect(await results()).toEqual([])
    const afterFailure = await page.evaluate(() =>
      Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])),
    )
    for (const [key, value] of Object.entries(before)) expect(afterFailure[key]).toBe(value)

    // Restore only this test's injected fault; real score history is never reset.
    await page.evaluate((key) => localStorage.removeItem(key), brokenKey)
    await done.click()
    await expect(done).toHaveCount(0)
    expect(await results()).toEqual([
      expect.objectContaining({
        childId,
        grade,
        activity: 'Memory Lanterns',
        correct: unique.length,
        attempted: unique.length,
      }),
    ])
    await page.getByRole('button', { name: 'Progress', exact: true }).click()
    await expect(page.getByRole('cell', { name: `${unique.length} / ${unique.length}`, exact: true })).toBeVisible()
    expect(await results()).toHaveLength(1)
    expect(errors).toEqual([])
  })
  test(`${grade}: embedded new rounds fail closed when history changes after menu rendering`, async ({ page }) => {
    await page.goto(`/?grade=${slug}`)
    const frame = page.frameLocator('iframe:visible')
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await frame.getByRole('button', { name: /Practice your Ninja Skills/ }).click()
    const launch = frame.getByRole('button', { name: 'Memory Lanterns', exact: true })
    await expect(launch).toBeEnabled()
    const brokenKey = 'family-beta-preview-results-v1:synthetic-unreadable-history'
    await page.evaluate((key) => localStorage.setItem(key, '{}'), brokenKey)
    await launch.click()
    await expect(frame.locator('.lg-memory-card')).toHaveCount(0)
    await expect(frame.getByRole('button', { name: 'Temporarily unavailable', exact: true })).toHaveCount(4)
    await expect(frame.getByRole('button', { name: 'Coming soon', exact: true })).toHaveCount(2)
    expect(await page.evaluate((key) => localStorage.getItem(key), brokenKey)).toBe('{}')
    await page.evaluate((key) => localStorage.removeItem(key), brokenKey)
    await frame.getByRole('button', { name: 'Check saved history again', exact: true }).click()
    await expect(launch).toBeEnabled()
    await expect(frame.getByRole('button', { name: 'Temporarily unavailable', exact: true })).toHaveCount(0)
    await launch.click()
    await expect(frame.locator('.lg-memory-card').first()).toBeVisible()
    expect(errors).toEqual([])
  })
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
      await expect(frame.locator('.ninja-game-surface')).toHaveCSS('background-color', 'rgb(27, 32, 52)')
      // Opening reporting keeps the exact same pinned game and pauses its clock.
      await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
      await expect(frame.locator('html')).toHaveAttribute('data-activity-paused', 'true')
      await page.getByRole('button', { name: 'Close and return', exact: true }).click()
      await expect(frame.locator('html')).toHaveAttribute('data-activity-paused', 'false')
      expect(await page.locator('iframe:visible').getAttribute('data-family-game')).toBe(raw)
      // This Chromium build resets touch emulation during full-page capture.
      // Keep tablet visual capture in a separate context, not inside its tap journey.
      if (grade === 'Grade 5' && !isMobile)
        await page.screenshot({ path: test.info().outputPath('game.png'), fullPage: true })
      const choose = async (control: ReturnType<typeof frame.locator>) => {
        if (isMobile) await control.tap()
        else await control.click()
      }

      if (pack.moduleId === 'memory-flip') {
        const cards = frame.locator('.lg-memory-card')
        const faces = await cards.locator('.lg-card-face b').allTextContents()
        const unique = [...new Set(faces)]
        for (const face of unique) {
          const indices = faces.flatMap((text, index) => (text === face ? [index] : []))
          await choose(cards.nth(indices[0]))
          await choose(cards.nth(indices[1]))
          if (face !== unique[unique.length - 1]) await expect(cards.nth(indices[0])).toHaveClass(/is-matched/)
        }
      } else if (pack.moduleId === 'speed-match') {
        for (const pair of pack.pairs) {
          const word = frame.getByRole('button', { name: `${pair.left.label}. Click to hear and select.`, exact: true })
          const meaning = frame.getByRole('button', {
            name: `${pair.right.label}. Click to hear and select.`,
            exact: true,
          })
          await choose(word)
          await choose(meaning)
          // Correct feedback unlocks the next pair; the last pair opens completion.
          if (pair !== pack.pairs[pack.pairs.length - 1]) await expect(word).toHaveClass(/is-matched/)
        }
      } else if (pack.moduleId === 'context-gap-dash') {
        for (const [roundIndex, round] of pack.rounds.entries()) {
          // Software-rendered CI can take longer than ten seconds to complete
          // the normal-motion route. Keep animation enabled and verify saving
          // separately so this allowance cannot hide a dropped answer.
          await expect(frame.locator('.lg-dash-context-clue strong')).toHaveText(round.cueText!, { timeout: 30000 })
          const index = round.choices.findIndex((choice) => choice.id === round.correctChoiceId)
          const choice = frame
            .locator(isMobile ? '.lg-mobile-gate-choices button' : '.lg-canvas-access button')
            .nth(index)
          await expect(choice).toBeEnabled({ timeout: 30000 })
          if (isMobile) await choose(choice)
          else await frame.locator('canvas').press(String(index + 1))
          await expect
            .poll(() =>
              page.evaluate(
                (id) =>
                  Object.keys(localStorage)
                    .filter((key) => key.startsWith('family-beta-games-v1:') && key.includes(':checkpoint:'))
                    .map((key) => JSON.parse(localStorage.getItem(key)!))
                    .find((value) => value.scope.childId === id && value.scope.gameId === 'context-gap-dash')?.cleared,
                childId,
              ),
            )
            .toEqual(pack.rounds.slice(0, roundIndex + 1).map((prompt) => prompt.id))
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
            await choose(piece)
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

test('embedded completion stays open when its child context disappears, then retries once', async ({ page }) => {
  await page.goto('/?grade=kindergarten')
  const frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: /Practice your Ninja Skills/ }).click()
  await frame.getByRole('button', { name: 'Memory Lanterns', exact: true }).click()
  const cards = frame.locator('.lg-memory-card')
  await expect(cards).toHaveCount(4)
  const faces = await cards.locator('.lg-card-face b').allTextContents()
  const unique = [...new Set(faces)]
  for (const face of unique) {
    const indices = faces.flatMap((value, index) => (value === face ? [index] : []))
    await cards.nth(indices[0]).click()
    await cards.nth(indices[1]).click()
    if (face !== unique[unique.length - 1]) await expect(cards.nth(indices[0])).toHaveClass(/is-matched/)
  }
  const done = frame.getByRole('button', { name: 'Back to Ninja Skills', exact: true })
  await expect(done).toBeVisible()
  const profile = await page.locator('iframe:visible').getAttribute('data-family-profile')
  await page.evaluate(() => sessionStorage.removeItem('family-beta-preview-selected-v1'))
  await page.locator('iframe:visible').evaluate((node) => node.removeAttribute('data-family-profile'))
  await done.click()
  await expect(done).toBeVisible()
  const results = () =>
    page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('family-beta-preview-results-v1:')))
  expect(await results()).toHaveLength(0)
  await page
    .locator('iframe:visible')
    .evaluate((node, value) => node.setAttribute('data-family-profile', value!), profile)
  await done.click()
  await expect(done).toHaveCount(0)
  expect(await results()).toHaveLength(1)
})
