import { expect, type Page, test } from '@playwright/test'
import { grades, installFamilyFixtures } from './fixtures.ts'

test.beforeEach(async ({ page }) => installFamilyFixtures(page))

async function writing(page: Page, slug: string) {
  await page.goto(`/?grade=${slug}`)
  if (slug === 'grade2') {
    page.on('dialog', (d) => d.accept())
    await page.getByLabel('Practice week').selectOption('2026-09-21')
  }
  const frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await frame
    .getByRole('button', { name: slug === 'kindergarten' ? 'Writing characters' : 'Learn to Write', exact: true })
    .click()
  if (slug !== 'kindergarten') await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
  await expect(frame.getByRole('timer')).toBeVisible()
  await expect(frame.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
  return frame
}

for (const [slug, grade] of grades) {
  test(`${grade}: report pauses the current timer and closing resumes it`, async ({ page }) => {
    const frame = await writing(page, slug)
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    const remaining = await frame.getByRole('timer').innerText()
    await page.waitForTimeout(2200)
    await expect(frame.getByRole('timer')).toHaveText(remaining)
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await expect(frame.getByRole('timer')).not.toHaveText(remaining)
  })

  test(`${grade}: navigation preserves the same activity and temporary handwriting`, async ({ page }) => {
    const frame = await writing(page, slug)
    await frame.getByRole('button', { name: 'Pause', exact: true }).click()
    const pad = frame.locator('svg.skywriting-pad')
    const box = await pad.boundingBox()
    if (!box) throw new Error('Missing writing pad')
    await page.mouse.move(box.x + 40, box.y + 40)
    await page.mouse.down()
    await page.mouse.move(box.x + 90, box.y + 90, { steps: 5 })
    await page.mouse.up()
    const ink = await frame.locator('.skywriting-stroke').getAttribute('points')
    expect(ink).toBeTruthy()
    await frame.locator('body').evaluate((body) => {
      body.dataset.continuityProbe = 'same-document'
    })
    await page.getByRole('button', { name: 'Progress', exact: true }).click()
    await page.waitForTimeout(1200)
    await page.getByRole('button', { name: 'Activities', exact: true }).click()
    await expect(frame.locator('body')).toHaveAttribute('data-continuity-probe', 'same-document')
    await expect(frame.getByRole('timer')).toBeVisible()
    await expect(frame.locator('.skywriting-stroke')).toHaveAttribute('points', ink!)
    await expect(frame.getByRole('button', { name: 'Resume', exact: true })).toBeVisible()
  })

  test(`${grade}: a sync failure keeps the activity available and reviewed work queued`, async ({ page }) => {
    const frame = await writing(page, slug)
    await frame.locator('body').evaluate((body) => {
      body.dataset.continuityProbe = 'same-document'
    })
    await page.route('**/firestore.googleapis.com/**', (route) => route.abort('internetdisconnected'))
    await frame
      .locator('body')
      .evaluate(() => parent.postMessage({ type: 'family-beta-result-ready' }, location.origin))
    await expect(page.getByRole('alert').first()).toBeVisible()
    await expect(frame.locator('body')).toHaveAttribute('data-continuity-probe', 'same-document')
    await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
    await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
    for (let i = 0; i < 3; i++) {
      await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
      await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
    }
    await frame.getByRole('button', { name: 'Done for today', exact: true }).click()
    const pending = () =>
      page.evaluate(() =>
        Object.keys(localStorage)
          .filter((key) => key.startsWith('family-beta-preview-pending-v1:'))
          .map((key) => JSON.parse(localStorage.getItem(key)!)),
      )
    expect(await pending()).toHaveLength(1)
    expect((await pending())[0]).toMatchObject({ grade, channel: 'writing', correct: 1, attempted: 1 })
    await page.unroute('**/firestore.googleapis.com/**')
    await page.getByRole('button', { name: 'Retry saving', exact: true }).click()
    await expect.poll(pending).toEqual([])
  })
}

test('manual pause survives reporting, inner Exit pauses, and discard needs confirmation', async ({ page }) => {
  const frame = await writing(page, 'grade5')
  await frame.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  const remaining = await frame.getByRole('timer').innerText()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1200)
  await expect(frame.getByRole('timer')).toHaveText(remaining)
  await frame.getByRole('button', { name: 'Exit practice', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your paused work' })).toBeVisible()
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Discard unfinished activity', exact: true }).click()
  await page.getByRole('button', { name: 'Resume Grade 5 activity', exact: true }).click()
  await expect(frame.getByRole('timer')).toHaveText(remaining)
  await frame.getByRole('button', { name: 'Exit practice', exact: true }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Discard unfinished activity', exact: true }).click()
  await expect(frame.getByRole('heading', { name: /Ready for your next/ })).toBeVisible()
})

test('changing weeks and children keeps distinct owners and restores the original document', async ({ page }) => {
  const frame = await writing(page, 'grade5')
  await frame.getByRole('button', { name: 'Pause', exact: true }).click()
  await frame.locator('body').evaluate((body) => {
    body.dataset.ownerProbe = 'original-grade5'
  })
  const week = await page.locator('iframe:visible').getAttribute('data-family-week')
  await page.getByLabel('Practice week').selectOption('2026-09-21')
  await expect(frame.getByRole('heading', { name: /Ready for your next/ })).toBeVisible()
  await page.getByLabel('Child profile').selectOption('synthetic-k')
  await expect(frame.getByRole('heading', { name: /Ready for your next/ })).toBeVisible()
  await page.getByLabel('Child profile').selectOption('synthetic-g5')
  await expect(frame.locator('body')).toHaveAttribute('data-owner-probe', 'original-grade5')
  await expect(frame.getByRole('button', { name: 'Resume', exact: true })).toBeVisible()
  // Selecting the explicit date of the current week must not create a second owner.
  await page.getByLabel('Practice week').selectOption(week!)
  await expect(frame.locator('body')).toHaveAttribute('data-owner-probe', 'original-grade5')
  expect(await page.locator('iframe[data-family-slot]').count()).toBe(3)
  // Even a stale mutable selector cannot reassign this frame's reviewed response.
  await page.evaluate(() =>
    sessionStorage.setItem(
      'family-beta-preview-selected-v1',
      JSON.stringify({ id: 'synthetic-k', nickname: 'K', grade: 'Kindergarten', active: true }),
    ),
  )
  for (let i = 0; i < 4; i++) {
    await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
    await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
  }
  await frame.getByRole('button', { name: 'Done for today', exact: true }).click()
  const results = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith('family-beta-preview-results-v1:'))
      .map((k) => JSON.parse(localStorage.getItem(k)!)),
  )
  expect(results).toHaveLength(1)
  expect(results[0]).toMatchObject({ childId: 'synthetic-g5', grade: 'Grade 5', correct: 1, attempted: 1 })
})

test('a game feedback delay stays paused behind reporting and navigation', async ({ page }) => {
  await page.goto('/?grade=grade5')
  await page.getByRole('button', { name: 'Ninja Skills', exact: true }).click()
  await page.getByRole('button', { name: 'Memory Lanterns', exact: true }).click()
  const frame = page.frameLocator('iframe:visible')
  const cards = frame.locator('.lg-memory-card')
  await expect(cards.first()).toBeVisible()
  const faces = await cards.locator('.lg-card-face b').allTextContents()
  const second = faces.findIndex((face) => face !== faces[0])
  await cards.nth(0).click()
  await cards.nth(second).click()
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  const before = await cards.nth(0).getAttribute('class')
  await page.waitForTimeout(1800)
  await expect(cards.nth(0)).toHaveAttribute('class', before!)
  await expect(frame.locator('html')).toHaveAttribute('data-activity-paused', 'true')
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  await expect(cards.nth(0)).not.toHaveAttribute('class', before!)
  await frame.getByRole('button', { name: 'Exit learning module', exact: true }).click()
  // Durable round discovery also supplies a resume button in the game grid.
  // This check specifically exercises the still-mounted, paused activity.
  const pausedWork = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Your paused work', exact: true }) })
  await expect(pausedWork.getByRole('button', { name: 'Resume Memory Lanterns', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Activities', exact: true }).click()
  await page.getByRole('button', { name: 'Ninja Skills', exact: true }).click()
  await pausedWork.getByRole('button', { name: 'Resume Memory Lanterns', exact: true }).click()
  await expect(cards.first()).toBeVisible()
})
