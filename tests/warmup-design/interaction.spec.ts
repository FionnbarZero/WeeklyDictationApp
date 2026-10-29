import { expect, type Page, test } from '@playwright/test'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'
import { type WarmupGrade, warmupGrades, warmupSamples, warmupSlugs } from '../../src/warmupDesign/samples.ts'

async function controlledAudio(page: Page) {
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
          setTimeout(() => u.onend?.({} as SpeechSynthesisEvent), 20)
        },
      },
    })
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('playing'))
      setTimeout(() => this.dispatchEvent(new Event('ended')), 30)
      return Promise.resolve()
    }
  })
}
async function start(page: Page, grade: WarmupGrade) {
  await page.goto(`/warmup-design-preview.html?grade=${warmupSlugs[grade]}`)
  await page.getByRole('button', { name: 'Start or resume Warmup', exact: true }).click()
}
async function readState(page: Page, grade: WarmupGrade) {
  return page.evaluate(
    (slug) => JSON.parse(localStorage.getItem(`ninja-warmup-design-v1:${slug}`)!).state,
    warmupSlugs[grade],
  )
}
async function answer(page: Page, correct: boolean) {
  const skip = page.getByRole('button', { name: 'Skip Timer', exact: true })
  await expect(skip).toBeEnabled({ timeout: 20000 })
  await skip.click()
  await page.getByRole('button', { name: correct ? 'I got it right' : 'I got it wrong', exact: true }).click()
  await expect(page.locator('.warmup-design')).not.toHaveAttribute('data-report-phase', 'compare')
}
async function trace(page: Page, grade: WarmupGrade, wordIndex: number, reject = false) {
  const sample = warmupSamples(grade)[wordIndex]
  for (let character = 0; character < sample.guides.length; character++) {
    const guide = page.getByRole('region', { name: 'Warmup stroke guide' })
    await expect(guide).toHaveAttribute('data-character-index', String(character))
    const pad = guide.locator('svg[role="application"]')
    await expect(pad).toBeInViewport({ ratio: 1 })
    const strokes = sample.guides[character]
    const layout = getStrokeLayout(strokes)
    const b = (await pad.boundingBox())!
    expect(b.width).toBeGreaterThan(230)
    const xy = (p: readonly [number, number]) =>
      [
        b.x + ((p[0] * layout.scale + layout.offsetX) * b.width) / 100,
        b.y + ((p[1] * layout.scale + layout.offsetY) * b.height) / 100,
      ] as const
    const draw = async (points: readonly (readonly [number, number])[]) => {
      await page.mouse.move(...xy(points[0]))
      await page.mouse.down()
      for (const point of points.slice(1)) await page.mouse.move(...xy(point))
      await page.mouse.up()
    }
    if (reject && character === 0) {
      await draw([...strokes[0]].reverse())
      await expect(pad).toHaveAttribute('data-next-stroke', '0')
      await expect(guide.getByRole('status')).toContainText('Go the other way')
      await expect(guide.getByRole('button', { name: /^(Next character|Write the whole word)$/ })).toBeDisabled()
      await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
      await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    }
    for (let i = 0; i < strokes.length; i++) {
      await draw(strokes[i])
      await expect(pad).toHaveAttribute('data-next-stroke', String(i + 1))
      const after = (await pad.boundingBox())!
      expect(Math.abs(after.y - b.y)).toBeLessThan(1)
      expect(Math.abs(after.height - b.height)).toBeLessThan(1)
    }
    const next = guide.getByRole('button', {
      name: character + 1 < sample.guides.length ? 'Next character' : 'Write the whole word',
      exact: true,
    })
    await expect(next).toBeInViewport({ ratio: 1 })
    await next.click()
    if (character + 1 < sample.guides.length)
      await expect(guide).toHaveAttribute('data-character-index', String(character + 1))
    else await expect(guide).toBeHidden()
  }
}

