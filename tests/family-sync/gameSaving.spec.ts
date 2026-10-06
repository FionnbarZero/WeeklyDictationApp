import { expect, type Page, test } from '@playwright/test'
import { grades, installFamilyFixtures } from './fixtures.ts'

test.beforeEach(async ({ page }) => installFamilyFixtures(page))

async function completeLanterns(page: Page) {
  await page.getByRole('button', { name: 'Ninja Skills', exact: true }).click()
  await page.getByRole('button', { name: 'Memory Lanterns', exact: true }).click()
  const cards = page.frameLocator('iframe:visible').locator('.lg-memory-card')
  await expect(cards.first()).toBeVisible()
  const faces = await cards.locator('.lg-card-face b').allTextContents()
  const unique = [...new Set(faces)]
  for (const face of unique) {
    const indices = faces.flatMap((text, i) => (text === face ? [i] : []))
    expect(indices).toHaveLength(2)
    await expect(cards.nth(indices[0])).toBeEnabled()
    await cards.nth(indices[0]).click()
    await cards.nth(indices[1]).click()
    if (face !== unique[unique.length - 1]) await expect(cards.nth(indices[0])).toHaveClass(/is-matched/)
  }
  await expect(page.frameLocator('iframe:visible').getByRole('button', { name: 'Back to Ninja Skills', exact: true })).toBeVisible()
  return new Set(faces).size
}
async function results(page: Page) {
  return page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('family-beta-preview-results-v1:'))
      .map((key) => JSON.parse(localStorage.getItem(key)!)),
  )
}

for (const [slug, grade, childId] of grades) {
  test(`${grade}: canonical root selects child and game result survives reload`, async ({ page }) => {
    await page.goto(`/?grade=${slug}`)
    await expect(page).toHaveURL(new RegExp(`/family-beta-preview\\?grade=${slug}$`))
    await expect(page.getByLabel('Child profile')).toHaveValue(childId)
    await expect(page.frameLocator('iframe:visible').getByRole('heading', { name: /Ready for your next/ })).toBeVisible()
    const attempted = await completeLanterns(page)
    await page.frameLocator('iframe:visible').getByRole('button', { name: 'Back to Ninja Skills', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Practice your Ninja Skills' })).toBeVisible()
    const saved = await results(page)
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ childId, grade, activity: 'Memory Lanterns', correct: attempted, attempted })
    await page.reload()
    await page.getByRole('button', { name: 'Progress', exact: true }).click()
    await expect(page.getByRole('cell', { name: `${attempted} / ${attempted}`, exact: true })).toBeVisible()
    expect(await results(page)).toEqual(saved)
  })
}

test('HTML-preserving alias completes and saves through the same package', async ({ page }) => {
  await page.goto('/alias/family-beta-preview.html?grade=grade5')
  const attempted = await completeLanterns(page)
  await page.frameLocator('iframe:visible').getByRole('button', { name: 'Back to Ninja Skills', exact: true }).click()
  expect(await results(page)).toHaveLength(1)
  await page.reload()
  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await expect(page.getByRole('cell', { name: `${attempted} / ${attempted}`, exact: true })).toBeVisible()
})

test('missing child context keeps completed game open for retry', async ({ page }) => {
  await page.goto('/family-beta-preview.html?grade=grade5')
  await completeLanterns(page)
  const profile = await page.evaluate(() => sessionStorage.getItem('family-beta-preview-selected-v1'))
  await page.evaluate(() => { sessionStorage.removeItem('family-beta-preview-selected-v1') })
  await page.locator('iframe:visible').evaluate(frame => frame.removeAttribute('data-family-profile'))
  await page.frameLocator('iframe:visible').getByRole('button', { name: 'Back to Ninja Skills', exact: true }).click()
  await expect(page.frameLocator('iframe:visible').getByRole('button', { name: 'Back to Ninja Skills', exact: true })).toBeVisible()
  await expect(page.frameLocator('iframe:visible').getByRole('alert')).toContainText('Keep the game open')
  expect(await results(page)).toHaveLength(0)
  await page.evaluate((profile) => sessionStorage.setItem('family-beta-preview-selected-v1', profile!), profile)
  await page.locator('iframe:visible').evaluate((frame, profile) => frame.setAttribute('data-family-profile', profile!), profile)
  await page.frameLocator('iframe:visible').getByRole('button', { name: 'Back to Ninja Skills', exact: true }).click()
  expect(await results(page)).toHaveLength(1)
})

