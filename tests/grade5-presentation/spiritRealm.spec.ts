import { readFileSync } from 'node:fs'
import { expect, type FrameLocator, type Page, test } from '@playwright/test'
import { datasetFromCanonicalCandidate } from '../../src/curriculum/datasetProjection.ts'
import type { BetaResult } from '../../src/familyBeta/model.ts'
import { masteryStorageKey, prepareMastery, readMasteryRecord } from '../../src/familyBeta/previewMastery.ts'
import { buildGrade5LearningHub } from '../../src/grade5Lab/learningHub.ts'
import {
  buildGrade5AssessmentPayload,
  extractGrade5Assessment,
} from '../../src/grade5PresentationPreview/assessmentSource.ts'
import { grade5MasteredDatasets, grade5MasteredGames } from '../../src/grade5PresentationPreview/masteredGames.ts'
import type { LearningModulePack } from '../../src/ninjaSkills/contracts.ts'

const date = '2026-10-21'
const childId = 'preview-2'
const activeEight = ['或者', '了解', '完', '兴奋的', '告诉', '沟通', '快速地', '有意思']
// Independent expected historical pool: not the current assessment or all words
// from every old week. Repeated active targets must be excluded in both modes.
const masteredWords = [
  '怎样',
  '吸收',
  '通过',
  '像',
  '如果',
  '需要',
  '部分',
  '重要',
  '开始',
  '各种各样',
  '提醒',
  '年长的',
  '并且',
  '表达',
  '碰',
  '空气',
  '根',
  '帮助',
  '植物',
  '食物',
  '得到',
  '关',
  '打开',
  '海洋',
  '阳光',
  '鲨鱼',
  '天敌',
  '生存',
]
const gameNames = ['Shuriken Match', 'Shadow Strike Dojo', 'Memory Lanterns', 'Context Gap Dash', 'Sushi Scramble']
const baseline = JSON.parse(
  readFileSync(new URL('../fixtures/dojo-launch-2026-10-16/grade5.json', import.meta.url), 'utf8'),
)
const source = extractGrade5Assessment(buildGrade5AssessmentPayload(baseline.payload))
const all = source.classification.selectedCandidates
  .filter((candidate) => candidate.status === 'valid')
  .map(datasetFromCanonicalCandidate)
const masteredIds = new Set(
  buildGrade5LearningHub(source, date)
    .sections.find((section) => section.id === 'review')!
    .cohorts.map((cohort) => cohort.cohortId),
)
const mastered = all.filter((dataset) => masteredIds.has(dataset.id))
const pool = grade5MasteredDatasets(mastered, all, date)
const packs = grade5MasteredGames(pool, [], childId).map(({ capability }) => {
  if (capability.status !== 'ready') throw new Error(capability.reason)
  return capability.pack
})
const masteryRecords = Object.fromEntries(
  (['writing', 'reading'] as const).map((channel) => {
    const empty = {
      schema: 1 as const,
      childId,
      grade: 'Grade 5',
      channel,
      cycle: 3,
      states: [],
      applied: ['earlier-reviewed-event'],
    }
    const record = prepareMastery(empty, all, mastered, date, () => 0).record
    const key = masteryStorageKey(childId, 'Grade 5', channel)
    const raw = JSON.stringify(record)
    // Validate the seeded record with the actual legacy reader before relying on
    // byte-preservation assertions. These are synthetic test records only.
    expect(readMasteryRecord({ getItem: () => raw } as unknown as Storage, childId, 'Grade 5', channel)).toEqual(record)
    expect(record.states.length).toBeGreaterThan(0)
    return [key, raw]
  }),
)
const errorsByPage = new WeakMap<Page, string[]>()
const frameOf = (page: Page) => page.frameLocator('iframe:visible')

test.beforeEach(async ({ page, baseURL }) => {
  const errors: string[] = []
  errorsByPage.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // Keep the curriculum date deterministic while wall time advances: Phaser's
  // TweenManager uses Date.now(), so a fixed Date would stall every gate move.
  await page.clock.setSystemTime(new Date('2026-10-21T19:00:00Z'))
  const origin = new URL(baseURL!).origin
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
  )
  await page.addInitScript((records) => {
    for (const [key, raw] of Object.entries(records))
      if (localStorage.getItem(key) === null) localStorage.setItem(key, raw)
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices() {
          return []
        },
        speak(utterance: SpeechSynthesisUtterance) {
          utterance.onstart?.({} as SpeechSynthesisEvent)
          setTimeout(() => utterance.onend?.({} as SpeechSynthesisEvent), 5)
        },
      },
    })
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('playing'))
      setTimeout(() => this.dispatchEvent(new Event('ended')), 10)
      return Promise.resolve()
    }
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        async getUserMedia() {
          throw new DOMException('Synthetic microphone refusal', 'NotAllowedError')
        },
      },
    })
  }, masteryRecords)
  await page.goto('/family-beta-preview.html?grade=grade5')
  await expect(frameOf(page).getByRole('button', { name: /Enter the Spirit Realm/ })).toBeVisible()
})

