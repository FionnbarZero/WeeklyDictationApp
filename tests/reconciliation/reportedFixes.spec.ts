import { expect, test } from '@playwright/test'

test('Grade 2 historical September 21 Dojo retains all seven reading targets', async ({ page }) => {
  await page.goto('/family-beta-preview.html?grade=grade2')
  await expect(page.getByLabel('Practice week').locator('option[value="2026-09-21"]')).toBeAttached()
  page.on('dialog', (dialog) => dialog.accept())
  await page.getByLabel('Practice week').selectOption('2026-09-21')
  const frame = page.frameLocator('iframe')
  await expect(page.locator('iframe')).toHaveAttribute('src', /week=2026-09-21/)
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await expect(frame.getByRole('button', { name: 'Read the Words', exact: true })).toBeVisible()
  await expect(frame.locator('.learning-hub-word-list')).toContainText([
    '比如部分更方便美好',
    '城市上班公园图书馆散步漂亮各种各样的',
  ])
})

test('Kindergarten path integrates games using previous relevant reading targets', async ({ page }) => {
  await page.goto('/family-beta-preview.html?grade=kindergarten')
  const frame = page.frameLocator('iframe')
  await frame.getByRole('button', { name: /Practice your Ninja Skills/ }).click()
  await expect(frame.getByRole('button', { name: 'Memory Lanterns', exact: true })).toBeVisible()
  await expect(frame.getByText('红色', { exact: true })).toBeVisible()
  await expect(frame.getByText('蓝色', { exact: true })).toBeVisible()
  await expect(frame.getByRole('button', { name: 'Needs teacher-approved content' }).first()).toBeDisabled()
  await frame.getByRole('button', { name: 'Listening Lily Pads', exact: true }).click()
  await expect(frame.locator('.k-word-choice')).toHaveText(['红色', '蓝色'])
  await frame.getByRole('button', { name: 'Exit game', exact: true }).click()
  await frame.getByRole('button', { name: 'Memory Lanterns', exact: true }).click()
  await expect(frame.locator('.lg-memory-card')).toHaveCount(4)
})

test('Grade 5 Dojo provides complete stroke guides and both Boss rounds offer full-set reentry', async ({ page }) => {
  await page.goto('/family-beta-preview.html?grade=grade5')
  const frame = page.frameLocator('iframe')
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await expect(frame.getByRole('button', { name: 'Stroke Order', exact: true })).toBeEnabled()
  await frame.getByRole('button', { name: 'Stroke Order', exact: true }).click()
  await expect(frame.locator('.so-student-ink')).toBeAttached()
  await frame.getByRole('button', { name: 'Exit game', exact: true }).click()
  await frame.getByRole('button', { name: /Back to all challenges/ }).click()
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
    const frame = page.frameLocator('iframe')
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

test('Shadow Strike inherits its computed aim and freezes targets without snapping their animation', async ({
  page,
}) => {
  await page.goto('/family-beta-preview.html?grade=kindergarten')
  await page.getByRole('button', { name: 'Ninja Skills', exact: true }).click()
  await page.getByRole('button', { name: 'Shadow Strike Dojo', exact: true }).click()
  const target = page.locator('.lg-world-choice').first()
  await expect(target).toBeVisible()
  await expect(target).toBeEnabled()
  // These targets intentionally sway continuously; click without waiting for
  // animation stability, then verify the actual selected/paused state below.
  await target.click({ force: true })
  const geometry = await page.locator('.lg-target-blast-playfield').evaluate((element) => ({
    expected: (element as HTMLElement).style.getPropertyValue('--throw-x'),
    actual: getComputedStyle(element.querySelector('.lg-shuriken-shot')!).getPropertyValue('--throw-x'),
    targetAnimation: getComputedStyle(element.querySelector('.lg-world-choice')!).animationPlayState,
  }))
  expect(geometry.expected).not.toBe('')
  expect(geometry.actual).toBe(geometry.expected)
  expect(geometry.targetAnimation).toBe('paused')
})
