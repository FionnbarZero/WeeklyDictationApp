import { expect, test } from './fixtures.ts'
import { installGrade2CurriculumFixture } from './grade2Curriculum.ts'
import { openGrade2LearningActivity } from './learningHub.ts'

test('Hear recovers when audio fails after the first cue has started', async ({ page }) => {
  await page.addInitScript(() => {
    let spokenCues = 0
    HTMLMediaElement.prototype.play = () => Promise.reject(new Error('Use speech fallback'))
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {}, resume() {}, getVoices() { return [] },
        speak(utterance: SpeechSynthesisUtterance) {
          if (!utterance.text.trim()) return
          spokenCues += 1
          const fails = spokenCues === 2
          window.setTimeout(() => {
            if (fails) utterance.onerror?.({} as SpeechSynthesisErrorEvent)
            else {
              utterance.onstart?.({} as SpeechSynthesisEvent)
              utterance.onend?.({} as SpeechSynthesisEvent)
            }
          }, 0)
        },
      },
    })
  })
  await installGrade2CurriculumFixture(page)
  await page.goto('/?testDate=2026-09-29')
  await expect(page.locator('.curriculum-source-status')).toContainText('Loaded 4 weekly datasets')
  await openGrade2LearningActivity(page, 'Enter the Dojo', 'Learn to Write')
  await page.getByRole('button', { name: 'Skip Warmup' }).click()
  await expect(page.getByRole('timer')).toHaveText('00:10')
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0)
  const position = await page.locator('.practice-count').innerText()
  const typed = page.locator('.skywriting-keyboard-alternative input')
  await typed.fill('二')
  await expect(page.getByRole('alert')).toContainText('Audio stopped. Tap Hear to try again. Your place has not changed; the timer starts after the audio finishes.')
  const hear = page.getByRole('button', { name: 'Hear', exact: true })
  await expect(hear).toBeEnabled()
  await hear.click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(hear).toBeDisabled()
  await expect(page.locator('.practice-count')).toHaveText(position)
  await expect(typed).toHaveValue('二')
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible()
})

test('Familiar DT receives ten seconds only after its complete audio sequence', async ({ page }) => {
  await page.addInitScript(() => {
    const speechStarts: string[] = []
    let activeUtterance: SpeechSynthesisUtterance | undefined
    Object.defineProperty(window, '__writingTimerSpeechStarts', { value: speechStarts })
    Object.defineProperty(window, '__finishWritingTimerCue', {
      value: () => {
        const utterance = activeUtterance
        activeUtterance = undefined
        utterance?.onend?.({} as SpeechSynthesisEvent)
      },
    })
    HTMLMediaElement.prototype.play = () => Promise.reject(new Error('Use speech fallback'))
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() { activeUtterance = undefined },
        resume() {},
        getVoices() { return [] },
        speak(utterance: SpeechSynthesisUtterance) {
          activeUtterance = utterance
          speechStarts.push(utterance.text)
          utterance.onstart?.({} as SpeechSynthesisEvent)
        },
      },
    })
  })
  await installGrade2CurriculumFixture(page)
  await page.goto('/?testDate=2026-09-29')
  await expect(page.locator('.curriculum-source-status')).toContainText('Loaded 4 weekly datasets')
  await openGrade2LearningActivity(page, 'Enter the Dojo', 'Learn to Write')
  await page.getByRole('button', { name: 'Skip Warmup' }).click()
  const timer = page.getByRole('timer')
  const pause = page.getByRole('button', { name: 'Pause', exact: true })
  const skipTimer = page.getByRole('button', { name: 'Skip Timer', exact: true })
  await expect(timer).toHaveText('00:10')
  await expect(skipTimer).toBeDisabled()
  for (let cue = 1; cue <= 3; cue += 1) {
    await expect.poll(() => page.evaluate(() => (
      window as unknown as { __writingTimerSpeechStarts: string[] }
    ).__writingTimerSpeechStarts.length)).toBe(cue)
    await expect(timer).toHaveText('00:10')
    await expect(pause).toHaveCount(0)
    await page.evaluate(() => (
      window as unknown as { __finishWritingTimerCue: () => void }
    ).__finishWritingTimerCue())
  }
  await expect(skipTimer).toBeEnabled()
  await expect(pause).toBeVisible()
  await expect(timer).toHaveText('00:10')
  await expect(timer).toHaveText('00:09', { timeout: 2_000 })
})

