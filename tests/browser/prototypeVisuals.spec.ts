import { expect, test } from '@playwright/test'
import { waitForStablePrototypeFrame, watchForUnexpectedBrowserErrors } from './prototypeSupport.ts'

test.use({
  colorScheme: 'light',
  locale: 'en-US',
  reducedMotion: 'reduce',
  timezoneId: 'America/Los_Angeles',
  viewport: { width: 1280, height: 900 },
})

const visualReferences = [
  {
    route: '/grade5-learning-hub.html',
    heading: /Ready for your next challenge/,
    snapshot: 'grade5-learning-hub.png',
  },
  {
    route: '/kindergarten-learning-lab.html',
    heading: /Ready for your next adventure/,
    snapshot: 'kindergarten-learning-hub.png',
  },
  {
    route: '/grade2-test-review-prototype.html',
    heading: /Collect every response/,
    snapshot: 'grade2-test-review-prototype.png',
  },
  {
    route: '/learning-games-harness.html',
    heading: /Test all ten learning games/,
    snapshot: 'learning-games-gallery.png',
  },
  {
    route: '/skywriting-font-comparison.html',
    heading: 'Songti SC Light vs. Kaiti SC Regular',
    snapshot: 'skywriting-font-comparison.png',
  },
] as const

for (const reference of visualReferences) {
  test(`${reference.route} matches its approved visual reference`, async ({ page }) => {
    const expectNoBrowserErrors = watchForUnexpectedBrowserErrors(page)

    await page.goto(reference.route)
    await expect(page.getByRole('heading', { level: 1, name: reference.heading })).toBeVisible()
    await waitForStablePrototypeFrame(page)
    await expect(page).toHaveScreenshot(reference.snapshot, {
      animations: 'disabled',
      caret: 'hide',
      fullPage: true,
      scale: 'css',
    })

    expectNoBrowserErrors()
  })
}