test.afterEach(async ({ page }) => {
  expect(errorsByPage.get(page)).toEqual([])
  expect(
    await page.evaluate(
      (keys) => Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)])),
      Object.keys(masteryRecords),
    ),
  ).toEqual(masteryRecords)
})

async function openSection(page: Page, name: RegExp) {
  const frame = frameOf(page)
  const back = frame.getByRole('button', { name: '← Back to all challenges', exact: true })
  if (await back.isVisible()) await back.click()
  await frame.getByRole('button', { name }).click()
  return frame
}
const savedResults = (page: Page): Promise<BetaResult[]> =>
  page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([key]) => key.startsWith('family-beta-preview-results-v1:'))
      .map(([, raw]) => JSON.parse(raw)),
  )
const matchCard = (frame: FrameLocator, text: string) =>
  frame.getByRole('button', { name: `${text}. Click to hear and select.`, exact: true })

test('Spirit Realm exposes the same five direct Ninja Skills games and precisely 28 mastered words without warmups or board-game groups', async ({
  page,
}, info) => {
  const frame = await openSection(page, /Practice your Ninja Skills/)
  for (const name of gameNames) await expect(frame.getByRole('button', { name, exact: true })).toBeVisible()
  await openSection(page, /Enter the Spirit Realm/)
  await expect(frame.locator('.learning-hub-activity h3')).toHaveText(gameNames)
  await expect(frame.locator('.learning-hub-activity button')).toHaveCount(5)
  for (const name of gameNames) await expect(frame.getByRole('button', { name, exact: true })).toBeEnabled()
  await expect(frame.getByRole('button', { name: /mastery.*warm.?up|warm.?up|mastered board games/i })).toHaveCount(0)
  const visibleWords = await frame.locator('.learning-hub-word-list span').allTextContents()
  expect([...visibleWords].sort()).toEqual([...masteredWords].sort())
  expect(new Set(visibleWords).size).toBe(28)
  expect(visibleWords.some((word) => activeEight.includes(word))).toBe(false)
  await expect(frame.locator('.learning-hub-cohort-heading')).toContainText('28 mastered words')
  await page.screenshot({ path: info.outputPath('grade5-spirit-direct-games.png'), fullPage: true })
})

async function play(frame: FrameLocator, pack: LearningModulePack, page: Page, touch: boolean) {
  if (pack.moduleId === 'speed-match') {
    const first = pack.pairs[0]
    await matchCard(frame, first.left.label).click()
    await matchCard(frame, pack.pairs[1].right.label).click()
    const hint = matchCard(frame, first.right.label)
    await expect(hint).toHaveClass(/is-correction-hint/)
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    const timer = await frame.locator('.lg-moon-timer').innerText()
    await page.waitForTimeout(2200)
    await expect(hint).toHaveClass(/is-correction-hint/)
    expect(await frame.locator('.lg-moon-timer').innerText()).toBe(timer)
    await page.getByLabel('What did you see or hear?').fill('Synthetic mastered-game check. No child information.')
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await expect(hint).not.toHaveClass(/is-correction-hint/)
    await expect(matchCard(frame, pack.pairs[1].left.label)).toBeDisabled()
    await hint.click()
    for (const pair of pack.pairs.slice(1)) {
      await expect(frame.locator('.lg-shuriken-board')).not.toHaveClass(/is-correct|is-incorrect/)
      await matchCard(frame, pair.left.label).click()
      await matchCard(frame, pair.right.label).click()
    }
  } else if (pack.moduleId === 'memory-flip') {
    for (const pair of pack.pairs) {
      const left = frame.locator(`[data-card-id=${JSON.stringify(`${pair.id}:left`)}]`)
      const right = frame.locator(`[data-card-id=${JSON.stringify(`${pair.id}:right`)}]`)
      await left.click()
      await right.click()
      if (pair !== pack.pairs.at(-1)) await expect(left).toHaveClass(/is-matched/)
    }
  } else if (pack.moduleId === 'target-blast') {
    for (const [index, round] of pack.rounds.entries()) {
      await expect(frame.locator('.lg-round-label')).toHaveText(`Training strike ${index + 1} of ${pack.rounds.length}`)
      await frame.locator(`[data-choice-id=${JSON.stringify(round.correctChoiceId)}]`).click()
    }
  } else if (pack.moduleId === 'context-gap-dash') {
    for (const round of pack.rounds) {
      await expect(frame.locator('.lg-dash-context-clue strong')).toHaveText(round.cueText!, { timeout: 30000 })
      const index = round.choices.findIndex((choice) => choice.id === round.correctChoiceId)
      const choice = frame.locator(touch ? '.lg-mobile-gate-choices button' : '.lg-canvas-access button').nth(index)
      await expect(choice).toBeEnabled({ timeout: 30000 })
      if (touch) await choice.tap()
      else {
        // Use the actual accessible gate control so focus enters the iframe;
        // a key sent to an unfocused canvas can be consumed by the outer page.
        await choice.focus()
        await choice.press('Enter')
      }
    }
  } else if (pack.moduleId === 'sentence-scramble') {
    for (const [roundIndex, round] of pack.rounds.entries()) {
      await expect(frame.locator('.lg-round-label')).toHaveText(`Sentence ${roundIndex + 1} of ${pack.rounds.length}`)
      for (const [index, id] of round.correctTokenIds.entries()) {
        const token = round.tokens.find((token) => token.id === id)!
        await frame
          .locator('.lg-sushi-bar')
          .getByRole('button', {
            name: `Place ${token.label} in sentence position ${index + 1}`,
            exact: true,
          })
          .and(frame.locator('button:enabled'))
          .first()
          .click()
      }
    }
  } else throw new Error('Unexpected mastered game')
}

