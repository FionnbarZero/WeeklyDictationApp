import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices() {
          return []
        },
        speak(utterance: SpeechSynthesisUtterance) {
          setTimeout(() => {
            utterance.onstart?.({} as SpeechSynthesisEvent)
            utterance.onend?.({} as SpeechSynthesisEvent)
          }, 0)
        },
      },
    })
  })
})

async function finishMemory(page: Page) {
  await page.getByRole('button', { name: 'Ninja Skills', exact: true }).click()
  await page.getByRole('button', { name: 'Memory Lanterns', exact: true }).click()
  const cards = page.locator('.lg-memory-card')
  await expect(cards.first()).toBeVisible()
  // Inspect rendered card faces to deterministically exercise a complete game.
  const faces = await cards.locator('.lg-card-face b').allTextContents()
  const uniqueFaces = [...new Set(faces)]
  for (const face of uniqueFaces) {
    const indices = faces.flatMap((value, index) => (value === face ? [index] : []))
    expect(indices).toHaveLength(2)
    await expect(cards.nth(indices[0])).toBeEnabled()
    await cards.nth(indices[0]).click()
    await cards.nth(indices[1]).click()
    if (face === uniqueFaces[uniqueFaces.length - 1])
      await expect(page.getByRole('button', { name: 'Back to Ninja Skills', exact: true })).toBeVisible()
    else await expect(cards.nth(indices[0])).toHaveClass(/is-matched/)
  }
  await page
    .getByRole('button', { name: /Done|Finish|Back to/ })
    .last()
    .click()
  await expect(page.getByRole('heading', { name: 'Practice your Ninja Skills' })).toBeVisible()
  return new Set(faces).size
}

for (const [slug, grade, childId] of [
  ['kindergarten', 'Kindergarten', 'preview-0'],
  ['grade2', 'Grade 2', 'preview-1'],
  ['grade5', 'Grade 5', 'preview-2'],
]) {
  test(`${grade}: source, game scores, repeat totals, reload, and child isolation`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`/family-beta-preview.html?grade=${slug}`)
    const frame = page.frameLocator('iframe')
    await expect(frame.getByRole('heading', { name: /Ready for your next/ })).toBeVisible()
    await expect(page.getByLabel('Child profile')).toHaveValue(childId)
    await page.screenshot({ path: `reconciliation-test-results/${slug}-preview.png`, fullPage: true })
    await expect(page.getByLabel('Practice week').locator('option')).not.toHaveCount(1)
    const first = await finishMemory(page)
    const second = await finishMemory(page)
    await page.getByRole('button', { name: 'Progress', exact: true }).click()
    await expect(page.getByRole('cell', { name: `${first + second} / ${first + second}`, exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: '2', exact: true })).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: 'Progress', exact: true }).click()
    await expect(page.getByRole('cell', { name: `${first + second} / ${first + second}`, exact: true })).toBeVisible()
    page.on('dialog', (dialog) => dialog.accept())
    await page.getByLabel('Child profile').selectOption(childId === 'preview-0' ? 'preview-1' : 'preview-0')
    await expect(page.getByText('No completed scores yet.')).toBeVisible()
    expect(errors).toEqual([])
  })

  test(`${grade}: past week and tablet layout are reviewable`, async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto(`/family-beta-preview.html?grade=${slug}`)
    await expect(page.frameLocator('iframe').getByRole('heading', { name: /Ready for your next/ })).toBeVisible()
    page.on('dialog', (dialog) => dialog.accept())
    const options = await page.getByLabel('Practice week').locator('option').all()
    const past = await options[options.length - 1].getAttribute('value')
    await page.getByLabel('Practice week').selectOption(past!)
    await expect(page.locator('iframe')).toHaveAttribute('src', new RegExp(`week=${past}`))
    await expect(page.frameLocator('iframe').getByRole('heading', { name: /Ready for your next/ })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `reconciliation-test-results/${slug}-tablet.png`, fullPage: true })
  })
}

