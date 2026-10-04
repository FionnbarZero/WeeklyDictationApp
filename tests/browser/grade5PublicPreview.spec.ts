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

test('the public Grade 5 preview opens its required writing Warmup and current reading Acquisition', async ({
  page,
}) => {
  await openSection(page, 'Enter the Dojo')

  await page.getByRole('button', { name: 'Learn to Write' }).click()
  await expect(page.getByRole('heading', { name: 'Warm up' })).toBeVisible()
  await expect(page.getByText('Required before this activity')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Skip Warmup' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Begin Warmup' }).click()
  await page.getByRole('button', { name: 'Type Chinese' }).click()
  const typedResponse = page.getByRole('textbox', { name: 'Type Chinese with a Pinyin keyboard' })
  await typedResponse.fill('bang zhu')
  await expect(page.getByRole('alert')).toHaveText(
    'Choose Chinese characters from your Pinyin keyboard before continuing.',
  )
  await typedResponse.fill('帮助')
  await expect(typedResponse).toHaveValue('帮助')
  await expect(typedResponse).toHaveAttribute('aria-invalid', 'false')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Exit practice' })).toBeVisible()
  await page.getByRole('button', { name: 'Exit practice' }).click()

  await page.getByRole('button', { name: 'Read the Words' }).click()
  await expect(page.getByRole('button', { name: 'Exit reading' })).toBeVisible()
  await expect(page.getByText(/Grade 5 required reading Warmup · progress is saved on this device/)).toBeVisible()
  await page.getByRole('button', { name: 'Exit reading' }).click()
})

test('the Spirit Realm reentry offers guided writing and reading plus both Test Review formats', async ({ page }) => {
  await openSection(page, 'Enter the Spirit Realm')
  await page.getByRole('button', { name: 'Reenter the Training Dojo' }).click()

  const writing = page.getByRole('button', { name: 'Relearn Writing · 8/31–9/4' })
  const reading = page.getByRole('button', { name: 'Relearn Reading · 8/31–9/4' })
  await expect(writing).toBeVisible()
  await expect(reading).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start Writing Test · 8/31–9/4' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start Reading Test · 8/31–9/4' })).toBeVisible()
  await expect(page.getByText(/guided practice or the collect-first Test Review format/i)).toBeVisible()

  await writing.click()
  await expect(page.getByRole('heading', { name: 'Warm up' })).toBeVisible()
  await page.getByRole('button', { name: 'Begin Warmup' }).click()
  await expect(page.getByRole('button', { name: 'Exit practice' })).toBeVisible()
  await page.getByRole('button', { name: 'Exit practice' }).click()

  await page.getByRole('button', { name: 'Reenter the Training Dojo' }).click()
  await page.getByRole('button', { name: 'Relearn Reading · 8/31–9/4' }).click()
  await expect(page.getByRole('button', { name: 'Exit reading' })).toBeVisible()
  await expect(page.getByText(/Grade 5 required reading Warmup · progress is saved on this device/)).toBeVisible()
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
  await expect(page.getByRole('button', { name: 'Exit reading' })).toBeVisible()
  await expect(page.getByText(/required Warmup/).first()).toBeVisible()
  await expect(page.getByText(/Grade 5 required reading Warmup · progress is saved on this device/)).toBeVisible()
})
