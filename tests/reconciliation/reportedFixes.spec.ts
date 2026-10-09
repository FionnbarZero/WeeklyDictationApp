import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test('Grade 5 cannot launch legacy activities while its validated activity rules are loading', async ({ page }) => {
  const snapshot = JSON.parse(
    await readFile(new URL('../../public/curriculum/beta/grade5.json', import.meta.url), 'utf8'),
  )
  let requests = 0
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/curriculum/beta/grade5.json', async (route) => {
    requests++
    // The family wrapper now fetches the authoritative snapshot once and
    // passes that validated source into its embedded activity frame. Holding
    // the first request exercises the real loading gate; waiting for a later
    // request would let the current route reach Spirit Realm before the gate
    // is engaged.
    if (requests === 1) await held
    await route.fulfill({ json: snapshot })
  })
  try {
    await page.goto('/family-beta-preview.html?grade=grade5')
    // The wrapper now waits before creating an activity iframe at all. This
    // keeps legacy activities unreachable while the authoritative snapshot is
    // pending, rather than rendering a second loading shell inside a frame.
    await expect(page.locator('iframe:visible')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Enter the Spirit Realm/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Report a problem', exact: true })).toBeVisible()
    release()
    const frame = page.frameLocator('iframe:visible')
    await frame.getByRole('button', { name: /Enter the Spirit Realm/ }).click()
    await expect(frame.getByRole('button', { name: 'Reading mastery warmup', exact: true })).toBeVisible()
    await expect(frame.getByRole('button', { name: 'Reading mastered-word games', exact: true })).toBeVisible()
  } finally {
    release()
  }
})

test('Grade 2 historical September 21 Dojo retains all seven reading targets', async ({ page }) => {
  await page.goto('/family-beta-preview.html?grade=grade2')
  await expect(page.getByLabel('Practice week').locator('option[value="2026-09-21"]')).toBeAttached()
  page.on('dialog', (dialog) => dialog.accept())
  await page.getByLabel('Practice week').selectOption('2026-09-21')
  const frame = page.frameLocator('iframe:visible')
  await expect(page.locator('iframe:visible')).toHaveAttribute('src', /week=2026-09-21/)
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await expect(frame.getByRole('button', { name: 'Read the Words', exact: true })).toBeVisible()
  await expect(frame.locator('.learning-hub-word-list')).toContainText([
    '比如部分更方便美好',
    '城市上班公园图书馆散步漂亮各种各样的',
  ])
})

test('Kindergarten path integrates games using previous relevant reading targets', async ({ page }) => {
  await page.goto('/family-beta-preview.html?grade=kindergarten')
  const frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: /Practice your Ninja Skills/ }).click()
  await expect(frame.getByRole('button', { name: 'Memory Lanterns', exact: true })).toBeVisible()
  await expect(frame.getByText('红色', { exact: true })).toBeVisible()
  await expect(frame.getByText('蓝色', { exact: true })).toBeVisible()
  await expect(frame.getByRole('button', { name: 'Needs teacher-approved content' }).first()).toBeDisabled()
  await frame.getByRole('button', { name: 'Listening Lily Pads', exact: true }).click()
  await expect(frame.locator('.k-word-choice')).toHaveText(['红色', '蓝色'])
  await frame.getByRole('button', { name: 'Exit game', exact: true }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Discard unfinished activity', exact: true }).click()
  await frame.getByRole('button', { name: /Practice your Ninja Skills/ }).click()
  await frame.getByRole('button', { name: 'Memory Lanterns', exact: true }).click()
  await expect(frame.locator('.lg-memory-card')).toHaveCount(4)
})

test('Grade 5 Dojo provides complete stroke guides and both Boss rounds offer full-set reentry', async ({ page }) => {
  await page.goto('/family-beta-preview.html?grade=grade5')
  const frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await expect(frame.getByRole('button', { name: 'Stroke Order', exact: true })).toBeEnabled()
  await frame.getByRole('button', { name: 'Stroke Order', exact: true }).click()
  await expect(frame.locator('.so-student-ink')).toBeAttached()
  await frame.getByRole('button', { name: 'Exit game', exact: true }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Discard unfinished activity', exact: true }).click()
  await frame.getByRole('button', { name: /Practice your Ninja Skills/ }).click()
  await expect(frame.getByRole('button', { name: 'Reenter the Dojo · writing', exact: true })).toBeVisible()
  await frame.getByRole('button', { name: /Back to all challenges/ }).click()
  await frame.getByRole('button', { name: /The Final Boss/ }).click()
  await frame.getByRole('button', { name: 'Reenter the Dojo · writing', exact: true }).click()
  await expect(frame.getByText(/Restarting the whole writing set/)).toBeVisible()
  await expect(frame.locator('.practice-page')).toBeVisible()
})

for (const grade of ['kindergarten', 'grade2', 'grade5']) {
  test(`${grade}: Spirit Realm writing uses durable mastery and offers mastered-word games without Dojo reentry`, async ({
    page,
  }) => {
    await page.goto(`/family-beta-preview.html?grade=${grade}`)
    const frame = page.frameLocator('iframe:visible')
    await frame.getByRole('button', { name: /Enter the Spirit Realm/ }).click()
    await expect(frame.getByRole('button', { name: /Reenter the Dojo/ })).toHaveCount(0)
    await expect(frame.getByRole('button', { name: 'Writing mastered-word games', exact: true })).toBeVisible()
    await frame.getByRole('button', { name: 'Writing mastery warmup', exact: true }).click()
    await frame.getByRole('button', { name: 'Show the word', exact: true }).click()
    await frame.getByRole('button', { name: 'Not yet', exact: true }).click()
    const records = () =>
      page.evaluate(() =>
        Object.keys(localStorage)
          .filter((k) => k.startsWith('family-beta-mastery-v1:'))
          .map((k) => JSON.parse(localStorage.getItem(k)!)),
      )
    await expect.poll(async () => (await records())[0]?.applied.length).toBe(1)
    const before = await records()
    expect(before[0].states.some((s: { bucket: string }) => s.bucket === 'needs-attention')).toBe(true)
    await page.reload()
    expect(await records()).toEqual(before)
    await frame.getByRole('button', { name: /Enter the Spirit Realm/ }).click()
    await frame.getByRole('button', { name: 'Reading mastered-word games', exact: true }).click()
    await expect(frame.locator('.family-spirit-menu')).toHaveCSS('background-color', 'rgb(27, 32, 52)')
    if (grade === 'grade5') await page.screenshot({ path: test.info().outputPath('spirit-menu.png') })
    await expect(frame.getByRole('button', { name: 'Start Memory Lanterns' })).toBeEnabled()
    await frame.getByRole('button', { name: 'Start Memory Lanterns' }).click()
    await expect(frame.locator('.lg-memory-card').first()).toBeVisible()
  })
}

test('unfinished Shadow Strike stays visible but unavailable until its dedicated stage', async ({
  page,
}) => {
  await page.goto('/family-beta-preview.html?grade=kindergarten')
  await page.getByRole('button', { name: 'Ninja Skills', exact: true }).click()
  const card = page.getByRole('heading', { name: 'Shadow Strike Dojo', exact: true }).locator('..')
  await expect(card.getByRole('button', { name: 'Coming soon', exact: true })).toBeDisabled()
  await expect(card).toContainText('interaction rules are still being completed')
})