for (const grade of warmupGrades) {
  test(`${grade}: repeated corrections, all characters, resume and first-attempt mastery`, async ({ page }) => {
    await controlledAudio(page)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await start(page, grade)
    const sample = warmupSamples(grade)[0]
    await expect(page.locator('.skywriting-reveal-word')).toHaveCount(0)
    await expect(page.locator('.skywriting-trace-character')).toHaveCount(0)
    await answer(page, false)
    expect((await readState(page, grade)).firstAnswers).toEqual([false])
    await page.reload()
    await page.getByRole('button', { name: 'Start or resume Warmup', exact: true }).click()
    await trace(page, grade, 0, true)
    await answer(page, false)
    await trace(page, grade, 0)
    await answer(page, true)
    expect((await readState(page, grade)).firstAnswers).toEqual([false])
    expect((await readState(page, grade)).index).toBe(1)
    await answer(page, false)
    await trace(page, grade, 1)
    await answer(page, true)
    for (let index = 2; index < warmupSamples(grade).length; index++) await answer(page, true)
    const state = await readState(page, grade)
    expect(state.phase).toBe('complete')
    expect(state.firstAnswers.slice(0, 2)).toEqual([false, false])
    await expect(page.getByTestId('mastery-result')).toContainText(`${Math.max(0, warmupSamples(grade).length - 2)} of`)
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Start or resume Warmup', exact: true })).toBeVisible()
    expect(errors).toEqual([])
    expect(sample.word.id).toBeTruthy()
  })

  test(`${grade}: boxes, typing, controls and comparison fit each sample length`, async ({ page }) => {
    await controlledAudio(page)
    await start(page, grade)
    for (const sample of warmupSamples(grade)) {
      const pads = page.locator('.skywriting-scroll-cell svg')
      await expect(pads).toHaveCount([...sample.word.text].length)
      for (const pad of await pads.all()) {
        await expect(pad).toBeInViewport({ ratio: 1 })
        const b = (await pad.boundingBox())!
        expect(b.width).toBeGreaterThan(180)
        expect(Math.abs(b.width - b.height)).toBeLessThan(3)
      }
      await expect(page.getByRole('button', { name: 'Hear', exact: true })).toBeInViewport({ ratio: 1 })
      await expect(page.getByRole('button', { name: 'Exit game', exact: true })).toBeInViewport({ ratio: 1 })
      const input = page.locator('.skywriting-keyboard-alternative input')
      await expect(input).toBeInViewport({ ratio: 1 })
      await input.fill('test ink stays temporary')
      expect(JSON.stringify(await readState(page, grade))).not.toContain('test ink')
      await page.screenshot({ path: test.info().outputPath(`${grade}-${[...sample.word.text].length}-memory.png`) })
      await expect(page.getByRole('button', { name: 'Skip Timer', exact: true })).toBeEnabled({ timeout: 20000 })
      await page.getByRole('button', { name: 'Skip Timer', exact: true }).click()
      await expect(page.locator('.skywriting-reveal-word')).toHaveText(sample.word.text)
      if ([...sample.word.text].length === 4 && page.viewportSize()!.width < page.viewportSize()!.height) {
        const rows = await page.locator('.skywriting-reveal-word').evaluate((element) => {
          const text = element.firstChild!
          return [0, 1, 2, 3].map((index) => {
            const range = document.createRange()
            range.setStart(text, index)
            range.setEnd(text, index + 1)
            return range.getBoundingClientRect().y
          })
        })
        expect(Math.abs(rows[0] - rows[1])).toBeLessThan(1)
        expect(Math.abs(rows[2] - rows[3])).toBeLessThan(1)
        expect(rows[2] - rows[0]).toBeGreaterThan(100)
      }
      await expect(page.getByRole('button', { name: 'I got it wrong', exact: true })).toBeInViewport({ ratio: 1 })
      await expect(page.getByRole('button', { name: 'I got it right', exact: true })).toBeInViewport({ ratio: 1 })
      await page.screenshot({ path: test.info().outputPath(`${grade}-${[...sample.word.text].length}-compare.png`) })
      await page.getByRole('button', { name: 'I got it right', exact: true }).click()
    }
  })
}

test('Timer waits for audio; Report pauses it; failed saves preserve the first decision', async ({ page }) => {
  await controlledAudio(page)
  await start(page, 'Kindergarten')
  const timer = page.getByRole('timer')
  await expect(timer).toHaveText('00:10')
  await expect(page.getByRole('button', { name: 'Skip Timer', exact: true })).toBeEnabled({ timeout: 20000 })
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  const before = await timer.textContent()
  await page.waitForTimeout(1600)
  expect(await timer.textContent()).toBe(before)
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  await page.getByRole('button', { name: 'Skip Timer', exact: true }).click()
  await expect(page.locator('.warmup-design')).toHaveAttribute('data-report-phase', 'compare')
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    ;(window as unknown as { restoreSave: () => void }).restoreSave = () => {
      Storage.prototype.setItem = original
    }
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('ninja-warmup-design')) throw new Error('Test storage failure')
      return original.call(this, key, value)
    }
  })
  await page.getByRole('button', { name: 'I got it wrong', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Test storage failure')
  expect((await readState(page, 'Kindergarten')).firstAnswers).toEqual([])
  await page.evaluate(() => (window as unknown as { restoreSave: () => void }).restoreSave())
  await page.getByRole('button', { name: 'I got it wrong', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Warmup stroke guide' })).toBeVisible()
  expect((await readState(page, 'Kindergarten')).firstAnswers).toEqual([false])
})

test('Grade 5: all four characters must finish before the blank whole-word retry', async ({ page }) => {
  await controlledAudio(page)
  await start(page, 'Grade 5')
  for (let i = 0; i < 3; i++) await answer(page, true)
  await answer(page, false)
  await trace(page, 'Grade 5', 3, true)
  expect((await readState(page, 'Grade 5')).phase).toBe('memory')
  await expect(page.locator('.skywriting-scroll-cell svg')).toHaveCount(4)
  await expect(page.locator('.skywriting-trace-character')).toHaveCount(0)
  await answer(page, true)
  expect((await readState(page, 'Grade 5')).firstAnswers).toEqual([true, true, true, false])
  await expect(page.getByTestId('mastery-result')).toHaveText('3 of 4 words correct on the first try.')
})
