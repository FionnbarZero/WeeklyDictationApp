import { expect, test } from './fixtures.ts'
import { watchForUnexpectedBrowserErrors } from './prototypeSupport.ts'

test.use({ viewport: { width: 390, height: 844 }, permissions: [] })

type ExitCase = {
  section: RegExp
  activity: string
  exit: 'Exit game' | 'Exit practice' | 'Exit reading'
  status: string
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

for (const exitCase of exitCases) {
  test(`Kindergarten ${exitCase.activity} exits back to the Learning Hub without crashing`, async ({ page }) => {
    const expectNoBrowserErrors = watchForUnexpectedBrowserErrors(page)

    await page.goto('/kindergarten-learning-lab.html')
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

test('Kindergarten cached Mandarin audio is served and accepted by the browser media engine', async ({ page }) => {
  const expectNoBrowserErrors = watchForUnexpectedBrowserErrors(page)
  await page.goto('/kindergarten-learning-lab.html')
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
