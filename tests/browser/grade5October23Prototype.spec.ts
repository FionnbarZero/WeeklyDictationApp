import { expect, type Page, test } from '@playwright/test'
import { strokeOrderGuide } from '../../src/familyBeta/strokeOrderSlay.ts'
import { TARGETS, WRITING_KEY } from '../../src/grade5Oct23Prototype/content.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'

const sections = ['Practice Your Ninja Skills', 'Final Boss Test'] as const
const browserErrors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page, baseURL }) => {
  const errors: string[] = []
  browserErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
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
        speak(u: SpeechSynthesisUtterance) {
          u.onstart?.({} as SpeechSynthesisEvent)
          setTimeout(() => u.onend?.({} as SpeechSynthesisEvent), 5)
        },
      },
    })
    HTMLMediaElement.prototype.play = () => Promise.reject(new Error('Synthetic media fallback'))
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException('Synthetic microphone refusal', 'NotAllowedError')
        },
      },
    })
  })
  await page.goto('/grade5-oct23-preview.html')
})
test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page)).toEqual([])
})
async function open(page: Page, activity: string, section: string = sections[0]) {
  await page
    .getByRole('region', { name: section, exact: true })
    .getByRole('button', { name: activity, exact: true })
    .click()
}
function card(page: Page, label: string) {
  return page.getByRole('button', { name: `${label}. Click to hear and select.`, exact: true })
}

test('both menus expose the same eight targets and verified prototype identity', async ({ page }, info) => {
  await expect(page.getByRole('heading', { name: '10/19 – Fifth Grade Mandarin Ninja Academy', exact: true })).toBeVisible()
  await expect(page.locator('.oct23-targets')).toHaveText(TARGETS.map((t) => t.text).join(' · '))
  for (const section of sections)
    await expect(page.getByRole('region', { name: section }).getByRole('button')).toHaveCount(6)
  if (process.env.OCT23_REVISION)
    await expect(page.locator('.cross-grade-banner')).toContainText(process.env.OCT23_REVISION.slice(0, 7))
  await page.screenshot({ path: info.outputPath('menu.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('Shuriken green hint pauses, hides, retries same match, retains errors and completes repeatedly', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await open(page, 'Shuriken Match')
  await expect(page.locator('.lg-word-seal')).toHaveCount(16)
  await card(page, TARGETS[0].text).click()
  await card(page, TARGETS[1].meaning).click()
  const hint = card(page, TARGETS[0].meaning)
  await expect(hint).toHaveClass(/is-correction-hint/)
  await expect(card(page, TARGETS[1].meaning)).not.toHaveClass(/is-correction-hint/)
  await page.screenshot({ path: info.outputPath('shuriken-green-hint.png'), fullPage: true })
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  const timer = await page.locator('.lg-moon-timer').innerText()
  await page.waitForTimeout(2200)
  await expect(hint).toHaveClass(/is-correction-hint/)
  expect(await page.locator('.lg-moon-timer').innerText()).toBe(timer)
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  await expect(hint).not.toHaveClass(/is-correction-hint/)
  await expect(hint).toBeEnabled()
  await expect(card(page, TARGETS[1].text)).toBeDisabled()
  await expect(card(page, TARGETS[0].text)).toHaveClass(/is-selected/)
  await page.screenshot({ path: info.outputPath('shuriken-retry.png'), fullPage: true })
  await card(page, TARGETS[2].meaning).click()
  await expect(hint).toHaveClass(/is-correction-hint/)
  await expect(hint).toBeEnabled()
  await hint.click()
  await expect(card(page, TARGETS[0].text)).toHaveClass(/is-matched/)
  await expect(page.locator('.lg-shuriken-stat-row')).toContainText('33%')
  for (const target of TARGETS.slice(1)) {
    // Finish the brief feedback animation before WebKit scrolls to another row.
    await expect(page.locator('.lg-shuriken-board')).not.toHaveClass(/is-correct|is-incorrect/)
    await expect(card(page, target.text)).toBeEnabled()
    await card(page, target.text).click()
    await card(page, target.meaning).click()
    await expect(card(page, target.text)).toHaveClass(/is-matched/)
  }
  await page.getByRole('button', { name: 'Back to Ninja Skills', exact: true }).click()
  await expect(page.getByText('Shuriken: 8 correct of 10 attempts. Retries retain earlier errors.')).toBeVisible()
  await open(page, 'Shuriken Match', sections[1])
  await card(page, TARGETS[1].meaning).click()
  await card(page, TARGETS[0].text).click()
  await expect(card(page, TARGETS[1].text)).toHaveClass(/is-correction-hint/)
  await page.getByRole('button', { name: 'Exit learning module', exact: true }).click()
  await expect(page.locator('.oct23-menu')).toBeVisible()
  expect(errors).toEqual([])
})

test('Sushi retries an error then finishes all eight exact reference sentences', async ({ page }, info) => {
  await open(page, 'Sushi Scramble')
  const place = (label: string) =>
    page.getByRole('button', { name: new RegExp(`^Place ${label} in sentence position`) })
  for (const token of [...TARGETS[0].tokens].reverse()) await place(token).click()
  await expect(page.getByText('That order needs another try.')).toBeVisible()
  await expect(page.getByText('Sentence 1 of 8', { exact: true })).toBeVisible()
  for (const [index, target] of TARGETS.entries()) {
    await expect(page.getByText(`Sentence ${index + 1} of 8`, { exact: true })).toBeVisible()
    for (const token of target.tokens) await place(token).click()
    await expect(page.getByText('Perfect order!', { exact: true })).toBeVisible()
    if (index === 1) await page.screenshot({ path: info.outputPath('sushi.png'), fullPage: true })
  }
  await page.getByRole('button', { name: 'Back to Ninja Skills', exact: true }).click()
  await expect(page.getByText('Sushi: 8 correct of 9 attempts.')).toBeVisible()
})

for (const section of sections)
  for (const mode of ['Writing', 'Reading'] as const) {
    test(`${section}: ${mode} collects all eight before final review`, async ({ page }) => {
      await open(page, `${mode} Test · all 8 targets`, section)
      for (const [index, target] of TARGETS.entries()) {
        await expect(page.locator('.deferred-collection-review')).toHaveAttribute(
          'data-report-position',
          String(index + 1),
        )
        await expect(page.getByRole('button', { name: 'Yes', exact: true })).toHaveCount(0)
        if (mode === 'Writing') await page.getByRole('button', { name: 'Skip Timer', exact: true }).click()
        else {
          await expect(page.locator('.deferred-collection-review')).toContainText(target.text)
          await page.getByRole('button', { name: 'Record my reading', exact: true }).click()
          await page.getByRole('button', { name: 'Continue without a recording', exact: true }).click()
        }
      }
      const rows = page.locator('.deferred-review-row')
      await expect(rows).toHaveCount(8)
      for (const [index, target] of TARGETS.entries()) {
        await expect(rows.nth(index)).toContainText(target.text)
        await rows
          .nth(index)
          .getByRole('button', { name: index % 2 ? 'Not yet' : 'Yes', exact: true })
          .click()
      }
      await page.getByRole('button', { name: 'Submit final review', exact: true }).click()
      await expect(page.getByText(`${mode}: 4/8. No family score was saved.`)).toBeVisible()
      expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('family-beta-')))).toEqual(
        [],
      )
    })
  }

