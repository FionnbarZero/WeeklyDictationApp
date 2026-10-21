import { readFileSync } from 'node:fs'
import { expect, type FrameLocator, type Locator, type Page, test } from '@playwright/test'
import { datasetFromCanonicalCandidate } from '../../src/curriculum/datasetProjection.ts'
import type { BetaResult } from '../../src/familyBeta/model.ts'
import {
  buildGrade5AssessmentPayload,
  extractGrade5Assessment,
} from '../../src/grade5PresentationPreview/assessmentSource.ts'
import { grade5AssessmentGames } from '../../src/grade5PresentationPreview/games.ts'
import type { LearningModulePack } from '../../src/ninjaSkills/contracts.ts'

// Independent approved page-2 membership. Pack helpers provide opaque prompt
// IDs and deterministic ordering, never the expected vocabulary or round bound.
const words = ['或者', '了解', '完', '兴奋的', '告诉', '沟通', '快速地', '有意思']
const datasetId = 'grade-5__2026-27__2026-10-19__2026-10-23'
const childId = 'preview-2'
const gameNames = ['Shuriken Match', 'Shadow Strike Dojo', 'Memory Lanterns', 'Context Gap Dash', 'Sushi Scramble']
const baseline = JSON.parse(
  readFileSync(new URL('../fixtures/dojo-launch-2026-10-16/grade5.json', import.meta.url), 'utf8'),
)
const source = extractGrade5Assessment(buildGrade5AssessmentPayload(baseline.payload))
const datasets = source.classification.selectedCandidates
  .filter((candidate) => candidate.status === 'valid' && candidate.datasetId === datasetId)
  .map((candidate) => {
    const dataset = datasetFromCanonicalCandidate(candidate)
    // Node has no Vite preview flag. Supply the approved source metadata to this
    // expected-pack fixture only; browser data and runtime state are untouched.
    for (const tier of ['tier1', 'tier2'] as const)
      dataset.vocabulary![tier].forEach((word, index) => {
        word.learningModule = structuredClone(candidate[tier][index].learningModule)
        word.sentence = word.learningModule?.context?.sentence || ''
      })
    return dataset
  })
const sourcePacks = grade5AssessmentGames(datasets, [], childId).flatMap(({ capability }) =>
  capability.status === 'ready' ? [capability.pack] : [],
)
// Shuriken's shared-reading/writing exception also has a browser-build guard.
// Its real UI is driven by source labels, independently checked below, so this
// expected input fixture needs no flag mutation or runtime-pack injection.
const shuriken: LearningModulePack = {
  moduleId: 'speed-match',
  title: 'Shuriken Match',
  cohort: sourcePacks[0].cohort,
  pairs: datasets[0].vocabulary!.tier1.map((word) => ({
    id: `meaning:${word.id}`,
    targetId: word.id,
    left: { id: `choice:${word.id}`, label: word.text },
    right: { id: `meaning:${word.id}:answer`, label: word.learningModule!.meaning! },
  })),
}
const packs = [shuriken, ...sourcePacks]
expect(datasets).toHaveLength(1)
expect(packs.map((pack) => pack.title)).toEqual(gameNames)
for (const pack of packs) {
  expect([...new Set(pack.cohort.terms.map((term) => term.text))].sort()).toEqual([...words].sort())
  expect(pack.cohort.provenance.map((entry) => entry.datasetId)).toEqual([datasetId])
  const items = 'pairs' in pack ? pack.pairs : pack.rounds
  const targetTexts = items.map((item) => pack.cohort.terms.find((term) => term.occurrenceId === item.targetId)!.text)
  expect(targetTexts).toHaveLength(pack.moduleId === 'target-blast' ? 6 : 8)
  expect(new Set(targetTexts).size).toBe(targetTexts.length)
  expect(targetTexts.every((text) => words.includes(text))).toBe(true)
}

const errorsByPage = new WeakMap<Page, string[]>()
const frameOf = (page: Page) => page.frameLocator('iframe:visible')
const savedResults = (page: Page): Promise<BetaResult[]> =>
  page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([key]) => key.startsWith('family-beta-preview-results-v1:'))
      .map(([, raw]) => JSON.parse(raw)),
  )

test.beforeEach(async ({ page, baseURL }) => {
  const errors: string[] = []
  errorsByPage.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // Phaser uses Date.now() for gate movement, so keep the date deterministic
  // without freezing elapsed time or overriding the game's feedback clocks.
  await page.clock.setSystemTime(new Date('2026-10-21T19:00:00Z'))
  const origin = new URL(baseURL!).origin
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
  )
  await page.addInitScript(() => {
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
  })
  await page.goto('/family-beta-preview.html?grade=grade5')
  await expect(frameOf(page).getByRole('button', { name: /Practice your Ninja Skills/ })).toBeVisible()
})

test.afterEach(async ({ page }) => expect(errorsByPage.get(page)).toEqual([]))