test('partial save retries the same attempt without a duplicate or closing early', async ({ page }) => {
  await page.goto('/alias/family-beta-preview.html?grade=grade5')
  await completeLanterns(page)
  await page.frameLocator('iframe:visible').locator('body').evaluate(() => {
    const original = Storage.prototype.setItem
    let failed = false
    Storage.prototype.setItem = function (key, data) {
      if (!failed && key.startsWith('family-beta-preview-results-v1:')) {
        failed = true
        throw new Error('Synthetic interrupted ledger write')
      }
      return original.call(this, key, data)
    }
  })
  const done = page.frameLocator('iframe:visible').getByRole('button', { name: 'Back to Ninja Skills', exact: true })
  await done.click()
  await expect(done).toBeVisible()
  await expect(page.frameLocator('iframe:visible').getByRole('alert')).toContainText('Keep the game open')
  const pending = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('family-beta-preview-pending-v1:'))
      .map((key) => JSON.parse(localStorage.getItem(key)!)),
  )
  expect(pending).toHaveLength(1)
  await done.click()
  await expect(page.getByRole('heading', { name: 'Practice your Ninja Skills' })).toBeVisible()
  const saved = await results(page)
  expect(saved).toHaveLength(1)
  expect(saved[0]).toEqual(pending[0])
})

test('a ledger write must be read back before presenting completion', async ({ page }) => {
  await page.goto('/family-beta-preview?grade=grade5')
  await completeLanterns(page)
  await page.frameLocator('iframe:visible').locator('body').evaluate(() => {
    const original = Storage.prototype.setItem
    let ignored = false
    Storage.prototype.setItem = function (key, data) {
      if (!ignored && key.startsWith('family-beta-preview-results-v1:')) {
        ignored = true
        return
      }
      return original.call(this, key, data)
    }
  })
  const done = page.frameLocator('iframe:visible').getByRole('button', { name: 'Back to Ninja Skills', exact: true })
  await done.click()
  await expect(done).toBeVisible()
  await expect(page.frameLocator('iframe:visible').getByRole('alert')).toContainText('could not be confirmed on this device')
  expect(await results(page)).toHaveLength(0)
  await done.click()
  await expect(page.getByRole('heading', { name: 'Practice your Ninja Skills' })).toBeVisible()
  expect(await results(page)).toHaveLength(1)
})

for (const [entry, slug, childId] of [
  ['/kindergarten-learning-lab.html', 'kindergarten', 'synthetic-k'],
  ['/index.html?grade=grade2', 'grade2', 'synthetic-g2'],
  ['/grade5-learning-hub.html', 'grade5', 'synthetic-g5'],
]) {
  test(`${slug}: packaged grade entry redirects into the selected family context`, async ({ page }) => {
    await page.goto(entry)
    await expect(page).toHaveURL(new RegExp(`/family-beta-preview\\?grade=${slug}$`))
    await expect(page.getByLabel('Child profile')).toHaveValue(childId)
    await expect(page.frameLocator('iframe:visible').getByRole('heading', { name: /Ready for your next/ })).toBeVisible()
  })
}

for (const [slug, grade, childId] of grades) {
  test(`${grade}: embedded writing retains selected child and saves reviewed work`, async ({ page }) => {
    await page.goto(`/family-beta-preview?grade=${slug}`)
    await expect(page.getByLabel('Child profile')).toHaveValue(childId)
    if (slug === 'grade2') {
      page.once('dialog', (dialog) => dialog.accept())
      await page.getByLabel('Practice week').selectOption('2026-09-21')
    }
    const frame = page.frameLocator('iframe:visible')
    await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
    await frame
      .getByRole('button', { name: slug === 'kindergarten' ? 'Writing characters' : 'Learn to Write', exact: true })
      .click()
    if (slug !== 'kindergarten') await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
    for (let i = 0; i < 4; i++) {
      await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
      await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
    }
    await frame.getByRole('button', { name: 'Done for today', exact: true }).click()
    await expect.poll(async () => (await results(page)).length).toBe(1)
    expect((await results(page))[0]).toMatchObject({ childId, grade, channel: 'writing', correct: 1, attempted: 1 })
  })
}

test('query flags in an unrelated host do not activate family behavior', async ({ page }) => {
  await page.goto('/testing.html')
  await page.evaluate(() => {
    sessionStorage.setItem(
      'family-beta-preview-selected-v1',
      JSON.stringify({ id: 'synthetic-g5', nickname: 'Grade 5', grade: 'Grade 5', active: true }),
    )
    const frame = document.createElement('iframe')
    frame.title = 'Standalone Grade 5'
    frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:1000'
    frame.src = '/grade5-learning-hub.html?family-preview=1'
    document.body.append(frame)
  })
  const frame = page.frameLocator('iframe[title="Standalone Grade 5"]')
  await expect(frame.locator('#hub-status')).toHaveText(
    'Loaded the validated Grade 5 fixture. Tier 1 writing and Tier 2 recorded-reading pathways are ready for local testing.',
  )
  await expect(frame.locator('html')).not.toHaveClass(/family-beta-frame/)
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await frame.getByRole('button', { name: 'Learn to Write', exact: true }).click()
  await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
  for (let i = 0; i < 4; i++) {
    await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
    await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
  }
  await frame.getByRole('button', { name: 'Done for today', exact: true }).click()
  await expect(frame.locator('#hub-status')).toContainText('This development lab does not save progress yet.')
  expect(await results(page)).toHaveLength(0)
})
