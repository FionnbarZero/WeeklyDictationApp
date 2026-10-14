import { expect, test } from './fixtures.ts'
import { strokeOrderGuide } from '../../src/familyBeta/strokeOrderSlay.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'

const characters = ['英', '雄']
const guides = characters.map((text) => strokeOrderGuide({ id: `teacher-test-${text}`, text }).strokes)
let strokes = guides[0]
let layout = getStrokeLayout(strokes)

test('every character completes six steps before whole-word scroll acquisition', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.addInitScript(() => {
    const spokenWords: string[] = []
    Object.defineProperty(window, '__teacherSpokenWords', { value: spokenWords })
    HTMLMediaElement.prototype.play = () => Promise.reject(new Error('Use speech fallback'))
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices() {
          return []
        },
        speak(utterance: SpeechSynthesisUtterance) {
          spokenWords.push(utterance.text)
          utterance.onstart?.({} as SpeechSynthesisEvent)
          window.setTimeout(() => utterance.onend?.({} as SpeechSynthesisEvent), 10)
        },
      },
    })
  })
  await page.goto('/stroke-teacher-preview.html')
  const teacher = page.getByRole('region', { name: 'Stroke order teacher' })
  const pad = teacher.locator('svg[role="application"]')
  async function draw(points: readonly (readonly [number, number])[]) {
    const bounds = (await pad.boundingBox())!
    await page.mouse.move(
      bounds.x + ((points[0][0] * layout.scale + layout.offsetX) * bounds.width) / 100,
      bounds.y + ((points[0][1] * layout.scale + layout.offsetY) * bounds.height) / 100,
    )
    await page.mouse.down()
    for (const point of points.slice(1))
      await page.mouse.move(
        bounds.x + ((point[0] * layout.scale + layout.offsetX) * bounds.width) / 100,
        bounds.y + ((point[1] * layout.scale + layout.offsetY) * bounds.height) / 100,
        {
          steps: 3,
        },
      )
    await page.mouse.up()
  }
  await expect(teacher).toHaveAttribute('data-step', '1')
  await expect(teacher).toHaveClass(/lg-stroke-order-card/)
  await expect(page.getByRole('heading', { name: 'Stroke-order Slay - 2nd', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('original-stroke-ui.png') })
  await expect(page.getByRole('button', { name: 'Next step', exact: true })).toBeDisabled()
  await draw([...strokes[0]].reverse())
  await expect(page.getByRole('status')).toContainText('other way')
  await expect(pad).toHaveAttribute('data-next-stroke', '0')
  await draw(strokes[1])
  await expect(page.getByRole('status')).toContainText('That is stroke 2')
  await expect(pad).toHaveAttribute('data-next-stroke', '0')
  await page.screenshot({ path: testInfo.outputPath('stroke-guidance.png') })
  for (let characterIndex = 0; characterIndex < characters.length; characterIndex += 1) {
    strokes = guides[characterIndex]
    layout = getStrokeLayout(strokes)
    await expect(teacher).toHaveAttribute('data-character-index', String(characterIndex))
    await expect(teacher).toHaveAttribute('data-step', '1')
    await expect(teacher.locator('.lg-vocabulary-word .is-current')).toHaveText(characters[characterIndex])
    await expect(pad).toHaveAttribute('data-next-stroke', '0')
    for (let step = 1; step <= 6; step += 1) {
      await expect(teacher).toHaveAttribute('data-step', String(step))
      await expect
        .poll(() =>
          page.evaluate(() => (window as unknown as { __teacherSpokenWords: string[] }).__teacherSpokenWords.length),
        )
        .toBe(characterIndex * 6 + step)
      const supplied = Number(await pad.getAttribute('data-supplied-strokes'))
      if (step === 4) {
        expect(supplied).toBe(strokes.length - Math.ceil(strokes.length / 3))
        await expect(pad.locator('.lg-stroke-guide > path')).toHaveCount(0)
        await expect(pad.locator('.teacher-supplied-stroke')).toHaveCount(supplied)
        await page.screenshot({ path: testInfo.outputPath(`character-${characterIndex + 1}-last-third.png`) })
      }
      if (step === 5) expect(supplied).toBe(Math.floor(strokes.length / 3))
      if (step === 6) await expect(pad.locator('.lg-stroke-guide > path,.lg-stroke-marker')).toHaveCount(0)
      for (let index = supplied; index < strokes.length; index += 1) {
        await draw(strokes[index])
        await expect(pad).toHaveAttribute('data-next-stroke', String(index + 1))
      }
      if (step < 6) await page.getByRole('button', { name: 'Next step', exact: true }).click()
    }
    await page.getByRole('button', { name: 'Compare', exact: true }).click()
    await expect(
      page.getByRole('img', { name: `Correct character: ${characters[characterIndex]}`, exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'I slayed it', exact: true }).click()
    if (characterIndex + 1 < characters.length) {
      await expect(teacher).toHaveAttribute('data-character-index', String(characterIndex + 1))
      await expect(page.locator('.skywriting-acquisition')).toHaveCount(0)
      await expect(teacher).toHaveAttribute('data-step', '1')
      await page.screenshot({ path: testInfo.outputPath('second-character-before-acquisition.png') })
    }
  }
  await expect(teacher).toHaveCount(0)
  await expect(page.locator('.skywriting-acquisition.is-grand-scroll')).toBeVisible()
  await expect(page.getByRole('timer')).toHaveText('00:10')
  // Existing introduction retains both Familiar DT trials before the target model.
  for (let trial = 0; trial < 2; trial += 1) {
    await page.getByRole('button', { name: 'Skip Timer', exact: true }).click()
    await page.getByRole('button', { name: 'I got it right', exact: true }).click()
  }
  await expect(page.getByRole('heading', { name: 'Trace the word as you listen.' })).toBeVisible()
  await expect(page.getByRole('timer')).toHaveText('00:25')
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('grand-scroll-handoff.png') })
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({
    local: 0,
    session: 0,
  })
})

test('word card disappears at seven seconds and listening does not reveal it again', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-14T12:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-14T12:00:01Z'))
  await page.addInitScript(() => {
    const spokenWords: string[] = []
    Object.defineProperty(window, '__teacherSpokenWords', { value: spokenWords })
    HTMLMediaElement.prototype.play = () => Promise.reject(new Error('Use speech fallback'))
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices() {
          return []
        },
        speak(utterance: SpeechSynthesisUtterance) {
          spokenWords.push(utterance.text)
          utterance.onstart?.({} as SpeechSynthesisEvent)
          window.setTimeout(() => utterance.onend?.({} as SpeechSynthesisEvent), 10)
        },
      },
    })
  })
  await page.goto('/stroke-teacher-preview.html')
  const card = page.locator('.lg-vocabulary-main')
  const hear = page.getByRole('button', { name: 'Hear 英雄', exact: true })
  await expect(card).toBeVisible()
  await page.clock.runFor(6_999)
  await expect(card).toBeVisible()
  expect(
    await page.evaluate(() => (window as unknown as { __teacherSpokenWords: string[] }).__teacherSpokenWords),
  ).toEqual(['英雄'])
  await page.clock.runFor(1)
  await expect(card).toBeHidden()
  await expect(page.getByRole('heading', { name: '英 雄' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Next step', exact: true })).toBeDisabled()
  await hear.click()
  await page.clock.runFor(400)
  await expect(card).toBeHidden()
  expect(
    await page.evaluate(() => (window as unknown as { __teacherSpokenWords: string[] }).__teacherSpokenWords),
  ).toEqual(['英雄', '英雄'])
})
