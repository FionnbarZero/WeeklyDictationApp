import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { extractGrade5Presentation } from '../../src/curriculum/adapters/grade5GoogleSlides.ts'
import { inspectSnapshot } from '../../src/familyBeta/curriculum.ts'
import { buildGrade5LearningHub } from '../../src/grade5Lab/learningHub.ts'
import { masteredDatasetsForGrade } from '../../src/grade5PresentationPreview/masteredGames.ts'
import reviewed from '../../src/grade5RecognitionReview/source.json' with { type: 'json' }
import { grade5ReadingReviewSource, READING_REVIEW_ID } from '../../src/grade5RecognitionReview/source.ts'
import { learningModuleCapability, learningModuleCohortFromDatasets } from '../../src/ninjaSkills/content.ts'
import { NINJA_SKILLS_PROFILES } from '../../src/ninjaSkills/profiles.ts'

const frame = (page: Page) => page.frameLocator('iframe:visible')
const fixture = JSON.parse(readFileSync('tests/fixtures/game-content-2026-10-26/grade5.json', 'utf8'))
const words = reviewed.targets.map((row) => row.text)
test.beforeEach(async ({ page, context }) => {
  await page.clock.setSystemTime(new Date('2026-10-26T19:00:00Z'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await context.route('**/curriculum/beta/*.json', (route) =>
    route.fulfill({
      json: JSON.parse(
        readFileSync(
          `tests/fixtures/game-content-2026-10-26/${
            route
              .request()
              .url()
              .match(/(kindergarten|grade2|grade5)\.json/)![1]
          }.json`,
          'utf8',
        ),
      ),
    }),
  )
  await context.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('playing'))
      setTimeout(() => this.dispatchEvent(new Event('ended')), 10)
      return Promise.resolve()
    }
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(new DOMException('Test denied', 'NotAllowedError')) },
    })
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
  })
})
async function open(page: Page, section: RegExp) {
  await page.goto('/family-beta-preview.html?grade=grade5')
  await frame(page).getByRole('button', { name: section }).click({ timeout: 30000 })
  await expect(page.locator('iframe:visible')).toHaveAttribute('data-family-week', '2026-10-26')
  return frame(page)
}
async function report(page: Page) {
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
}

test('all three menus use exactly the 50 PDF reading words and disable writing', async ({ page }, info) => {
  const f = await open(page, /Enter the Dojo/)
  for (const section of ['dojo', 'ninja', 'boss']) {
    await expect(f.locator('.learning-hub-word-list span')).toHaveText(words)
    await expect(f.getByRole('button', { name: 'Writing Test', exact: true })).toHaveCount(0)
    if (section === 'ninja') await f.getByRole('button', { name: 'More activities', exact: true }).click()
    if (section === 'boss') await f.getByRole('button', { name: 'Boss Test', exact: true }).click()
    await expect(f.getByRole('button', { name: 'Coming soon', exact: true })).toBeDisabled()
    await page.screenshot({ path: info.outputPath(`${section}-reading-only.png`), fullPage: true })
    if (section === 'boss') break
    await f.getByRole('button', { name: /Back to all challenges/ }).click()
    await f.getByRole('button', { name: section === 'dojo' ? /Practice.*Ninja Skills/ : /Final Boss/ }).click()
  }
})

test('Spirit Realm keeps the pre-existing mastered pool including overlap with the review', async ({ page }) => {
  const f = await open(page, /Spirit Realm/)
  const old = inspectSnapshot(fixture)
  const model = buildGrade5LearningHub(extractGrade5Presentation(fixture.payload), '2026-10-26')
  const ids = new Set(
    model.sections.find((section) => section.id === 'review')!.cohorts.map((cohort) => cohort.cohortId),
  )
  const datasets = masteredDatasetsForGrade(
    old.datasets.filter((dataset) => ids.has(dataset.id)),
    old.datasets,
    '2026-10-26',
    'Grade 5',
  )
  const expected = [
    ...new Set(
      datasets.flatMap((dataset) => [...dataset.words, ...dataset.vocabulary!.tier2].map((word) => word.text.trim())),
    ),
  ]
  await expect(f.locator('.learning-hub-word-list span')).toHaveText(expected)
  expect(expected.some((word) => words.includes(word))).toBe(true)
  await expect(f.getByRole('button', { name: 'Shuriken Match', exact: true })).toBeEnabled()
})

