import { expect, test } from './fixtures.ts'
import { watchForUnexpectedBrowserErrors } from './prototypeSupport.ts'

test.use({ viewport: { width: 390, height: 844 }, permissions: [] })

type ExitCase = {
  section: RegExp
  activity: string
  exit: 'Exit game' | 'Exit practice' | 'Exit reading'
  status: string
}

async function selectWeek8(page: import('@playwright/test').Page) {
  await page.getByText('Development fixture controls').click()
  await page.getByLabel('Current fixture week').selectOption('1759563195')
}

async function selectWeek7(page: import('@playwright/test').Page) {
  await page.getByText('Development fixture controls').click()
  await page.getByLabel('Current fixture week').selectOption('459793081')
}

const exitCases: ExitCase[] = [
  {
    section: /Enter the Dojo/,
    activity: 'Writing characters',
    exit: 'Exit practice',
    status: 'Writing practice exited. No score was added.',
  },
  {
    section: /Enter the Dojo/,
    activity: 'High-frequency words',
    exit: 'Exit reading',
    status: 'Reading practice exited. No score was added.',
  },
  {
    section: /Practice your Ninja Skills/,
    activity: 'Listening Lily Pads',
    exit: 'Exit game',
    status: 'Returned to the Kindergarten paths.',
  },
  {
    section: /Practice your Ninja Skills/,
    activity: 'Memory Lanterns',
    exit: 'Exit game',
    status: 'Returned to the Kindergarten paths.',
  },
  {
    section: /Practice your Ninja Skills/,
    activity: 'Sky Writing',
    exit: 'Exit game',
    status: 'Returned to the Kindergarten paths.',
  },
  {
    section: /Enter the Spirit Realm/,
    activity: 'Writing mastery warmup',
    exit: 'Exit game',
    status: 'Returned to the Kindergarten paths.',
  },
  {
    section: /Enter the Spirit Realm/,
    activity: 'Reading mastery',
    exit: 'Exit reading',
    status: 'Reading practice exited. No score was added.',
  },
]