for (const pack of packs) {
  test(`${pack.title}: direct mastered play completes, saves only a game result, and reopens without changing mastery`, async ({
    page,
  }, info) => {
    const frame = await openSection(page, /Enter the Spirit Realm/)
    await frame.getByRole('button', { name: pack.title, exact: true }).click()
    await expect(frame.getByRole('heading', { name: pack.title, exact: true })).toBeVisible()
    await expect(frame.locator('.lg-heading')).toContainText('Grade 5 · Spirit Realm')
    await expect(frame.getByRole('button', { name: /Skip Warmup|Begin Warmup/i })).toHaveCount(0)
    expect(pool).toHaveLength(3)
    expect([...new Set(pack.cohort.terms.map((term) => term.text))].sort()).toEqual([...masteredWords].sort())
    await play(frame, pack, page, info.project.use.hasTouch === true)
    const doneName =
      pack.moduleId === 'target-blast'
        ? 'Celebrate and return'
        : pack.moduleId === 'context-gap-dash'
          ? 'Celebrate and finish'
          : 'Back to Spirit Realm'
    const done = frame.getByRole('button', { name: doneName, exact: true })
    await expect(done).toBeVisible({ timeout: 30000 })
    if (pack.moduleId === 'speed-match') {
      await frame.locator('body').evaluate(() => {
        const original = Storage.prototype.setItem
        let once = true
        Storage.prototype.setItem = function (key, value) {
          if (once && key.startsWith('family-beta-preview-results-v1:')) {
            once = false
            throw new DOMException('Synthetic completed-game storage failure', 'QuotaExceededError')
          }
          return original.call(this, key, value)
        }
      })
      await done.click()
      await expect(frame.getByRole('alert')).toContainText('could not be saved')
      await expect(done).toBeVisible()
      expect(await savedResults(page)).toEqual([])
    }
    await done.click()
    await expect(frame.getByRole('button', { name: pack.title, exact: true })).toBeVisible()
    const saved = await savedResults(page)
    const count = 'pairs' in pack ? pack.pairs.length : pack.rounds.length
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({
      childId,
      grade: 'Grade 5',
      activity: pack.title,
      channel: 'game',
      correct: count,
      attempted: count + (pack.moduleId === 'speed-match' ? 1 : 0),
    })
    expect([...saved[0].datasetIds].sort()).toEqual([...masteredIds].sort())
    expect(saved[0].datasetIds).not.toContain('grade-5__2026-27__2026-10-19__2026-10-23')
    await frame.getByRole('button', { name: pack.title, exact: true }).click()
    await expect(frame.getByRole('heading', { name: pack.title, exact: true })).toBeVisible()
    await frame.getByRole('button', { name: 'Exit learning module', exact: true }).click()
    await expect(frame.getByRole('button', { name: pack.title, exact: true })).toBeVisible()
    expect(await savedResults(page)).toEqual(saved)
    await page.reload()
    await openSection(page, /Enter the Spirit Realm/)
    await expect(frameOf(page).getByRole('button', { name: pack.title, exact: true })).toBeEnabled()
    expect(await savedResults(page)).toEqual(saved)
  })
}
