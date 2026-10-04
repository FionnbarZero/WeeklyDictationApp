import { expect, test } from './fixtures.ts'

test.use({ viewport: { width: 390, height: 844 }, permissions: [] })

async function openFinalBoss(
  page: import('@playwright/test').Page,
  activity: 'Writing Test' | 'Reading Test',
  fixtureWeek = '459793081',
) {
  await page.goto('/kindergarten-learning-lab.html')
  await page.getByText('Development fixture controls').click()
  await page.getByLabel('Current fixture week').selectOption(fixtureWeek)
  await page.getByRole('button', { name: /The Final Boss Test/ }).click()
  await page.getByRole('button', { name: activity, exact: true }).click()
}

async function collectWritingResponses(page: import('@playwright/test').Page) {
  for (let index = 0; index < 14; index += 1) {
    await page.getByRole('button', { name: 'Skip Timer' }).click()
  }
}

test('Kindergarten writing Final Boss retains Sky Writing and opens an unobscured final review', async ({ page }) => {
  await openFinalBoss(page, 'Writing Test')
  const pad = page.getByRole('img', { name: 'Blank word drawing pad' })
  const bounds = await pad.boundingBox()
  expect(bounds).not.toBeNull()
  await page.mouse.move(bounds!.x + bounds!.width * 0.25, bounds!.y + bounds!.height * 0.3)
  await page.mouse.down()
  await page.mouse.move(bounds!.x + bounds!.width * 0.7, bounds!.y + bounds!.height * 0.7, { steps: 5 })
  await page.mouse.up()
  await expect(page.getByRole('img', { name: 'Your word drawing' })).toBeVisible()

  await collectWritingResponses(page)

  await expect(page.getByRole('heading', { name: /Review everything/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Exit without saving' })).toBeInViewport()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)

  const rows = page.locator('.deferred-review-row')
  await expect(rows).toHaveCount(14)
  await expect(rows.first().locator('.skywriting-stroke')).toHaveCount(1)
  await expect(rows.first().getByText('一', { exact: true })).toBeVisible()
  const lastRow = await rows.last().boundingBox()
  const submitBar = await page.locator('.deferred-submit-bar').boundingBox()
  expect(lastRow).not.toBeNull()
  expect(submitBar).not.toBeNull()
  expect(submitBar!.y).toBeGreaterThanOrEqual(lastRow!.y + lastRow!.height)
})

test('Kindergarten writing Final Boss submits one mixed final score', async ({ page }) => {
  await openFinalBoss(page, 'Writing Test')
  await collectWritingResponses(page)

  const rows = page.locator('.deferred-review-row')
  for (let index = 0; index < 14; index += 1) {
    await rows
      .nth(index)
      .getByRole('button', { name: index % 2 === 0 ? 'Yes' : 'Not yet' })
      .click()
  }
  await page.getByRole('button', { name: 'Submit final review' }).click()

  await expect(page.getByText('Final Boss complete: 7/14.')).toBeVisible()
  await expect(page.getByText('7 of 14 correct')).toBeVisible()
})

test('Kindergarten Final Boss confirms before discarding an unfinished response', async ({ page }) => {
  await openFinalBoss(page, 'Writing Test')
  await page.getByRole('button', { name: 'Skip Timer' }).click()
  const exitButton = page.getByRole('button', { name: 'Exit without saving' })
  await exitButton.click()

  const confirmation = page.getByRole('dialog', { name: 'Exit without saving?' })
  await expect(confirmation).toBeVisible()
  await expect(confirmation.getByRole('button', { name: 'Keep working' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(confirmation).toBeHidden()
  await expect(exitButton).toBeFocused()
  await expect(page.getByText('Writing responses · 2 of 14')).toBeVisible()

  await exitButton.click()
  await confirmation.getByRole('button', { name: 'Exit without saving' }).click()
  await expect(page.getByRole('heading', { name: /Ready for your next adventure/ })).toBeVisible()
  await expect(page.getByText('No scores yet')).toBeVisible()
})

test('Kindergarten reading Final Boss defers microphone fallbacks to one final review', async ({ page }) => {
  await openFinalBoss(page, 'Reading Test')
  await expect(page.getByText('Reading responses · 1 of 9')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Yes' })).toHaveCount(0)

  for (let index = 0; index < 9; index += 1) {
    await page.getByRole('button', { name: 'Record my reading' }).click()
    await expect(page.getByText('Microphone recording is unavailable.')).toBeVisible()
    await page.getByRole('button', { name: 'Continue without a recording' }).click()
  }

  await expect(page.getByRole('heading', { name: /Review everything/ })).toBeVisible()
  const rows = page.locator('.deferred-review-row')
  await expect(rows).toHaveCount(9)
  for (let index = 0; index < 9; index += 1) {
    await rows
      .nth(index)
      .getByRole('button', { name: index < 5 ? 'Yes' : 'Not yet' })
      .click()
  }
  await page.getByRole('button', { name: 'Submit final review' }).click()

  await expect(page.getByText('Final Boss Reading Test complete: 5/9.')).toBeVisible()
  await expect(page.getByText('5 of 9 correct')).toBeVisible()
})

test('Kindergarten reading Final Boss plays the child recording before the correct pronunciation', async ({ page }) => {
  await page.addInitScript(() => {
    const playbackOrder: string[] = []
    Object.defineProperty(window, '__readingPlaybackOrder', {
      configurable: true,
      value: playbackOrder,
    })

    class FakeMediaRecorder {
      static isTypeSupported() {
        return true
      }
      state = 'inactive'
      mimeType = 'audio/webm'
      ondataavailable: null | ((event: { data: Blob }) => void) = null
      onerror: null | ((event: Event) => void) = null
      onstop: null | (() => void) = null

      start() {
        this.state = 'recording'
      }

      stop() {
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob(['child-reading'], { type: this.mimeType }) })
        this.onstop?.()
      }
    }

    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: FakeMediaRecorder,
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        async getUserMedia() {
          return { getTracks: () => [{ stop() {} }] }
        },
      },
    })

    let clipNumber = 0
    URL.createObjectURL = () => `blob:child-${++clipNumber}`
    URL.revokeObjectURL = () => undefined

    class FakeAudio {
      src: string
      playbackRate = 1
      preload = ''
      onended: null | (() => void) = null
      onerror: null | (() => void) = null
      readonly listeners = new Map<string, Set<() => void>>()

      constructor(src = '') {
        this.src = src
      }

      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        const callback = listener as () => void
        const listeners = this.listeners.get(type) || new Set<() => void>()
        listeners.add(callback)
        this.listeners.set(type, listeners)
      }

      removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        this.listeners.get(type)?.delete(listener as () => void)
      }

      load() {}

      play() {
        playbackOrder.push(`${this.src.startsWith('blob:') ? 'child' : 'model'}:${this.src}`)
        window.setTimeout(() => {
          this.onended?.()
          for (const listener of this.listeners.get('ended') || []) listener()
        }, 10)
        return Promise.resolve()
      }
    }

    Object.defineProperty(window, 'Audio', {
      configurable: true,
      value: FakeAudio,
    })
  })

  await openFinalBoss(page, 'Reading Test', '1759563195')
  for (let index = 0; index < 3; index += 1) {
    await page.getByRole('button', { name: 'Record my reading' }).click()
    await page.getByRole('button', { name: 'Stop recording' }).click()
    await expect(page.getByText('Recording captured. It will be compared on the final page.')).toBeVisible()
    await page.getByRole('button', { name: 'Save response and continue' }).click()
  }

  const firstRow = page.locator('.deferred-review-row').first()
  const assessment = firstRow.getByRole('button', { name: 'Yes' })
  await expect(assessment).toBeDisabled()

  await firstRow.getByRole('button', { name: 'Play my reading, then the correct pronunciation for 猫' }).click()

  await expect(firstRow.getByText('Comparison complete. Choose Yes or Not yet.')).toBeVisible()
  await expect(assessment).toBeEnabled()
  await expect
    .poll(() =>
      page.evaluate(() => (window as Window & { __readingPlaybackOrder: string[] }).__readingPlaybackOrder.slice(0, 2)),
    )
    .toEqual([
      'child:blob:child-1',
      'model:http://127.0.0.1:5185/audio/kindergarten/u732b.wav',
    ])
})