test('Kindergarten separates Ninja Skills by selectable unit', async ({ page }) => {
  await page.goto('/kindergarten-learning-lab.html')
  await selectWeek8(page)

  await expect(page.getByRole('button', { name: /Enter the Dojo/ })).toContainText('Week 8 10/05')
  const ninja = page.getByRole('button', { name: /Practice your Ninja Skills/ })
  const finalBoss = page.getByRole('button', { name: /The Final Boss Test/ })
  const spiritRealm = page.getByRole('button', { name: /Enter the Spirit Realm/ })
  await expect(ninja).toContainText('2 units available')
  await expect(finalBoss).toContainText('Unit 2 · 1 week')
  await expect(finalBoss).toBeEnabled()
  await expect(spiritRealm).toContainText('Unit 1 · 4 weeks')

  await ninja.click()
  const unitPicker = page.getByLabel('Choose a unit')
  await expect(unitPicker).toHaveValue('__kindergarten-unit-1-ninja-lab__')
  await expect(page.getByText('14 writing · 9 reading')).toBeVisible()
  await unitPicker.selectOption('__kindergarten-unit-2-ninja-lab__')
  await expect(page.getByText('2 writing · 3 reading')).toBeVisible()
  await expect(page.getByText('牛', { exact: true })).toBeVisible()
  await expect(page.getByText('猫', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Listening Lily Pads', exact: true }).click()
  await expect(page.getByText('Word 1 of 3')).toBeVisible()
  await page.getByRole('button', { name: 'Exit game' }).click()
  await finalBoss.click()
  await expect(page.getByText('2 writing · 3 reading')).toBeVisible()
  await expect(page.getByText('牛', { exact: true })).toBeVisible()
  await expect(page.getByText('猫', { exact: true })).toBeVisible()
})

for (const exitCase of exitCases) {
  test(`Kindergarten ${exitCase.activity} exits back to the Learning Hub without crashing`, async ({ page }) => {
    const expectNoBrowserErrors = watchForUnexpectedBrowserErrors(page)

    await page.goto('/kindergarten-learning-lab.html')
    await selectWeek8(page)
    await page.getByRole('button', { name: exitCase.section }).click()
    await page.getByRole('button', { name: exitCase.activity, exact: true }).click()
    await page.getByRole('button', { name: exitCase.exit }).click()

    await expect(page.getByRole('heading', { name: /Ready for your next adventure/ })).toBeVisible()
    await expect(page.getByText(exitCase.status)).toBeVisible()
    await expect(page.getByText('No scores yet')).toBeVisible()
    expectNoBrowserErrors()
  })
}

test('Kindergarten writing automatically plays and replays a cached Mandarin recording', async ({ page }) => {
  const expectNoBrowserErrors = watchForUnexpectedBrowserErrors(page)
  await page.addInitScript(() => {
    const promptAudioPlays: string[] = []
    Object.defineProperty(window, '__promptAudioPlays', { value: promptAudioPlays })
    HTMLMediaElement.prototype.play = function () {
      promptAudioPlays.push(this.src)
      return Promise.resolve()
    }
  })

  await page.goto('/kindergarten-learning-lab.html')
  await selectWeek8(page)
  await page.getByRole('button', { name: /Enter the Dojo/ }).click()
  await page.getByRole('button', { name: 'Writing characters', exact: true }).click()

  await expect.poll(() => page.evaluate(() => (window as Window & { __promptAudioPlays: string[] }).__promptAudioPlays.length)).toBe(1)
  const firstSource = await page.evaluate(() => (window as Window & { __promptAudioPlays: string[] }).__promptAudioPlays[0])
  expect(firstSource).toMatch(/\/audio\/kindergarten\/u[0-9a-f]+\.wav$/)
  await expect(page.getByText('Prompt audio plays automatically · You can replay it anytime')).toBeVisible()

  await page.getByRole('button', { name: 'Replay sequence' }).click()
  await expect.poll(() => page.evaluate(() => (window as Window & { __promptAudioPlays: string[] }).__promptAudioPlays.length)).toBe(2)
  expectNoBrowserErrors()
})

test('Kindergarten Spirit Realm writing automatically plays and replays its cached mastery word', async ({ page }) => {
  const expectNoBrowserErrors = watchForUnexpectedBrowserErrors(page)
  await page.addInitScript(() => {
    const promptAudioPlays: Array<{ source: string; rate: number }> = []
    Object.defineProperty(window, '__masteryAudioPlays', { value: promptAudioPlays })
    HTMLMediaElement.prototype.play = function () {
      promptAudioPlays.push({ source: this.src, rate: this.playbackRate })
      return Promise.resolve()
    }
  })

  await page.goto('/kindergarten-learning-lab.html')
  await selectWeek8(page)
  await page.getByRole('button', { name: /Enter the Spirit Realm/ }).click()
  await page.getByRole('button', { name: 'Writing mastery warmup', exact: true }).click()

  await expect.poll(() => page.evaluate(() => (
    window as Window & { __masteryAudioPlays: Array<{ source: string; rate: number }> }
  ).__masteryAudioPlays.length)).toBe(1)
  const firstPlayback = await page.evaluate(() => (
    window as Window & { __masteryAudioPlays: Array<{ source: string; rate: number }> }
  ).__masteryAudioPlays[0])
  expect(firstPlayback.source).toMatch(/\/audio\/kindergarten\/u[0-9a-f]+(?:-u[0-9a-f]+)*\.wav$/)
  await expect(page.getByText('The word played automatically.')).toBeVisible()

  await page.getByRole('button', { name: 'Hear the word' }).click()
  await expect.poll(() => page.evaluate(() => (
    window as Window & { __masteryAudioPlays: Array<{ source: string; rate: number }> }
  ).__masteryAudioPlays.length)).toBe(2)
  expectNoBrowserErrors()
})

test('Kindergarten Spirit Realm reading plays the child before the cached word and then allows scoring', async ({ page }) => {
  const expectNoBrowserErrors = watchForUnexpectedBrowserErrors(page)
  await page.addInitScript(() => {
    const playbackOrder: string[] = []
    Object.defineProperty(window, '__masteryReadingPlaybackOrder', { value: playbackOrder })

    class FakeMediaRecorder {
      static isTypeSupported() { return true }
      state = 'inactive'
      mimeType = 'audio/webm'
      ondataavailable: null | ((event: { data: Blob }) => void) = null
      onerror: null | ((event: Event) => void) = null
      onstop: null | (() => void) = null

      start() { this.state = 'recording' }
      stop() {
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob(['child-reading'], { type: this.mimeType }) })
        this.onstop?.()
      }
    }

    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: FakeMediaRecorder })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { async getUserMedia() { return { getTracks: () => [{ stop() {} }] } } },
    })
    URL.createObjectURL = () => '/audio/kindergarten/u7238-u7238.wav?child-recording'
    URL.revokeObjectURL = () => undefined

    HTMLMediaElement.prototype.play = function () {
      playbackOrder.push(`child:${this.src}`)
      window.setTimeout(() => this.dispatchEvent(new Event('ended')), 10)
      return Promise.resolve()
    }

    class FakeAudio {
      src = ''
      playbackRate = 1
      preload = ''
      readonly listeners = new Map<string, Set<() => void>>()

      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        const listeners = this.listeners.get(type) || new Set<() => void>()
        listeners.add(listener as () => void)
        this.listeners.set(type, listeners)
      }
      removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        this.listeners.get(type)?.delete(listener as () => void)
      }
      load() {}
      play() {
        playbackOrder.push(`model:${this.src}`)
        window.setTimeout(() => {
          for (const listener of this.listeners.get('ended') || []) listener()
        }, 10)
        return Promise.resolve()
      }
    }

    Object.defineProperty(window, 'Audio', { configurable: true, value: FakeAudio })
  })

  await page.goto('/kindergarten-learning-lab.html')
  await selectWeek8(page)
  await page.getByRole('button', { name: /Enter the Spirit Realm/ }).click()
  await page.getByRole('button', { name: 'Reading mastery', exact: true }).click()

  await page.getByRole('button', { name: 'Record my reading' }).click()
  await page.getByRole('button', { name: 'Stop recording' }).click()
  await page.getByRole('button', { name: 'Compare my reading' }).click()

  await expect(page.getByText('Did your reading match the example?')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (
    window as Window & { __masteryReadingPlaybackOrder: string[] }
  ).__masteryReadingPlaybackOrder.length)).toBe(2)
  const playbackOrder = await page.evaluate(() => (
    window as Window & { __masteryReadingPlaybackOrder: string[] }
  ).__masteryReadingPlaybackOrder)
  expect(playbackOrder[0]).toBe('child:http://127.0.0.1:5185/audio/kindergarten/u7238-u7238.wav?child-recording')
  expect(playbackOrder[1]).toMatch(/^model:http:\/\/127\.0\.0\.1:5185\/audio\/kindergarten\/u[0-9a-f]+(?:-u[0-9a-f]+)*\.wav$/)

  await page.getByRole('button', { name: 'Yes' }).click()
  await expect(page.getByText(/Reading Mastery · 2 of 9/)).toBeVisible()
  expectNoBrowserErrors()
})