async function draw(page: Page, character: string) {
  const strokes = strokeOrderGuide({ id: 'grade5-oct23-test', text: character }).strokes
  const layout = getStrokeLayout(strokes)
  const pad = page.getByRole('region', { name: 'Stroke order teacher' }).locator('svg[role="application"]')
  await pad.scrollIntoViewIfNeeded()
  for (let i = Number(await pad.getAttribute('data-next-stroke')); i < strokes.length; i++) {
    const b = (await pad.boundingBox())!
    const xy = (p: readonly [number, number]) =>
      [
        b.x + ((p[0] * layout.scale + layout.offsetX) * b.width) / 100,
        b.y + ((p[1] * layout.scale + layout.offsetY) * b.height) / 100,
      ] as const
    await page.mouse.move(...xy(strokes[i][0]))
    await page.mouse.down()
    for (const point of strokes[i].slice(1)) await page.mouse.move(...xy(point))
    await page.mouse.up()
    await expect(pad).toHaveAttribute('data-next-stroke', String(i + 1))
  }
}
test('writing teaches both characters, resumes across menus, follows native acquisition and starts next word teaching', async ({
  page,
}, info) => {
  test.setTimeout(300000)
  await open(page, 'Return to Dojo · Writing')
  const teacher = page.getByRole('region', { name: 'Stroke order teacher' })
  for (const [index, character] of [...TARGETS[0].text].entries())
    for (let step = 1; step <= 5; step++) {
      await expect(teacher).toHaveAttribute('data-character-index', String(index))
      await expect(teacher).toHaveAttribute('data-step', String(step))
      if (index === 0 && step === 2) {
        await page.getByRole('button', { name: 'Exit game', exact: true }).click()
        await page.reload()
        await open(page, 'Return to Dojo · Writing', sections[1])
        await expect(teacher).toHaveAttribute('data-step', '2')
        await expect(teacher.locator('svg[role="application"]')).toHaveAttribute('data-next-stroke', '0')
      }
      await draw(page, character)
      await page.getByRole('button', { name: step === 5 ? 'Compare' : 'Next step', exact: true }).click()
      if (step === 5) await page.getByRole('button', { name: 'I slayed it', exact: true }).click()
    }
  const skip = page.getByRole('button', { name: 'Skip Timer', exact: true })
  const correct = page.getByRole('button', { name: 'I got it right', exact: true })
  for (const kind of ['familiar-dt', 'familiar-dt', 'show-copy', 'target']) {
    expect(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).acquisition.flow.prompt.kind, WRITING_KEY),
    ).toBe(kind)
    if (kind === 'show-copy') await page.screenshot({ path: info.outputPath('writing.png'), fullPage: true })
    await skip.click()
    await correct.click()
    await expect(skip.or(teacher)).toBeVisible()
  }
  for (let i = 0; i < 35 && !(await teacher.isVisible()); i++) {
    if (await skip.isVisible()) await skip.click()
    await correct.click()
    await expect(skip.or(teacher)).toBeVisible()
  }
  await expect(teacher).toHaveAttribute('data-step', '1')
  await expect(teacher).toHaveAttribute('data-character-index', '0')
  await expect(page.locator('.lg-vocabulary-main')).toContainText('了解')
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await page.waitForTimeout(8000)
  await expect(page.locator('.lg-vocabulary-main')).toBeVisible()
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  await page.getByRole('button', { name: 'Exit game', exact: true }).click()
  await open(page, 'Return to Dojo · Writing')
  await expect(page.locator('.lg-vocabulary-main')).toContainText('了解')
})

test('both reading Dojo entries open and exit without account or stuck report state', async ({ page }) => {
  for (const section of sections) {
    await open(page, 'Return to Dojo · Reading', section)
    await expect(page.getByText('Return to Dojo · Reading · October 23 shared targets')).toBeVisible()
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await page.getByRole('button', { name: /Exit/ }).first().click()
    await expect(page.locator('.oct23-menu')).toBeVisible()
  }
})
