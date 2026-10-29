import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { writingCharacterGuides } from '../../src/application/writingAcquisition/lesson.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'

const frame = (page: Page) => page.frameLocator('iframe:visible')
const errors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page, context }) => {
  errors.set(page, [])
  page.on('pageerror', (e) => errors.get(page)!.push(e.message))
  await page.clock.setSystemTime(new Date('2026-10-26T19:00:00Z'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await context.route('**/curriculum/beta/*.json', (route) => {
    const slug = route
      .request()
      .url()
      .match(/(kindergarten|grade2|grade5)\.json/)![1]
    return route.fulfill({
      json: JSON.parse(readFileSync(`tests/fixtures/game-content-2026-10-26/${slug}.json`, 'utf8')),
    })
  })
  await context.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('playing'))
      setTimeout(() => this.dispatchEvent(new Event('ended')), 10)
      return Promise.resolve()
    }
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
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([])
})
async function open(page: Page, grade: string, section: RegExp) {
  await page.goto(`./family-beta-preview.html?grade=${grade}`)
  await frame(page).getByRole('button', { name: section }).first().click({ timeout: 30000 })
  return frame(page)
}
async function report(page: Page) {
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
}
for (const grade of ['kindergarten', 'grade2', 'grade5']) {
  test(`${grade}: writing test collects all responses, saves only at final review, then survives reload`, async ({
    page,
  }, info) => {
    const f = await open(page, grade, /Final Boss/)
    await expect(f.getByRole('button', { name: 'Reading Test', exact: true })).toBeEnabled()
    await expect(f.getByRole('button', { name: 'Re-enter the Dojo', exact: true })).toBeVisible()
    await f.getByRole('button', { name: 'Writing Test', exact: true }).click()
    await expect(f.locator('.report-writing-collector')).toBeVisible()
    await expect(f.getByRole('button', { name: /Warmup/ })).toHaveCount(0)
    const pad = f.locator('.skywriting-pad').first()
    await expect(pad).toBeVisible()
    const b = (await pad.boundingBox())!
    expect(Math.min(b.width, b.height)).toBeGreaterThan(200)
    const typed = (await f.locator('.skywriting-keyboard-alternative').boundingBox())!
    expect(b.y + b.height).toBeLessThanOrEqual(typed.y + 1)
    await page.mouse.move(b.x + b.width * 0.25, b.y + b.height * 0.3)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.65)
    await page.mouse.up()
    await expect(f.locator('.skywriting-stroke').first()).toHaveCSS('stroke-width', '7px')
    await report(page)
    await page.screenshot({ path: info.outputPath(`${grade}-final-writing.png`) })
    let count = 0
    while (await f.locator('.report-writing-collector').count()) {
      await expect(f.getByRole('button', { name: 'Yes', exact: true })).toHaveCount(0)
      await expect(f.getByRole('button', { name: 'Skip Timer', exact: true })).toBeEnabled({ timeout: 20000 })
      await f.getByRole('button', { name: 'Skip Timer', exact: true }).click()
      count++
      expect(count).toBeLessThan(80)
    }
    const rows = f.locator('.deferred-review-row')
    await expect(rows).toHaveCount(count)
    await expect(rows.first().locator('.skywriting-stroke')).toHaveCount(1)
    await expect(f.getByRole('button', { name: 'Submit final review' })).toBeDisabled()
    const records = () =>
      page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('family-beta-preview-results-v1:')))
    expect(await records()).toEqual([])
    for (let i = 0; i < count; i++) await rows.nth(i).getByRole('button', { name: 'Yes', exact: true }).click()
    await f.getByRole('button', { name: 'Submit final review' }).click()
    await expect(f.getByRole('region', { name: 'Saved Ninja Record' })).toContainText(
      `Final Boss Writing Test · ${count}/${count}`,
    )
    await page.reload()
    await expect(frame(page).getByRole('region', { name: 'Saved Ninja Record' })).toContainText(
      `Final Boss Writing Test · ${count}/${count}`,
      { timeout: 30000 },
    )
  })
  test(`${grade}: reentry has two choices and writing starts the five-step teacher; Spirit Realm has direct games`, async ({
    page,
  }) => {
    const f = await open(page, grade, /Final Boss/)
    await f.getByRole('button', { name: 'Re-enter the Dojo', exact: true }).click()
    await expect(f.getByRole('button', { name: 'Reenter the Dojo · reading', exact: true })).toBeVisible()
    await f.getByRole('button', { name: 'Reenter the Dojo · writing', exact: true }).click()
    await expect(f.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '1')
    await report(page)
    await f.getByRole('button', { name: /^Exit( game| learning module)?$/ }).click()
    await f.getByRole('button', { name: '← Back to all challenges', exact: true }).click()
    await f.getByRole('button', { name: /Enter the Spirit Realm/ }).click()
    await expect(f.getByRole('button', { name: /mastered-word games|mastery warmup/i })).toHaveCount(0)
    await expect(f.getByRole('button', { name: 'Shuriken Match', exact: true })).toBeEnabled()
  })
}
test('Grade 2 maintenance chooses another set on every entrance, including unfinished exits', async ({ page }) => {
  const f = await open(page, 'grade2', /Enter the Spirit Realm/)
  const sets: string[][] = []
  for (let i = 0; i < 3; i++) {
    await f.getByRole('button', { name: 'Shuriken Match', exact: true }).click()
    await expect(f.locator('.lg-speed-card')).toBeVisible()
    sets.push((await f.locator('.lg-word-seal.is-word span[lang]').allTextContents()).sort())
    await report(page)
    await f.getByRole('button', { name: /^Exit( game| learning module)?$/ }).click()
  }
  expect(sets[0].length).toBeGreaterThan(1)
  expect(sets[1]).not.toEqual(sets[0])
  expect(sets[2]).not.toEqual(sets[1])
  const values = await page.evaluate(() =>
    Object.entries(localStorage).filter(([k]) => k.startsWith('maintenance-entrances-v1:')),
  )
  expect(values).toHaveLength(1)
  expect(values[0][1]).toBe('3')
})
test('Lantern words remain centered after repeated flips', async ({ page }) => {
  const f = await open(page, 'grade2', /Practice.*Ninja Skills/i)
  await f.getByRole('button', { name: 'Memory Lanterns', exact: true }).click()
  const cards = f.locator('.lg-lantern-card')
  for (let i = 0; i < 2; i++) {
    await cards.nth(i).click()
    await expect
      .poll(async () =>
        cards.nth(i).evaluate((card) => {
          const face = card.querySelector('.lg-card-face')!.getBoundingClientRect(),
            text = card.querySelector('.lg-card-face b')!.getBoundingClientRect()
          return Math.max(
            Math.abs(face.x + face.width / 2 - text.x - text.width / 2),
            Math.abs(face.y + face.height / 2 - text.y - text.height / 2),
          )
        }),
      )
      .toBeLessThan(3)
  }
})