test('Kindergarten cached Mandarin audio is served and accepted by the browser media engine', async ({ page }) => {
  const expectNoBrowserErrors = watchForUnexpectedBrowserErrors(page)
  await page.goto('/kindergarten-learning-lab.html')
  await selectWeek8(page)
  await page.getByRole('button', { name: /Enter the Dojo/ }).click()
  const audioResponse = page.waitForResponse((response) => /\/audio\/kindergarten\/u[0-9a-f]+\.wav$/.test(response.url()))
  await page.getByRole('button', { name: 'Writing characters', exact: true }).click()

  const response = await audioResponse
  expect([200, 206]).toContain(response.status())
  expect(response.headers()['content-type']).toContain('audio/wav')
  await expect(page.getByText('Prompt audio plays automatically · You can replay it anytime')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expectNoBrowserErrors()
})

test('Kindergarten writing exposes an actionable error when browser playback fails', async ({ page }) => {
  const expectNoBrowserErrors = watchForUnexpectedBrowserErrors(page)
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      return Promise.reject(new DOMException('Playback was blocked.', 'NotAllowedError'))
    }
  })

  await page.goto('/kindergarten-learning-lab.html')
  await selectWeek8(page)
  await page.getByRole('button', { name: /Enter the Dojo/ }).click()
  await page.getByRole('button', { name: 'Writing characters', exact: true }).click()

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('The Mandarin recording could not play.')
  await expect(alert.getByRole('button', { name: 'Try audio again' })).toBeVisible()
  const timer = page.locator('.timer')
  const blockedTimerValue = await timer.innerText()
  await page.waitForTimeout(1_100)
  await expect(timer).toHaveText(blockedTimerValue)
  expectNoBrowserErrors()
})

test('Kindergarten Reading Final Boss confirms and exits without retaining a score', async ({ page }) => {
  const expectNoBrowserErrors = watchForUnexpectedBrowserErrors(page)

  await page.goto('/kindergarten-learning-lab.html')
  await selectWeek7(page)
  await page.getByRole('button', { name: /The Final Boss Test/ }).click()
  await page.getByRole('button', { name: 'Reading Test', exact: true }).click()
  await page.getByRole('button', { name: 'Exit without saving' }).click()

  const confirmation = page.getByRole('dialog', { name: 'Exit without saving?' })
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole('button', { name: 'Exit without saving' }).click()

  await expect(page.getByRole('heading', { name: /Ready for your next adventure/ })).toBeVisible()
  await expect(page.getByText('Final Boss reading exited. Temporary recordings and provisional answers were discarded.')).toBeVisible()
  await expect(page.getByText('No scores yet')).toBeVisible()
  expectNoBrowserErrors()
})
