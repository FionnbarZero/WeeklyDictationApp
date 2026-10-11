import { expect, type FrameLocator, type Page, test } from '@playwright/test'
import type { GameCheckpoint } from '../../src/ninjaSkills/progress.ts'
import type { LearningModuleProductionRound } from '../../src/ninjaSkills/contracts.ts'
import { grades, installFamilyFixtures, type SyntheticFamilyDocuments } from './fixtures.ts'

async function setup(page: Page, documents: SyntheticFamilyDocuments = new Map()) {
  await installFamilyFixtures(page, documents)
  await page.addInitScript(() => {
    const target = window as Window & { spoken?: string[] }
    target.spoken = []
    const speak = speechSynthesis.speak.bind(speechSynthesis)
    speechSynthesis.speak = (utterance) => {
      target.spoken!.push(utterance.text)
      speak(utterance)
    }
  })
}
async function open(page: Page, slug = 'grade5', embedded = false) {
  await page.goto(`http://127.0.0.1:5193/?grade=${slug}`)
  const menu = embedded ? page.frameLocator('iframe:visible') : page
  if (embedded) await menu.getByRole('button', { name: /Practice your Ninja Skills/ }).click()
  else await page.getByRole('button', { name: 'Ninja Skills', exact: true }).click()
  await menu.getByRole('button', { name: /^(Resume )?Dictation Streak$/ }).click()
  const frame = page.frameLocator('iframe:visible')
  await expect(frame.locator('.lg-dictation-console input')).toBeVisible()
  return frame
}
async function checkpoint(page: Page): Promise<GameCheckpoint> {
  return page.evaluate(() =>
    JSON.parse(
      localStorage.getItem(
        Object.keys(localStorage).find(
          (key) =>
            key.startsWith('family-beta-games-v1:') &&
            key.includes(':checkpoint:') &&
            JSON.parse(localStorage.getItem(key)!).scope.gameId === 'dictation-streak',
        )!,
      )!,
    ),
  )
}
async function records(page: Page) {
  return page.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage)
        .filter((key) => key.startsWith('family-beta-games-v1:') || key.startsWith('family-beta-preview-results-v1:'))
        .map((key) => [key, JSON.parse(localStorage.getItem(key)!)]),
    ),
  )
}
async function assemble(frame: FrameLocator, round: LearningModuleProductionRound, mobile = false) {
  let answer = ''
  for (const [index, step] of round.pinyinSteps!.entries()) {
    await frame.locator('input').fill(answer + step.pinyin)
    const character = Array.from(round.targetText)[index]
    const option = frame.getByRole('option', { name: character, exact: true })
    if (mobile) await option.tap()
    else await option.click()
    answer += character
    await expect(frame.locator('input')).toHaveValue(answer)
  }
  await frame.getByRole('button', { name: 'Check characters', exact: true }).click()
}
for (const [slug, grade] of grades) {
  test(`${grade}: Dictation mixed tiers, four-part replay, reviewed errors, offline reload and cloud completion`, async ({
    page,
    context,
    browser,
    isMobile,
  }) => {
    test.setTimeout(120000)
    const documents: SyntheticFamilyDocuments = new Map()
    await setup(page, documents)
    let frame = await open(page, slug)
    const initial = await checkpoint(page)
    if (initial.pack.moduleId !== 'dictation-streak') throw new Error('Wrong fixture')
    const rounds = initial.pack.rounds
    expect(
      new Set(rounds.map((r) => initial.pack.cohort.terms.find((t) => t.occurrenceId === r.targetId)!.tier)),
    ).toEqual(new Set(['tier-1', 'tier-2']))
    const spoken = () => frame.locator('html').evaluate(() => (window as Window & { spoken: string[] }).spoken)
    await expect.poll(spoken).toContain(rounds[0].audioText)
    await frame.getByRole('button', { name: 'Replay transmission', exact: true }).click()
    await expect
      .poll(async () => (await spoken()).filter((t) => t === rounds[0].audioText).length)
      .toBeGreaterThanOrEqual(2)
    // A complete native-keyboard answer is reviewed; unfinished Latin input is not.
    await frame.locator('input').fill('错'.repeat(Array.from(rounds[0].targetText).length))
    await frame.getByRole('button', { name: 'Check characters', exact: true }).click()
    await expect.poll(async () => (await checkpoint(page)).revision).toBe(1)
    await expect(frame.locator('.lg-dictation-wrong-feedback')).toBeVisible()
    const wrong = await checkpoint(page)
    expect(wrong.prompts[0]).toMatchObject({ attempted: 1, correct: 0 })
    frame = await open(page, slug, true)
    expect(await checkpoint(page)).toEqual(wrong)
    await assemble(frame, rounds[0], isMobile)
    await expect.poll(async () => (await checkpoint(page)).cleared.length).toBe(1)
    frame = await open(page, slug)
    expect((await checkpoint(page)).pack).toEqual(initial.pack)
    await context.setOffline(true)
    for (const [index, round] of rounds.entries()) {
      if (!index) continue
      await expect(frame.locator('.lg-round-label')).toHaveText(`Prompt ${index + 1} of ${rounds.length}`)
      await expect(frame.locator('input')).toBeVisible()
      await expect.poll(spoken).toContain(round.audioText)
      await assemble(frame, round, isMobile)
      await expect.poll(async () => (await checkpoint(page)).cleared.length).toBe(index + 1)
    }
    await expect(frame.locator('.lg-complete-stats')).toContainText('1 learning retry')
    await frame.getByRole('button', { name: 'Back to Ninja Skills', exact: true }).click()
    await expect(frame.locator('.lg-complete')).toHaveCount(0)
    const saved = await records(page)
    const completion = Object.entries(saved).find(([key]) => key.includes(':completed:'))![1]
    expect(completion.result).toMatchObject({
      correct: rounds.length,
      attempted: rounds.length + 1,
      activity: 'Dictation Streak',
    })
    expect(JSON.stringify(saved)).not.toContain('"response"')
    await context.setOffline(false)
    await page.getByRole('button', { name: 'Progress', exact: true }).click()
    await expect.poll(() => [...documents.keys()].filter((k) => k.includes('/betaGameCompletions/')).length).toBe(1)
    const secondContext = await browser.newContext()
    try {
      const second = await secondContext.newPage()
      await setup(second, documents)
      await second.goto(`http://127.0.0.1:5193/?grade=${slug}`)
      await second.getByRole('button', { name: 'Progress', exact: true }).click()
      await expect(
        second.getByRole('cell', { name: `${rounds.length} / ${rounds.length + 1}`, exact: true }),
      ).toBeVisible()
      await expect
        .poll(async () => Object.entries(await records(second)).find(([key]) => key.includes(':completed:'))?.[1])
        .toEqual(completion)
    } finally {
      await secondContext.close()
    }
  })
}

