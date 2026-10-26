import { expect, type FrameLocator, type Page, test } from '@playwright/test'
import { inspectSnapshot } from '../../src/familyBeta/curriculum.ts'
import { reinforcementGames } from '../../src/familyBeta/gamePools.ts'
import type { SequenceGameRound } from '../../src/learningModules/sushi-scramble/runtime/contracts.ts'
import type { LearningModuleId } from '../../src/ninjaSkills/contracts.ts'
import { withGameLanguage } from '../w2-recovery/contentFixtures.ts'
import { newlySupported, nextLessonSnapshot } from './fixtures.ts'

const activity = (page: Page) => page.frameLocator('iframe:visible')

test.beforeEach(async ({ page }) => {
  // Phaser advances its transitions using Date.now(); keep time advancing.
  await page.clock.setSystemTime(new Date('2026-11-02T19:00:00Z'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // These cases test game content, correction and saved progress. Recording
  // coverage/native playback are checked separately; no physical audio claim.
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

async function openMenu(page: Page, slug: string) {
  await page.route('**/curriculum/beta/*.json', (route) => route.fulfill({ json: nextLessonSnapshot(slug) }))
  await page.goto(`./family-beta-preview.html?grade=${slug}`)
  await activity(page)
    .getByRole('button', { name: /Practice.*Ninja Skills/ })
    .click()
}

async function launch(page: Page, name: string, id: LearningModuleId, grade: (typeof newlySupported)[number]) {
  await activity(page).getByRole('button', { name, exact: true }).click()
  await expect(activity(page).getByRole('heading', { name, exact: true })).toBeVisible()
  const capability = reinforcementGames(
    withGameLanguage(inspectSnapshot(nextLessonSnapshot(grade.slug)).datasets),
    '2026-11-02',
    grade.grade,
  ).find((game) => game.capability.status === 'ready' && game.capability.pack.moduleId === id)!.capability
  if (capability.status !== 'ready') throw new Error('Expected supported game')
  expect(capability.pack.cohort.provenance).toHaveLength(1)
  expect(
    capability.pack.cohort.terms.every((term) => [...grade.writing, ...grade.reading].includes(term.text as never)),
  ).toBe(true)
  expect(capability.pack.cohort.terms.every((term) => term.tier !== 'tier-3')).toBe(true)
  return capability
}

async function reportAndExit(page: Page) {
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Report a problem', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  await activity(page).getByRole('button', { name: 'Exit learning module', exact: true }).click()
  await expect(
    activity(page)
      .getByRole('button', { name: /Practice.*Ninja Skills/ })
      .or(activity(page).getByRole('button', { name: /Back to all challenges/ })),
  ).toBeVisible()
}

async function sushiAnswer(frame: FrameLocator, round: SequenceGameRound, ids = round.correctTokenIds) {
  for (const [index, id] of ids.entries()) {
    const token = round.tokens.find((token) => token.id === id)!
    await frame
      .locator('.lg-sushi-bar')
      .getByRole('button', { name: `Place ${token.label} in sentence position ${index + 1}`, exact: true })
      .and(frame.locator('button:enabled'))
      .first()
      .click()
  }
}

for (const grade of newlySupported) {
  test(`${grade.slug}: new words match definitions and recover a mistake through a completed board`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await openMenu(page, grade.slug)
    const initial = await launch(page, 'Shuriken Match', 'speed-match', grade)
    if (initial.pack.moduleId !== 'speed-match') throw new Error('Wrong game')
    const pairs = initial.pack.pairs
    const frame = activity(page)
    const card = (label: string) =>
      frame.getByRole('button', { name: `${label}. Click to hear and select.`, exact: true })
    await card(pairs[0].left.label).click()
    await card(pairs[1].right.label).click()
    await expect(frame.locator('.lg-shuriken-status')).toContainText('Decoy seals!')
    await card(pairs[0].left.label).click()
    await card(pairs[0].right.label).click()
    await expect(frame.locator('.lg-word-seal.is-matched')).toHaveCount(2)
    for (const [index, pair] of pairs.slice(1).entries()) {
      await card(pair.left.label).click()
      await card(pair.right.label).click()
      if (index + 2 < pairs.length) await expect(frame.locator('.lg-word-seal.is-matched')).toHaveCount((index + 2) * 2)
    }
    await expect(frame.getByRole('button', { name: 'Back to Ninja Skills', exact: true })).toBeVisible()
    await reportAndExit(page)
    expect(errors).toEqual([])
  })

  test(`${grade.slug}: new Pinyin targets recover a wrong character and complete word-level dictation`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await openMenu(page, grade.slug)
    const initial = await launch(page, 'Dictation Streak', 'dictation-streak', grade)
    if (initial.pack.moduleId !== 'dictation-streak') throw new Error('Wrong game')
    const frame = activity(page)
    const first = initial.pack.rounds[0]
    await frame.locator('input').fill(first.pinyinSteps![0].pinyin)
    const wrong = first.pinyinSteps![0].candidates.find((char) => char !== Array.from(first.targetText)[0])!
    await frame.getByRole('option', { name: wrong, exact: true }).click()
    await expect(frame.getByRole('alert').filter({ hasText: 'Wrong character' })).toBeVisible()
    await expect(frame.getByRole('alert').filter({ hasText: 'Wrong character' })).toHaveCount(0)
    for (const [index, round] of initial.pack.rounds.entries()) {
      await expect(frame.locator('.lg-round-label')).toHaveText(`Prompt ${index + 1} of ${initial.pack.rounds.length}`)
      let assembled = ''
      for (const [position, step] of round.pinyinSteps!.entries()) {
        await frame.locator('input').fill(assembled + step.pinyin)
        const char = Array.from(round.targetText)[position]
        await frame.getByRole('option', { name: char, exact: true }).click()
        assembled += char
        await expect(frame.locator('input')).toHaveValue(assembled)
      }
      await frame.getByRole('button', { name: 'Check characters', exact: true }).click()
    }
    await expect(frame.getByRole('button', { name: 'Back to Ninja Skills', exact: true })).toBeVisible()
    await reportAndExit(page)
    expect(errors).toEqual([])
  })

  test(`${grade.slug}: new sentences retry unchanged, advance and survive Report pause`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await openMenu(page, grade.slug)
    const initial = await launch(page, 'Sushi Scramble', 'sentence-scramble', grade)
    if (initial.pack.moduleId !== 'sentence-scramble') throw new Error('Wrong game')
    const first = initial.pack.rounds[0]
    const wrong = [...first.correctTokenIds]
    ;[wrong[0], wrong[1]] = [wrong[1], wrong[0]]
    await sushiAnswer(activity(page), first, wrong)
    await expect(activity(page).getByRole('status').filter({ hasText: 'That order needs another try' })).toBeVisible()
    await expect(activity(page).locator('.lg-sushi-plate button')).toHaveCount(0)
    await expect(activity(page).locator('.lg-round-label')).toHaveText(`Sentence 1 of ${initial.pack.rounds.length}`)
    await sushiAnswer(activity(page), first)
    await expect(activity(page).locator('.lg-round-label')).toHaveText(`Sentence 2 of ${initial.pack.rounds.length}`)
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await expect(activity(page).locator('.lg-round-label')).toHaveText(`Sentence 2 of ${initial.pack.rounds.length}`)
    await sushiAnswer(activity(page), initial.pack.rounds[1])
    if (initial.pack.rounds.length === 2)
      await expect(activity(page).getByRole('button', { name: 'Back to Ninja Skills', exact: true })).toBeVisible()
    else
      await expect(activity(page).locator('.lg-round-label')).toHaveText(`Sentence 3 of ${initial.pack.rounds.length}`)
    await reportAndExit(page)
    expect(errors).toEqual([])
  })
}

test('kindergarten: two writing targets do not enable Context Gap or borrow another week', async ({ page }) => {
  await openMenu(page, 'kindergarten')
  await expect(activity(page).getByRole('button', { name: 'Context Gap Dash', exact: true })).toHaveCount(0)
  await expect(activity(page).getByRole('button', { name: 'Coming soon', exact: true })).toBeDisabled()
  await expect(activity(page).getByText(/at least three distinct Tier 1/)).toBeVisible()
  for (const name of ['Dictation Streak', 'Shuriken Match', 'Sushi Scramble', 'Shadow Strike Dojo', 'Memory Lanterns'])
    await expect(activity(page).getByRole('button', { name, exact: true })).toBeEnabled()
})

test('grade5: new contextual sentences use only this writing cohort and permit repeated gates', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const grade = newlySupported[1]
  await openMenu(page, grade.slug)
  const initial = await launch(page, 'Context Gap Dash', 'context-gap-dash', grade)
  if (initial.pack.moduleId !== 'context-gap-dash') throw new Error('Wrong game')
  const frame = activity(page)
  for (const [index, round] of initial.pack.rounds.slice(0, 2).entries()) {
    await expect(frame.locator('.lg-dash-context-clue strong')).toHaveText(round.cueText!)
    const choiceIndex = round.choices.findIndex((choice) => choice.id === round.correctChoiceId)
    const touch = Boolean(test.info().project.use.hasTouch)
    const button = frame.locator(touch ? '.lg-mobile-gate-choices button' : '.lg-canvas-access button').nth(choiceIndex)
    await expect(button).toBeEnabled()
    if (touch) await button.tap()
    else {
      // Use the real keyboard-accessible gate. A canvas is not focusable;
      // pressing its digit before entering the iframe can target the parent.
      await button.focus()
      await button.press('Enter')
    }
    await expect(frame.locator('.lg-dash-context-clue strong')).toHaveText(initial.pack.rounds[index + 1].cueText!, {
      timeout: 10000,
    })
  }
  await reportAndExit(page)
  expect(errors).toEqual([])
})