test('reading acquisition survives Report, Exit and reopening at its saved prompt', async ({ page }) => {
  const f = await open(page, /Enter the Dojo/)
  await f.getByRole('button', { name: 'Read the Words', exact: true }).click()
  const practice = f.locator('.reading-practice-page')
  await expect(practice).toBeVisible()
  expect(
    await practice.locator('.prompt-card').evaluate((element) => element.getBoundingClientRect().width),
  ).toBeGreaterThan(500)
  await f.getByRole('button', { name: 'Record my reading', exact: true }).click()
  await f.getByRole('button', { name: 'Continue without recording', exact: true }).click()
  await f.getByRole('button', { name: 'Yes', exact: true }).click()
  const target = await practice.getAttribute('data-report-target'),
    phase = await practice.getAttribute('data-report-phase')
  await report(page)
  await f.getByRole('button', { name: 'Exit reading', exact: true }).click()
  await page.reload()
  await frame(page)
    .getByRole('button', { name: /Enter the Dojo/ })
    .click({ timeout: 30000 })
  await frame(page).getByRole('button', { name: 'Read the Words', exact: true }).click()
  await expect(frame(page).locator('.reading-practice-page')).toHaveAttribute('data-report-target', target!)
  await expect(frame(page).locator('.reading-practice-page')).toHaveAttribute('data-report-phase', phase!)
})

test('Shuriken wrong match remains retryable, completes, saves and rotates only review words', async ({ page }) => {
  const f = await open(page, /Practice.*Ninja Skills/)
  await f.getByRole('button', { name: 'Shuriken Match', exact: true }).click()
  const board = f.locator('.lg-shuriken-board')
  await expect(board).toBeVisible()
  const first = reviewed.targets.slice(0, 8)
  const button = (text: string) => f.getByRole('button', { name: `${text}. Click to hear and select.`, exact: true })
  await button(first[0].text).click()
  await button(first[1].meaning).click()
  await expect(board).toHaveClass(/is-incorrect/)
  await report(page)
  await expect(board).not.toHaveClass(/is-correct|is-incorrect/)
  await button(first[0].meaning).click()
  for (const row of first.slice(1)) {
    await expect(board).not.toHaveClass(/is-correct|is-incorrect/)
    await button(row.text).click()
    await button(row.meaning).click()
  }
  await f.getByRole('button', { name: 'Back to Ninja Skills', exact: true }).click()
  await f.getByRole('button', { name: 'Shuriken Match', exact: true }).click()
  for (const row of reviewed.targets.slice(8, 16)) await expect(button(row.text)).toBeVisible()
  await expect(button(first[0].text)).toHaveCount(0)
  const records = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('family-beta-preview-results-v1:'))
      .map((key) => JSON.parse(localStorage.getItem(key)!)),
  )
  expect(records).toHaveLength(1)
  expect(records[0].datasetIds).toEqual([READING_REVIEW_ID])
})

for (const moduleId of ['target-blast', 'memory-flip'] as const)
  test(`${moduleId} completes its bounded reading-only round`, async ({ page }) => {
    const { dataset } = grade5ReadingReviewSource()
    const cohort = learningModuleCohortFromDatasets('recognition', 'Review', [dataset])!
    const capability = learningModuleCapability(moduleId, cohort, NINJA_SKILLS_PROFILES['Grade 5'])
    if (capability.status !== 'ready') throw new Error(capability.reason)
    const pack = capability.pack
    const f = await open(page, /Practice.*Ninja Skills/)
    await f.getByRole('button', { name: pack.title, exact: true }).click()
    if (pack.moduleId === 'target-blast') {
      for (const [i, round] of pack.rounds.entries()) {
        await expect(f.locator('.lg-round-label')).toHaveText(`Training strike ${i + 1} of ${pack.rounds.length}`)
        await f.locator(`[data-choice-id=${JSON.stringify(round.correctChoiceId)}]`).click()
      }
    } else if (pack.moduleId === 'memory-flip') {
      for (const pair of pack.pairs) {
        await f.locator(`[data-card-id=${JSON.stringify(`${pair.id}:left`)}]`).click()
        await f.locator(`[data-card-id=${JSON.stringify(`${pair.id}:right`)}]`).click()
      }
    }
    await f
      .getByRole('button', {
        name: moduleId === 'target-blast' ? 'Celebrate and return' : 'Back to Ninja Skills',
        exact: true,
      })
      .click()
    await expect(f.getByRole('button', { name: pack.title, exact: true })).toBeEnabled()
  })

