import { expect, test } from './fixtures.ts'
import { watchForUnexpectedBrowserErrors } from './prototypeSupport.ts'

const prototypeRoutes = [
  { route: '/grade5-learning-hub.html', heading: /Ready for your next challenge/ },
  { route: '/kindergarten-learning-lab.html', heading: /Ready for your next adventure/ },
  { route: '/tier2-reading-lab.html', heading: 'Follow each grade’s real learning path.' },
  { route: '/grade2-test-review-prototype.html', heading: /Collect every response/ },
  { route: '/learning-games-harness.html', heading: /Test all ten learning games/ },
  { route: '/skywriting-harness.html', heading: 'Test Sky Writing with 10 Tier 1 words' },
  { route: '/skywriting-acquisition-harness.html', heading: 'Grade 5 Sky Writing Acquisition' },
  { route: '/skywriting-font-comparison.html', heading: 'Songti SC Light vs. Kaiti SC Regular' },
] as const

for (const prototype of prototypeRoutes) {
  test(`${prototype.route} opens without a browser error`, async ({ page }) => {
    const expectNoBrowserErrors = watchForUnexpectedBrowserErrors(page)

    await page.goto(prototype.route)
    await expect(page.getByRole('heading', { level: 1, name: prototype.heading })).toBeVisible()

    expectNoBrowserErrors()
  })
}

test('the Grade 5 source harness loads its frozen fixture without writing or activating it', async ({ page }) => {
  const expectNoBrowserErrors = watchForUnexpectedBrowserErrors(page)

  await page.goto('/grade5-source-harness.html')
  await expect(page.getByRole('heading', { level: 1, name: 'Grade 5 Source Lab' })).toBeVisible()
  await page.getByRole('button', { name: 'Load trusted Week 4–7 fixture' }).click()
  await expect(page.getByRole('status')).toContainText('Loaded trusted Week 4–7 fixture. Nothing was written or activated.')

  expectNoBrowserErrors()
})

test('the Kindergarten source harness loads its frozen fixture without writing or activating it', async ({ page }) => {
  const expectNoBrowserErrors = watchForUnexpectedBrowserErrors(page)

  await page.goto('/kindergarten-source-harness.html')
  await expect(page.getByRole('heading', { level: 1, name: 'Kindergarten Source Lab' })).toBeVisible()
  await page.getByRole('button', { name: 'Load trusted Kindergarten fixture' }).click()
  await expect(page.getByRole('status')).toContainText('Loaded trusted Kindergarten fixture. Nothing was written or activated.')

  expectNoBrowserErrors()
})