const sections = [
  {
    name: 'Ninja Skills',
    menu: /Practice your Ninja Skills/,
    heading: 'Practice your Ninja Skills',
    destination: 'Ninja Skills',
  },
  { name: 'Boss Games', menu: /Final Boss/, heading: 'Boss Games', destination: 'Boss Games' },
] as const
type Section = (typeof sections)[number]

async function enterGames(page: Page, section: Section) {
  const frame = frameOf(page)
  await frame.getByRole('button', { name: section.menu }).click()
  if (section.name === 'Boss Games') await frame.getByRole('button', { name: 'Boss Games', exact: true }).click()
  await expect(frame.locator('.learning-hub-activity-grid button')).toHaveText(
    section.name === 'Boss Games' ? gameNames : [...gameNames, 'More activities'],
  )
  return frame
}

async function openReport(page: Page) {
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await page.getByLabel('What did you see or hear?').fill('Synthetic Grade 5 game audit. No child information.')
}

async function closeReport(page: Page) {
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
}

const pairCard = (frame: FrameLocator, text: string) =>
  frame.getByRole('button', { name: `${text}. Click to hear and select.`, exact: true })
const memoryCard = (frame: FrameLocator, pairId: string, side: 'left' | 'right') =>
  frame.locator(`[data-card-id=${JSON.stringify(`${pairId}:${side}`)}]`)
const strikeChoice = (frame: FrameLocator, choiceId: string) =>
  frame.locator(`[data-choice-id=${JSON.stringify(choiceId)}]`)

async function chooseGate(choice: Locator, touch: boolean) {
  await expect(choice).toBeEnabled({ timeout: 30000 })
  if (touch) await choice.tap()
  else {
    // The supported accessible gate receives real keyboard input in its iframe.
    await choice.focus()
    await choice.press('Enter')
  }
}

async function play(frame: FrameLocator, pack: LearningModulePack, page: Page, touch: boolean) {
  if (pack.moduleId === 'speed-match') {
    await expect(frame.locator('.lg-word-seal')).toHaveCount(16)
    for (const pair of pack.pairs) {
      await expect(frame.locator('.lg-shuriken-board')).not.toHaveClass(/is-correct|is-incorrect/)
      await pairCard(frame, pair.left.label).click()
      await pairCard(frame, pair.right.label).click()
    }
    return { correct: 8, attempted: 8 }
  }
  if (pack.moduleId === 'memory-flip') {
    await expect(frame.locator('.lg-memory-card')).toHaveCount(16)
    const first = memoryCard(frame, pack.pairs[0].id, 'left')
    const different = memoryCard(frame, pack.pairs[1].id, 'right')
    await first.click()
    await different.click()
    await expect(frame.locator('.lg-feedback.is-incorrect')).toContainText('Keep their places in mind.')
    await openReport(page)
    await page.waitForTimeout(1800)
    await expect(first).toHaveClass(/is-visible/)
    await expect(different).toHaveClass(/is-visible/)
    await expect(frame.locator('.lg-memory-card.is-matched')).toHaveCount(0)
    await closeReport(page)
    await expect(first).not.toHaveClass(/is-visible/)
    await expect(different).not.toHaveClass(/is-visible/)
    for (const pair of pack.pairs) {
      const left = memoryCard(frame, pair.id, 'left')
      await left.click()
      await memoryCard(frame, pair.id, 'right').click()
      if (pair !== pack.pairs.at(-1)) await expect(left).toHaveClass(/is-matched/)
    }
    return { correct: 8, attempted: 9 }
  }
  if (pack.moduleId === 'target-blast') {
    const first = pack.rounds[0]
    const wrong = first.choices.find((choice) => choice.id !== first.correctChoiceId)!
    await strikeChoice(frame, wrong.id).click()
    await openReport(page)
    const frozenPhase = await frame.locator('.lg-target-blast-playfield').getAttribute('class')
    await page.waitForTimeout(2300)
    await expect(frame.locator('.lg-round-label')).toHaveText('Training strike 1 of 6')
    await expect(frame.locator('.lg-target-blast-playfield')).toHaveAttribute('class', frozenPhase!)
    await closeReport(page)
    await expect(frame.locator('.lg-feedback.is-incorrect')).toContainText(
      `Correct target: ${first.choices.find((choice) => choice.id === first.correctChoiceId)!.label}`,
    )
    for (const [index, round] of pack.rounds.entries()) {
      await expect(frame.locator('.lg-round-label')).toHaveText(`Training strike ${index + 1} of 6`)
      await strikeChoice(frame, round.correctChoiceId).click()
    }
    return { correct: 6, attempted: 7 }
  }
  if (pack.moduleId === 'context-gap-dash') {
    for (const [roundIndex, round] of pack.rounds.entries()) {
      await expect(frame.locator('.lg-dash-context-clue strong')).toHaveText(round.cueText!, { timeout: 30000 })
      const index = round.choices.findIndex((choice) =>
        roundIndex === 0 ? choice.id !== round.correctChoiceId : choice.id === round.correctChoiceId,
      )
      const choice = frame.locator(touch ? '.lg-mobile-gate-choices button' : '.lg-canvas-access button').nth(index)
      await chooseGate(choice, touch)
      if (roundIndex === 0) {
        const feedback = frame.locator(touch ? '.lg-mobile-feedback' : '.lg-canvas-access [role=status]')
        await expect(feedback).toContainText('Barrier hit. The safe gate is highlighted')
        await openReport(page)
        await page.waitForTimeout(2300)
        await expect(feedback).toContainText('Barrier hit. The safe gate is highlighted')
        await expect(frame.locator('.lg-dash-context-clue strong')).toHaveText(round.cueText!)
        await expect(choice).toBeDisabled()
        await closeReport(page)
      }
    }
    // A missed gate demonstrates the answer and advances; unlike Shadow Strike,
    // it must remain recorded as a first-try miss, not silently become correct.
    return { correct: 7, attempted: 8 }
  }
  if (pack.moduleId === 'sentence-scramble') {
    for (const [roundIndex, round] of pack.rounds.entries()) {
      await expect(frame.locator('.lg-round-label')).toHaveText(`Sentence ${roundIndex + 1} of 8`)
      for (const [position, id] of round.correctTokenIds.entries()) {
        const token = round.tokens.find((token) => token.id === id)!
        await frame
          .locator('.lg-sushi-bar')
          .getByRole('button', { name: `Place ${token.label} in sentence position ${position + 1}`, exact: true })
          .and(frame.locator('button:enabled'))
          .first()
          .click()
      }
    }
    return { correct: 8, attempted: 8 }
  }
  throw new Error(`Unexpected Grade 5 game: ${pack.moduleId}`)
}