test('Kindergarten and Grade 2 retain their ordinary Dojo writing and reading', async ({ page }) => {
  for (const grade of ['kindergarten', 'grade2']) {
    await page.goto(`/family-beta-preview.html?grade=${grade}`)
    const f = frame(page)
    await f.getByRole('button', { name: /Enter the Dojo/ }).click({ timeout: 30000 })
    await expect(
      f.getByRole('button', { name: grade === 'kindergarten' ? 'Writing characters' : 'Learn to Write', exact: true }),
    ).toBeEnabled()
    await expect(
      f.getByRole('button', {
        name: grade === 'kindergarten' ? 'High-frequency words' : 'Read the Words',
        exact: true,
      }),
    ).toBeEnabled()
    expect(await page.locator('iframe:visible').getAttribute('data-family-week')).not.toBe('2026-11-02')
    await expect(f.getByText('50 reading · Writing coming soon', { exact: true })).toHaveCount(0)
  }
})

for (const section of ['ninja', 'boss'])
  test(`${section}: full 50-word reading test saves once after a failure and retry`, async ({
    page,
    context,
  }, info) => {
    await context.addInitScript(() => {
      const original = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) {
        const top = window.top as Window & { failedReviewSave?: boolean }
        if (key.startsWith('family-beta-preview-results-v1:') && !top.failedReviewSave) {
          top.failedReviewSave = true
          throw new DOMException('Test full', 'QuotaExceededError')
        }
        return original.call(this, key, value)
      }
    })
    const f = await open(page, section === 'ninja' ? /Practice.*Ninja Skills/ : /Final Boss/)
    await f.getByRole('button', { name: section === 'ninja' ? 'More activities' : 'Boss Test', exact: true }).click()
    await f.getByRole('button', { name: 'Reading Test', exact: true }).click()
    for (let i = 0; i < 50; i++) {
      await expect(f.locator('.deferred-reading-word')).toHaveText(words[i])
      await f.getByRole('button', { name: 'Record my reading', exact: true }).click()
      await f.getByRole('button', { name: 'Continue without a recording', exact: true }).click()
    }
    const rows = f.locator('.deferred-review-row')
    await expect(rows).toHaveCount(50)
    expect((await rows.first().boundingBox())!.width).toBeGreaterThan(500)
    for (let i = 0; i < 50; i++)
      await rows
        .nth(i)
        .getByRole('button', { name: i === 0 ? 'Not yet' : 'Yes', exact: true })
        .click()
    await page.screenshot({ path: info.outputPath(`${section}-50-word-final-review.png`), fullPage: true })
    await f.getByRole('button', { name: 'Submit final review' }).click()
    await expect(f.getByText('Your result could not be saved.', { exact: false })).toBeVisible()
    await expect(rows).toHaveCount(50)
    await f.getByRole('button', { name: 'Submit final review' }).click()
    await expect(f.getByRole('region', { name: 'Saved Ninja Record' })).toContainText('49/50')
    await page.reload()
    await expect(frame(page).getByRole('region', { name: 'Saved Ninja Record' })).toContainText('49/50', {
      timeout: 30000,
    })
    const records = await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('family-beta-preview-results-v1:'))
        .map((key) => JSON.parse(localStorage.getItem(key)!)),
    )
    expect(records).toHaveLength(1)
    expect(records[0].datasetIds).toEqual([READING_REVIEW_ID])
  })
