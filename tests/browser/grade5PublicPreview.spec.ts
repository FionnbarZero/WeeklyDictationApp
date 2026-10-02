import { expect, test } from './fixtures.ts'

async function openSection(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name: new RegExp(name, 'i') }).click()
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class FakeSpeechSynthesisUtterance {
      text: string
      lang = ''
      rate = 1
      onend: null | (() => void) = null
      onerror: null | (() => void) = null

      constructor(text: string) {
        this.text = text
      }
    }

    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: FakeSpeechSynthesisUtterance,
    })
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        speak(utterance: FakeSpeechSynthesisUtterance) {
          window.setTimeout(() => utterance.onend?.(), 0)
        },
      },
    })
  })

  await page.goto('grade5-learning-hub.html')
  await expect(page.getByRole('button', { name: /Enter the Dojo/i })).toBeVisible()
})

test('the public Grade 5 preview opens current writing and reading Acquisition', async ({ page }) => {
  await openSection(page, 'Enter the Dojo')

  await page.getByRole('button', { name: 'Learn to Write' }).click()
  await expect(page.getByRole('heading', { name: 'Warm up' })).toBeVisible()
  await page.getByRole('button', { name: 'Skip Warmup' }).click()
  await expect(page.getByRole('button', { name: 'Exit practice' })).toBeVisible()
  await page.getByRole('button', { name: 'Exit practice' }).click()

  await page.getByRole('button', { name: 'Read the Words' }).click()
  await expect(page.getByRole('button', { name: 'Exit reading' })).toBeVisible()
  await expect(page.getByText(/Grade 5 development reading · recording and results are not saved/)).toBeVisible()
  await page.getByRole('button', { name: 'Exit reading' }).click()
})

test('the Spirit Realm offers cohort-specific writing and reading reacquisition without changing its stage', async ({ page }) => {
  await openSection(page, 'Enter the Spirit Realm')
  await page.getByRole('button', { name: 'Reenter the Training Dojo' }).click()

  const writing = page.getByRole('button', { name: 'Relearn Writing · 8/31–9/4' })
  const reading = page.getByRole('button', { name: 'Relearn Reading · 8/31–9/4' })
  await expect(writing).toBeVisible()
  await expect(reading).toBeVisible()

  await writing.click()
  await expect(page.getByRole('heading', { name: 'Warm up' })).toBeVisible()
  await page.getByRole('button', { name: 'Skip Warmup' }).click()
  await expect(page.getByRole('button', { name: 'Exit practice' })).toBeVisible()
  await page.getByRole('button', { name: 'Exit practice' }).click()

  await page.getByRole('button', { name: 'Reenter the Training Dojo' }).click()
  await page.getByRole('button', { name: 'Relearn Reading · 8/31–9/4' }).click()
  await expect(page.getByRole('button', { name: 'Exit reading' })).toBeVisible()
  await expect(page.getByText(/Grade 5 development reading · recording and results are not saved/)).toBeVisible()
})

test('Reenter the Training Dojo offers collect-first writing and reading Test Review formats', async ({ page }) => {
  await openSection(page, 'Practice your Ninja Skills')
  await page.getByRole('button', { name: 'Reenter the Training Dojo' }).click()

  await expect(page.getByText(/guided practice or the collect-first Test Review format/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start Writing Dojo · 9/14–9/18' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start Reading Dojo · 9/14–9/18' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start Writing Test · 9/14–9/18' })).toBeVisible()
  const readingTest = page.getByRole('button', { name: 'Start Reading Test · 9/14–9/18' })
  await expect(readingTest).toBeVisible()

  await readingTest.click()
  await expect(page.getByText('Reading responses')).toBeVisible()
  await expect(page.getByText('Reading Test Review 1')).toBeVisible()
  await expect(page.getByText(/collect every response first/i)).toBeVisible()
})
