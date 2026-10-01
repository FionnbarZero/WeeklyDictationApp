import { expect, test } from '@playwright/test'

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