test('Dictation failed save holds correctness and retries the same submitted word once', async ({ page }) => {
  await setup(page)
  const frame = await open(page)
  const before = await checkpoint(page)
  if (before.pack.moduleId !== 'dictation-streak') throw new Error('Wrong fixture')
  const owner = page.frames().find((f) => f.url().includes('family-game.html'))!
  await owner.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('family-beta-games-v1:') && key.includes(':checkpoint:'))
        throw new Error('Synthetic quota fault')
      original.call(this, key, value)
    }
    ;(window as Window & { restore?: () => void }).restore = () => {
      Storage.prototype.setItem = original
    }
  })
  await assemble(frame, before.pack.rounds[0])
  await expect(frame.getByRole('alert')).toContainText('This word has not advanced')
  await expect(frame.locator('.lg-feedback')).toHaveCount(0)
  await expect(frame.locator('input')).toHaveCount(0)
  expect(await checkpoint(page)).toEqual(before)
  await owner.evaluate(() => (window as Window & { restore?: () => void }).restore?.())
  await frame.getByRole('button', { name: 'Retry saving word', exact: true }).click()
  await expect(frame.locator('.lg-round-label')).toHaveText(`Prompt 2 of ${before.pack.rounds.length}`)
  expect((await checkpoint(page)).revision).toBe(1)
})

test('Dictation report pause holds a confirmed save until closed', async ({ page }) => {
  await setup(page)
  const frame = await open(page)
  const before = await checkpoint(page)
  if (before.pack.moduleId !== 'dictation-streak') throw new Error('Wrong fixture')
  await page.evaluate(() => {
    const target = window as Window & { release?: () => void; locked?: boolean }
    void navigator.locks.request('ninja-game-storage-v1:family-synthetic-parent', async () => {
      target.locked = true
      await new Promise<void>((resolve) => {
        target.release = resolve
      })
    })
  })
  await expect.poll(() => page.evaluate(() => (window as Window & { locked?: boolean }).locked)).toBe(true)
  await assemble(frame, before.pack.rounds[0])
  await expect(frame.getByRole('status')).toContainText('Saving reviewed word')
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await page.evaluate(() => (window as Window & { release?: () => void }).release?.())
  await expect.poll(async () => (await checkpoint(page)).revision).toBe(1)
  await page.waitForTimeout(1500)
  await expect(frame.locator('.lg-feedback')).toHaveCount(0)
  await expect(frame.locator('.lg-round-label')).toHaveText(`Prompt 1 of ${before.pack.rounds.length}`)
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  await expect(frame.locator('.lg-round-label')).toHaveText(`Prompt 2 of ${before.pack.rounds.length}`)
})