for (const grade of ['kindergarten', 'grade2', 'grade5']) {
  test(`${grade}: Reading Test saves once after a storage failure and retry`, async ({ page, context }) => {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: () => Promise.reject(new DOMException('test denied', 'NotAllowedError')) },
      })
      const original = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) {
        if (
          key.startsWith('family-beta-preview-results-v1:') &&
          !(window.top as Window & { savedFailure?: boolean }).savedFailure
        ) {
          ;(window.top as Window & { savedFailure?: boolean }).savedFailure = true
          throw new DOMException('Test full', 'QuotaExceededError')
        }
        return original.call(this, key, value)
      }
    })
    const f = await open(page, grade, /Final Boss/)
    await f.getByRole('button', { name: 'Reading Test', exact: true }).click()
    await expect(f.locator('.deferred-reading-collector')).toBeVisible()
    let count = 0
    while (await f.locator('.deferred-reading-collector').count()) {
      const record = f.getByRole('button', { name: 'Record my reading', exact: true })
      if (await record.isVisible()) await record.click()
      await f.getByRole('button', { name: 'Continue without a recording', exact: true }).click()
      count++
      expect(count).toBeLessThan(80)
    }
    const rows = f.locator('.deferred-review-row')
    await expect(rows).toHaveCount(count)
    for (let i = 0; i < count; i++)
      await rows
        .nth(i)
        .getByRole('button', { name: i === 0 ? 'Not yet' : 'Yes', exact: true })
        .click()
    await f.getByRole('button', { name: 'Submit final review' }).click()
    await expect(f.getByText('Your result could not be saved.', { exact: false })).toBeVisible()
    await expect(rows).toHaveCount(count)
    await f.getByRole('button', { name: 'Submit final review' }).click()
    await expect(f.getByRole('region', { name: 'Saved Ninja Record' })).toContainText(
      `Final Boss Reading Test · ${count - 1}/${count}`,
    )
    const records = await page.evaluate(() =>
      Object.entries(localStorage).filter(([k]) => k.startsWith('family-beta-preview-results-v1:')),
    )
    expect(records).toHaveLength(1)
    await page.reload()
    await expect(frame(page).getByRole('region', { name: 'Saved Ninja Record' })).toContainText(
      `Final Boss Reading Test · ${count - 1}/${count}`,
      { timeout: 30000 },
    )
  })
}
async function traceCharacter(page: Page, char: string) {
  const f = frame(page),
    pad = f.locator('svg[role="application"]'),
    strokes = writingCharacterGuides(char)[0],
    layout = getStrokeLayout(strokes)
  for (let i = Number(await pad.getAttribute('data-next-stroke')); i < strokes.length; i++) {
    const b = (await pad.boundingBox())!,
      xy = (p: readonly [number, number]) =>
        [
          b.x + ((p[0] * layout.scale + layout.offsetX) * b.width) / 100,
          b.y + ((p[1] * layout.scale + layout.offsetY) * b.height) / 100,
        ] as const
    await page.mouse.move(...xy(strokes[i][0]))
    await page.mouse.down()
    for (const p of strokes[i].slice(1)) await page.mouse.move(...xy(p))
    await page.mouse.up()
    await expect(pad).toHaveAttribute('data-next-stroke', String(i + 1))
  }
}
test('Grade 2 reentry teaches every character and 最 keeps its twelve strokes through all five steps', async ({
  page,
}, info) => {
  const f = await open(page, 'grade2', /Final Boss/)
  await f.getByRole('button', { name: 'Re-enter the Dojo', exact: true }).click()
  await f.getByRole('button', { name: 'Reenter the Dojo · writing', exact: true }).click()
  const teacher = f.getByRole('region', { name: 'Stroke order teacher' })
  // October 13 starts with 走, then 最: advance the actual first target, never alter the lesson fixture.
  for (const word of ['走', '最']) {
    for (const char of word) {
      for (let step = 1; step <= 5; step++) {
        await expect(teacher).toHaveAttribute('data-step', String(step))
        const pad = f.locator('svg[role="application"]')
        if (char === '最') {
          await expect(teacher).toContainText('12 strokes')
          if (step === 3) await expect(pad).toHaveAttribute('data-next-stroke', '8')
          if (step === 4) await expect(pad).toHaveAttribute('data-next-stroke', '4')
        }
        await traceCharacter(page, char)
        await f.getByRole('button', { name: step === 5 ? 'Compare' : 'Next step', exact: true }).click()
        if (step === 5) {
          if (char === '最') {
            await expect(f.locator('.is-reference [data-model-stroke]')).toHaveCount(12)
            await page.screenshot({ path: info.outputPath('zui-comparison.png') })
          }
          await f.getByRole('button', { name: 'I slayed it', exact: true }).click()
        }
      }
    }
    await expect(f.locator('#slay-acquisition-root')).toBeVisible()
    if (word === '走') {
      for (let i = 0; !(await teacher.isVisible()); i++) {
        expect(i).toBeLessThan(50)
        const skip = f.getByRole('button', { name: /^Skip timer$/i })
        await expect(skip).toBeEnabled()
        await skip.click()
        await f.getByRole('button', { name: 'I got it right', exact: true }).click()
      }
    }
  }
  await report(page)
})
