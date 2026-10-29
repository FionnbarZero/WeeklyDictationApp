import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import reviewed from '../../src/grade5RecognitionReview/source.json' with { type: 'json' }

const copies = [
  { slug: 'maxton', name: 'Maxton grade 5', url: process.env.MAXTON_URL || 'http://127.0.0.1:5395' },
  { slug: 'aaron', name: 'Aaron grade 5', url: process.env.AARON_URL || 'http://127.0.0.1:5396' },
]
const home = process.env.PERSONAL_HOME_URL || 'http://127.0.0.1:5397'
const f = (page: Page) => page.frameLocator('iframe:visible')
test.beforeEach(async ({ page, context }) => {
  await page.clock.setSystemTime(new Date('2026-10-27T19:00:00Z'))
  await context.route('**/curriculum/beta/*.json', (route) =>
    route.fulfill({ json: JSON.parse(readFileSync('tests/fixtures/game-content-2026-10-26/grade5.json', 'utf8')) }),
  )
  await context.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('playing'))
      setTimeout(() => this.dispatchEvent(new Event('ended')), 10)
      return Promise.resolve()
    }
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(new DOMException('Synthetic denial', 'NotAllowedError')) },
    })
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
  })
})
for (const copy of copies) {
  test(`${copy.name}: correct name, 50 words, writing disabled in all sections`, async ({ page }) => {
    await page.goto(copy.url + '/family-beta-preview.html?grade=grade5')
    await expect(page).toHaveTitle(copy.name)
    await expect(page.locator('.beta-preview-child-label')).toHaveText(copy.name)
    await f(page)
      .getByRole('button', { name: /Enter the Dojo/ })
      .click()
    for (const section of ['dojo', 'ninja', 'boss']) {
      await expect(f(page).locator('.learning-hub-word-list span')).toHaveText(reviewed.targets.map((t) => t.text))
      if (section === 'ninja') await f(page).getByRole('button', { name: 'More activities', exact: true }).click()
      if (section === 'boss') await f(page).getByRole('button', { name: 'Boss Test', exact: true }).click()
      await expect(f(page).getByRole('button', { name: 'Coming soon', exact: true })).toBeDisabled()
      await expect(page.locator('.beta-preview-child-label')).toHaveText(copy.name)
      if (section === 'boss') break
      await f(page)
        .getByRole('button', { name: /Back to all challenges/ })
        .click()
      await f(page)
        .getByRole('button', { name: section === 'dojo' ? /Practice.*Ninja Skills/ : /Final Boss/ })
        .click()
    }
  })
  test(`${copy.name}: reading resumes after Report, Exit and reload`, async ({ page }) => {
    await page.goto(copy.url + '/family-beta-preview.html?grade=grade5')
    await f(page)
      .getByRole('button', { name: /Enter the Dojo/ })
      .click()
    await f(page).getByRole('button', { name: 'Read the Words', exact: true }).click()
    await f(page).getByRole('button', { name: 'Record my reading', exact: true }).click()
    await f(page).getByRole('button', { name: 'Continue without recording', exact: true }).click()
    await f(page).getByRole('button', { name: 'Yes', exact: true }).click()
    const p = f(page).locator('.reading-practice-page'),
      target = await p.getAttribute('data-report-target'),
      phase = await p.getAttribute('data-report-phase')
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await f(page).getByRole('button', { name: 'Exit reading', exact: true }).click()
    await page.reload()
    await f(page)
      .getByRole('button', { name: /Enter the Dojo/ })
      .click()
    await f(page).getByRole('button', { name: 'Read the Words', exact: true }).click()
    await expect(p).toHaveAttribute('data-report-target', target!)
    await expect(p).toHaveAttribute('data-report-phase', phase!)
    await expect(page.locator('.beta-preview-child-label')).toHaveText(copy.name)
  })
}
test('Maxton score persists while Aaron starts with separate progress', async ({ page }) => {
  await page.goto(copies[0].url + '/family-beta-preview.html?grade=grade5')
  await f(page)
    .getByRole('button', { name: /Final Boss/ })
    .click()
  await f(page).getByRole('button', { name: 'Boss Test', exact: true }).click()
  await f(page).getByRole('button', { name: 'Reading Test', exact: true }).click()
  for (let i = 0; i < 50; i++) {
    await expect(f(page).locator('.deferred-reading-word')).toHaveText(reviewed.targets[i].text)
    await f(page).getByRole('button', { name: 'Record my reading', exact: true }).click()
    await f(page).getByRole('button', { name: 'Continue without a recording', exact: true }).click()
  }
  const rows = f(page).locator('.deferred-review-row')
  await expect(rows).toHaveCount(50)
  for (let i = 0; i < 50; i++) await rows.nth(i).getByRole('button', { name: 'Yes', exact: true }).click()
  await f(page).getByRole('button', { name: 'Submit final review', exact: true }).click()
  await expect(f(page).getByRole('region', { name: 'Saved Ninja Record' })).toContainText('50/50')
  await page.goto(copies[1].url + '/family-beta-preview.html?grade=grade5')
  await expect(page.locator('.beta-preview-child-label')).toHaveText(copies[1].name)
  expect(
    await page.evaluate(
      () => Object.keys(localStorage).filter((k) => k.startsWith('family-beta-preview-results-v1:')).length,
    ),
  ).toBe(0)
  await page.goto(copies[0].url + '/family-beta-preview.html?grade=grade5')
  await expect(f(page).getByRole('region', { name: 'Saved Ninja Record' })).toContainText('50/50')
})
test('homepage preserves all eight existing cards and adds both named copies', async ({ page }) => {
  await page.goto(home)
  const cards = page.locator('.project-card')
  await expect(cards).toHaveCount(10)
  await expect(cards.locator('h3')).toHaveText([
    'EduGames',
    'Ninja Dojo',
    'Stroke-order Slay',
    'SpellCraft',
    'KinderSpell Quest',
    '2nd Grade SpellQuest',
    'FionnQuest',
    '5th grade Dojo',
    'Maxton grade 5',
    'Aaron grade 5',
  ])
  for (const c of copies) {
    const card = page.getByRole('link', { name: `Explore ${c.name}`, exact: true })
    await expect(card).toHaveAttribute('href', `https://${c.slug}grade5.meghangames.com/`)
    await card.scrollIntoViewIfNeeded()
    expect((await card.boundingBox())!.height).toBeGreaterThan(48)
    await expect(card.locator('img')).toBeVisible()
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    await page
      .locator('img')
      .evaluateAll((images) =>
        images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0),
      ),
  ).toBe(true)
})
