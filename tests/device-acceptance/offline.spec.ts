import { expect, test } from '@playwright/test'
import { installFamilyFixtures } from '../family-sync/fixtures.ts'

test.use({ serviceWorkers: 'allow' })
test('an already confirmed test family can reopen its exact shell offline without caching private API data', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'This driver validates service-worker caches in Chromium; iPad installation is a separate physical check.',
  )
  test.setTimeout(180000)
  await installFamilyFixtures(page, new Map(), 'ninja-device-fixture@example.invalid')
  let offline = false
  await context.route('**/firestore.googleapis.com/**', (route) =>
    offline ? route.abort('internetdisconnected') : route.fallback(),
  )
  await page.goto('/family-beta-preview.html?grade=grade2')
  await expect(page.frameLocator('iframe:visible').getByRole('button', { name: /Enter the Dojo/ })).toBeVisible({
    timeout: 30000,
  })
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await expect(page.frameLocator('iframe:visible').getByRole('button', { name: /Enter the Dojo/ })).toBeVisible()
  const manifest = await page.request.get('/family-beta-manifest.json').then((r) => r.json())
  const allowed = new Set(
    manifest.files
      .filter(
        (f: { path: string }) =>
          f.path.startsWith('assets/') ||
          f.path.startsWith('audio/') ||
          [
            'index.html',
            'family-beta-preview.html',
            'kindergarten-learning-lab.html',
            'grade5-learning-hub.html',
            'family-game.html',
            'offline-registration.js',
          ].includes(f.path),
      )
      .map((f: { path: string }) => '/' + f.path),
  )
  const cached = await page.evaluate(async () =>
    (
      await Promise.all(
        (
          await caches.keys()
        ).map(async (key) => (await (await caches.open(key)).keys()).map((r) => new URL(r.url).pathname)),
      )
    ).flat(),
  )
  expect(cached.length).toBeGreaterThan(100)
  expect(cached.every((path) => allowed.has(path))).toBe(true)
  offline = true
  await context.setOffline(true)
  await page.reload()
  await expect(page.frameLocator('iframe:visible').getByRole('button', { name: /Enter the Dojo/ })).toBeVisible({
    timeout: 30000,
  })
  await page.locator('summary').filter({ hasText: 'Parent controls' }).click()
  await expect(page.getByRole('region', { name: 'Device and syncing check' })).toContainText('Offline')
})