test('Kindergarten: all 14 Unit 1 writing targets save and survive reload without current-week targets', async ({ page }) => {
  await page.goto('/family-beta-preview.html?grade=kindergarten')
  const frame = page.frameLocator('iframe')
  await frame.getByRole('button', { name: /The Final Boss Test/ }).click()
  await frame.getByRole('button', { name: 'Writing Test', exact: true }).click()
  const targets: string[] = []
  for (let i = 0; i < 14; i++) {
    targets.push((await frame.locator('[data-report-target]').getAttribute('data-report-target'))!)
    await frame.getByRole('button', { name: 'Skip Timer' }).click()
  }
  expect(targets.sort()).toEqual(Array.from({ length: 14 }, (_, i) => `__kindergarten-unit-1-review-lab__:tier-1:${i + 1}`).sort())
  const rows = frame.locator('.deferred-review-row')
  await expect(rows).toHaveCount(14)
  for (const word of ['一', '二', '三', '人', '四', '五', '六', '心', '七', '八', '水', '九', '十', '白']) {
    await expect(rows.getByText(word, { exact: true })).toBeVisible()
  }
  await rows.nth(0).getByRole('button', { name: 'Yes', exact: true }).click()
  for (let i = 1; i < 14; i++) await rows.nth(i).getByRole('button', { name: 'Not yet', exact: true }).click()
  await frame.getByRole('button', { name: 'Submit final review' }).click()
  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await expect(page.getByRole('cell', { name: '1 / 14', exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await expect(page.getByRole('cell', { name: '1 / 14', exact: true })).toBeVisible()
})

for (const [slug, grade, count] of [
  ['grade2', 'Grade 2', 9],
  ['grade5', 'Grade 5', 5],
] as const) {
  test(`${grade}: complete writing review saves its exact score`, async ({ page }) => {
    await page.goto(`/family-beta-preview.html?grade=${slug}`)
    const frame = page.frameLocator('iframe')
    await frame.getByRole('button', { name: /The Final Boss Test/ }).click()
    await frame.getByRole('button', { name: 'Writing Test', exact: true }).click()
    await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
    for (let i = 0; i < count; i++) await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
    const rows = frame.locator('.deferred-review-row')
    await expect(rows).toHaveCount(count)
    for (let i = 0; i < count; i++)
      await rows
        .nth(i)
        .getByRole('button', { name: i === 0 ? 'Not yet' : 'Yes', exact: true })
        .click()
    await frame.getByRole('button', { name: 'Submit final review' }).click()
    await page.getByRole('button', { name: 'Progress', exact: true }).click()
    await expect(page.getByRole('cell', { name: `${count - 1} / ${count}`, exact: true })).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: 'Progress', exact: true }).click()
    await expect(page.getByRole('cell', { name: `${count - 1} / ${count}`, exact: true })).toBeVisible()
  })
}

for (const [slug, grade] of [
  ['kindergarten', 'Kindergarten'],
  ['grade2', 'Grade 2'],
  ['grade5', 'Grade 5'],
]) {
  test(`${grade}: reading mastery saves a separate reading result without retaining audio`, async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => {
            throw new DOMException('Microphone permission was not granted.', 'NotAllowedError')
          },
        },
      })
    })
    await page.goto(`/family-beta-preview.html?grade=${slug}`)
    const frame = page.frameLocator('iframe')
    await frame.getByRole('button', { name: /Enter the Spirit Realm/ }).click()
    await frame.getByRole('button', { name: /Reading (mastery|warmup)/i }).click()
    for (let i = 0; i < 30; i++) {
      if (await frame.getByRole('button', { name: 'Finish', exact: true }).isVisible()) break
      await frame.getByRole('button', { name: 'Record my reading', exact: true }).click()
      await frame.getByRole('button', { name: 'Continue without recording', exact: true }).click()
      await frame.getByRole('button', { name: 'Yes', exact: true }).click()
    }
    await expect(frame.getByRole('button', { name: 'Finish', exact: true })).toBeVisible()
    await frame.getByRole('button', { name: 'Finish', exact: true }).click()
    await page.getByRole('button', { name: 'Progress', exact: true }).click()
    await expect(page.getByRole('table')).toBeVisible()
    const records = await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith('family-beta-preview-results-v1:'))
        .map((k) => JSON.parse(localStorage.getItem(k)!)),
    )
    expect(records).toHaveLength(1)
    expect(records[0].channel).toBe('reading')
    expect(records[0].attempted).toBeGreaterThan(0)
    const mastery = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('family-beta-mastery-v1:')).map(k => JSON.parse(localStorage.getItem(k)!)))
    expect(mastery).toHaveLength(1)
    expect(mastery[0].channel).toBe('reading')
    expect(mastery[0].applied).toHaveLength(records[0].attempted)
    expect(Object.keys(records[0]).sort()).toEqual(
      [
        'schema',
        'id',
        'childId',
        'grade',
        'activity',
        'channel',
        'datasetIds',
        'correct',
        'attempted',
        'completedAt',
        'day',
      ].sort(),
    )
  })
}