for (const width of [802, 768]) {
test(`Type stays visible at ${width}px in-app browser width`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 741 })
  await installGrade2CurriculumFixture(page)
  await page.goto('/?testDate=2026-09-29')
  await expect(page.locator('.curriculum-source-status')).toContainText('Loaded 4 weekly datasets')
  await openGrade2LearningActivity(page, 'Enter the Dojo', 'Learn to Write')
  await page.getByRole('button', { name: 'Skip Warmup' }).click()
  const field = page.locator('.skywriting-keyboard-alternative input')
  await expect(field).toBeVisible()
  await expect(field).toBeEnabled()
  const box = (await field.boundingBox())!
  const scroll = (await page.locator('.skywriting-scroll-cell').first().boundingBox())!
  const hear = (await page.getByRole('button', { name: 'Hear', exact: true }).boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(width)
  expect(box.y + box.height).toBeLessThanOrEqual(741)
  expect(box.x).toBeGreaterThan(scroll.x + scroll.width)
  expect(box.width).toBeGreaterThanOrEqual(200)
  expect(box.height).toBeGreaterThanOrEqual(100)
  expect(Math.abs(box.x + box.width / 2 - (hear.x + hear.width / 2))).toBeLessThan(12)
  await expect(page.locator('.skywriting-keyboard-alternative > span')).toHaveCSS('background-color', 'rgb(150, 112, 71)')
  await page.screenshot({ path: testInfo.outputPath('in-app-writing.png') })
  await field.click()
  await field.fill('人')
  await expect(field).toHaveValue('人')
})
}

test('local Grade 2 Pinyin prototype offers and inserts a chosen character', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 802, height: 741 })
  // The familiar-word bag is shuffled. Pin this test to 人 without changing
  // the activity's normal word-selection behavior.
  await page.addInitScript(() => { Math.random = () => 0.067 })
  await page.goto('/?testDate=2026-10-14')
  await expect(page.locator('.curriculum-source-status')).toContainText('Loaded 6 weekly datasets')
  await openGrade2LearningActivity(page, 'Enter the Dojo', 'Learn to Write')
  await page.getByRole('button', { name: 'Skip Warmup' }).click()
  await expect(page.locator('.skywriting-pad').first()).toHaveAttribute('aria-label', 'Write character 1 of 1')
  const typed = page.locator('.skywriting-keyboard-alternative input')
  await expect(typed).toBeEnabled()
  await typed.fill('ren')
  const choices = page.getByRole('group', { name: 'Choose a Chinese character' })
  await expect(choices).toBeVisible()
  await expect(choices.getByRole('button')).toHaveCount(3)
  await page.screenshot({ path: testInfo.outputPath('pinyin-choices.png') })
  await page.setViewportSize({ width: 600, height: 741 })
  const narrowChoices = (await choices.boundingBox())!
  expect(narrowChoices.x).toBeGreaterThanOrEqual(0)
  expect(narrowChoices.x + narrowChoices.width).toBeLessThanOrEqual(600)
  expect(narrowChoices.y + narrowChoices.height).toBeLessThanOrEqual(741)
  await page.setViewportSize({ width: 802, height: 741 })
  await choices.getByRole('button', { name: 'Choose character 人' }).click()
  await expect(typed).toHaveValue('人')
  await expect(choices).toHaveCount(0)
  await page.getByRole('button', { name: 'Skip Timer' }).click()
  await expect(page.getByRole('button', { name: 'I got it right' })).toBeVisible()
  await expect(page.locator('.skywriting-keyboard-alternative input')).toHaveValue('人')
})