for (const section of sections) {
  for (const pack of packs) {
    test(`${section.name}: ${pack.title} completes the correct word set, recovers saving, returns and reopens without duplicate results`, async ({
      page,
    }, info) => {
      const frame = await enterGames(page, section)
      await frame.getByRole('button', { name: pack.title, exact: true }).click()
      await expect(frame.getByRole('heading', { name: pack.title, exact: true })).toBeVisible()
      await expect(frame.locator('.lg-heading')).toContainText(`Grade 5 · ${section.heading}`)
      const expectedScore = await play(frame, pack, page, info.project.use.hasTouch === true)
      const doneName =
        pack.moduleId === 'target-blast'
          ? 'Celebrate and return'
          : pack.moduleId === 'context-gap-dash'
            ? 'Celebrate and finish'
            : `Back to ${section.destination}`
      const done = frame.getByRole('button', { name: doneName, exact: true })
      await expect(done).toBeVisible({ timeout: 30000 })
      expect(await savedResults(page)).toEqual([])
      // Reject exactly one completed-result write, never edit a result or game
      // state. The actual completion control must preserve and retry the score.
      await frame.locator('body').evaluate(() => {
        const original = Storage.prototype.setItem
        let once = true
        Storage.prototype.setItem = function (key, value) {
          if (once && key.startsWith('family-beta-preview-results-v1:')) {
            once = false
            throw new DOMException('Synthetic Grade 5 audit storage failure', 'QuotaExceededError')
          }
          return original.call(this, key, value)
        }
      })
      await done.click()
      await expect(frame.getByRole('alert')).toContainText('could not be saved')
      await expect(done).toBeVisible()
      expect(await savedResults(page)).toEqual([])
      await done.click()
      const expectedMenu = section.name === 'Boss Games' ? gameNames : [...gameNames, 'More activities']
      await expect(frame.locator('.learning-hub-activity-grid button')).toHaveText(expectedMenu)
      const saved = await savedResults(page)
      expect(saved).toHaveLength(1)
      expect(saved[0]).toMatchObject({
        childId,
        grade: 'Grade 5',
        activity: pack.title,
        channel: 'game',
        datasetIds: [datasetId],
        ...expectedScore,
      })
      await frame.getByRole('button', { name: pack.title, exact: true }).click()
      await expect(frame.getByRole('heading', { name: pack.title, exact: true })).toBeVisible()
      await frame.getByRole('button', { name: 'Exit learning module', exact: true }).click()
      await expect(frame.locator('.learning-hub-activity-grid button')).toHaveText(expectedMenu)
      expect(await savedResults(page)).toEqual(saved)
      if (section.name === 'Boss Games') {
        await frame.getByRole('button', { name: '← Back to Final Boss', exact: true }).click()
        await expect(frame.locator('.learning-hub-activity-grid button')).toHaveText([
          'Boss Test',
          'Boss Games',
          'Need more training?',
        ])
      }
      await page.reload()
      await enterGames(page, section)
      await expect(frameOf(page).getByRole('button', { name: pack.title, exact: true })).toBeEnabled()
      expect(await savedResults(page)).toEqual(saved)
    })
  }
}
