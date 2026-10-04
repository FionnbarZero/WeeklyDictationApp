import { expect, test } from './fixtures.ts'

const apps = [
  {
    url: 'http://127.0.0.1:5197/',
    grade: 'Kindergarten',
    enter: /The Final Boss Test/,
    inside: 'Writing Test',
  },
  {
    url: 'http://127.0.0.1:5198/',
    grade: 'Grade 5',
    enter: /Enter the Dojo/i,
    inside: 'Learn to Write',
  },
] as const

for (const app of apps) {
  test(`${app.grade} isolated artifact opens at its root and remains session-only`, async ({ page }) => {
    const failedRequests: string[] = []
    page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()}`))
    page.on('response', (response) => {
      if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`)
    })

    await page.goto(app.url)
    const identity = page.locator('.release-identity')
    await expect(identity).toContainText(app.grade)
    await expect(identity).toContainText('Experimental')
    await expect(identity).toContainText('v0.2.0-stage2')
    await expect(identity).toContainText('Session only')
    await expect(identity).toContainText(/r[a-f0-9]{7}/)

    await page.getByRole('button', { name: app.enter }).click()
    await expect(page.getByRole('button', { name: app.inside, exact: true })).toBeVisible()
    expect(await page.evaluate(() => Object.keys(window.localStorage))).toEqual([])

    await page.reload()
    await expect(page.getByRole('button', { name: app.enter })).toBeVisible()
    expect(await page.evaluate(() => Object.keys(window.localStorage))).toEqual([])
    expect(failedRequests).toEqual([])
  })
}

test('Grade 2 isolated artifact opens at its root with durable progress protection', async ({ page }) => {
  const failedRequests: string[] = []
  page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()}`))
  page.on('response', (response) => {
    if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`)
  })

  await page.goto('http://127.0.0.1:5199/')
  const identity = page.locator('.release-identity')
  await expect(identity).toContainText('Grade 2')
  await expect(identity).toContainText('Family beta')
  await expect(identity).toContainText('v0.2.0-stage2')
  await expect(identity).toContainText('Tier 1 writing durable here')
  await expect(identity).toContainText('Tier 2 reading session only')
  await expect(identity).toContainText(/r[a-f0-9]{7}/)
  await expect(page.getByRole('button', { name: 'Back up Grade 2 browser data' })).toBeVisible()

  await expect
    .poll(() => page.evaluate(() => Object.keys(window.localStorage)))
    .toEqual(expect.arrayContaining(['weekly-dictation-child', 'weekly-dictation-state-v2']))
  await page.reload()
  await expect(page.getByRole('button', { name: 'Back up Grade 2 browser data' })).toBeVisible()
  expect(failedRequests).toEqual([])
})