test('isolated Pinyin tryout is reachable and saves no response', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 802, height: 741 })
  await page.goto('/pinyin-person-preview.html')
  await expect(page.getByText('Nothing is scored or saved')).toBeVisible()
  const typed = page.locator('.skywriting-keyboard-alternative input')
  await typed.fill('ren')
  await expect(page.getByRole('button', { name: 'Choose character 人' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('isolated-pinyin-tryout.png') })
  await page.getByRole('button', { name: 'Choose character 人' }).click()
  await expect(typed).toHaveValue('人')
  await page.reload()
  await expect(page.locator('.skywriting-keyboard-alternative input')).toHaveValue('')
})

for (const viewport of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
  test(`Grand Scroll keeps writing and review controls clear at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await installGrade2CurriculumFixture(page)
    await page.goto('/?testDate=2026-09-29')
    await expect(page.locator('.curriculum-source-status')).toContainText('Loaded 4 weekly datasets')
    await openGrade2LearningActivity(page, 'Enter the Dojo', 'Learn to Write')
    await page.getByRole('button', { name: 'Skip Warmup' }).click()
    const cell = page.locator('.skywriting-scroll-cell').first()
    await expect(cell).toBeVisible()
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    const hear = page.getByRole('button', { name: 'Hear', exact: true })
    await expect(hear).toBeDisabled()
    await expect(hear.locator('svg.lucide-headphones')).toHaveCount(1)
    const hearBox = (await hear.boundingBox())!
    expect(hearBox.width).toBe(88)
    expect(hearBox.height).toBe(88)
    await expect(hear.locator('span')).toHaveText('Hear')
    await expect(hear).toHaveCSS('color', 'rgb(255, 255, 255)')
    await expect(hear).toHaveCSS('border-radius', '50%')
    const instructionsBox = (await page.locator('.tier1-writing-instructions h1').boundingBox())!
    expect(hearBox.x).toBeGreaterThan(instructionsBox.x + instructionsBox.width)
    const box = await cell.boundingBox()
    const clearBox = await page.getByRole('button', { name: 'Clear', exact: true }).boundingBox()
    expect(box).not.toBeNull()
    expect(clearBox).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(viewport.height * 0.5)
    expect(box!.x + box!.width <= clearBox!.x || box!.y + box!.height <= clearBox!.y).toBe(true)
    const keyboardBox = (await page.locator('.skywriting-keyboard-alternative').boundingBox())!
    const footerBox = (await page.locator('.skywriting-pad-footer').boundingBox())!
    expect(keyboardBox.y).toBeGreaterThanOrEqual(hearBox.y + hearBox.height)
    expect(keyboardBox.y - (hearBox.y + hearBox.height)).toBeLessThan(30)
    expect(Math.abs(keyboardBox.x + keyboardBox.width / 2 - (hearBox.x + hearBox.width / 2))).toBeLessThan(1)
    expect(keyboardBox.y + keyboardBox.height).toBeLessThanOrEqual(clearBox!.y)
    expect(clearBox!.y + clearBox!.height).toBeLessThanOrEqual(footerBox.y)
    await expect(page.locator('.skywriting-keyboard-alternative > span')).toHaveText('Type')
    await expect(page.locator('.skywriting-keyboard-alternative > span')).toHaveCSS('font-size', '24px')
    await expect(page.locator('.skywriting-keyboard-alternative > span')).toHaveCSS('background-color', 'rgb(150, 112, 71)')
    await expect(page.locator('.skywriting-keyboard-alternative > span')).toHaveCSS('color', 'rgb(255, 255, 255)')
    const inputBox = (await page.locator('.skywriting-keyboard-alternative input').boundingBox())!
    expect(inputBox.width).toBe(204)
    expect(inputBox.height).toBe(120)
    expect(inputBox.x + inputBox.width).toBeLessThanOrEqual(viewport.width)
    await expect(hear).toHaveCSS('background-color', 'rgb(49, 91, 134)')
    expect(keyboardBox.y + keyboardBox.height).toBeLessThanOrEqual(footerBox.y)
    await page.screenshot({ path: testInfo.outputPath('hear-button.png') })
    const pad = page.locator('.skywriting-scroll-cell svg').first()
    const padBox = (await pad.boundingBox())!
    await page.mouse.move(padBox.x + padBox.width * 0.2, padBox.y + padBox.height * 0.2)
    await page.mouse.down()
    await page.mouse.move(padBox.x + padBox.width * 0.7, padBox.y + padBox.height * 0.7, { steps: 20 })
    await page.mouse.up()
    await expect(pad.locator('.skywriting-stroke')).toHaveCount(1)
    const ink = await pad.locator('.skywriting-stroke').getAttribute('d')
    expect(await pad.evaluate((element) => {
      const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 })
      element.dispatchEvent(event)
      return event.defaultPrevented
    })).toBe(true)
    await page.locator('.skywriting-keyboard-alternative input').fill('二')
    await page.getByRole('button', { name: 'Skip Timer' }).click()
    await expect(page.getByRole('button', { name: /I got it right/i })).toBeVisible()
    for (const name of ['I got it right', 'I got it wrong']) {
      const answerBox = (await page.getByRole('button', { name, exact: true }).boundingBox())!
      expect(answerBox.height).toBeGreaterThanOrEqual(57)
      expect(answerBox.height).toBeLessThanOrEqual(60)
      expect(answerBox.width).toBeGreaterThanOrEqual(260)
      expect(answerBox.width).toBeLessThanOrEqual(290)
      expect(answerBox.y + answerBox.height).toBeLessThanOrEqual(viewport.height)
    }
    await page.screenshot({ path: testInfo.outputPath('large-review-buttons.png') })
    await expect(pad.locator('.skywriting-stroke')).toHaveAttribute('d', ink!)
    await expect(page.locator('.skywriting-keyboard-alternative input')).toHaveValue('二')
    const reviewBox = (await cell.boundingBox())!
    const typedBox = (await page.locator('.skywriting-keyboard-alternative input').boundingBox())!
    expect(reviewBox.y + reviewBox.height).toBeLessThanOrEqual(typedBox.y)
    expect(reviewBox.x).toBeGreaterThanOrEqual(0)
    expect(reviewBox.x + reviewBox.width).toBeLessThanOrEqual(viewport.width)
  })
}

test('Grand Scroll hear button retries a failed prompt without advancing the word', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      return Promise.reject(new DOMException('Playback was blocked.', 'NotAllowedError'))
    }
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        getVoices() { return [] },
        resume() {},
        speak(utterance: SpeechSynthesisUtterance) {
          window.setTimeout(() => utterance.onerror?.({} as SpeechSynthesisErrorEvent), 0)
        },
      },
    })
  })
  await installGrade2CurriculumFixture(page)
  await page.goto('/?testDate=2026-09-29')
  await expect(page.locator('.curriculum-source-status')).toContainText('Loaded 4 weekly datasets')
  await openGrade2LearningActivity(page, 'Enter the Dojo', 'Learn to Write')
  await page.getByRole('button', { name: 'Skip Warmup' }).click()
  const hear = page.getByRole('button', { name: 'Hear', exact: true })
  await expect(page.getByRole('alert')).toContainText('Audio stopped. Tap Hear to try again. Your place has not changed; the timer starts after the audio finishes.')
  await expect(hear).toBeEnabled()
  const position = await page.locator('.practice-count').innerText()
  const timer = await page.getByRole('timer').innerText()
  await hear.click()
  await expect(page.getByRole('alert')).toContainText('Audio stopped. Tap Hear to try again. Your place has not changed; the timer starts after the audio finishes.')
  await expect(hear).toBeEnabled()
  await expect(page.locator('.practice-count')).toHaveText(position)
  await expect(page.getByRole('timer')).toHaveText(timer)
  await expect(page.getByRole('button', { name: 'Try audio again' })).toHaveCount(0)
})
