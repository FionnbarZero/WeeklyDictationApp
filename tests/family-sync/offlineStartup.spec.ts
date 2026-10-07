import { expect, test } from '@playwright/test'
import { grades, installFamilyFixtures } from './fixtures.ts'

for (const [slug, , id] of grades)
  for (const channel of ['writing', 'reading'] as const) {
    test(`${slug} ${channel}: saved lesson reopens with the entire browser offline`, async ({ page, context }) => {
      await installFamilyFixtures(page)
      await page.goto(`/?grade=${slug}`)
      if (slug === 'grade2') await page.getByLabel('Practice week').selectOption('2026-09-21')
      let frame = page.frameLocator('iframe:visible')
      const activity =
        slug === 'kindergarten'
          ? channel === 'writing'
            ? 'Writing characters'
            : 'High-frequency words'
          : channel === 'writing'
            ? 'Learn to Write'
            : 'Read the Words'
      await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
      await frame.getByRole('button', { name: activity, exact: true }).click()
      if (channel === 'writing' && slug !== 'kindergarten')
        await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
      const answer = async () => {
        if (channel === 'writing') {
          await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
          await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
        } else {
          await frame.getByRole('button', { name: 'Record my reading', exact: true }).click()
          await frame.getByRole('button', { name: 'Continue without recording', exact: true }).click()
          await frame.getByRole('button', { name: 'Yes', exact: true }).click()
        }
      }
      await answer()
      const checkpoint = () =>
        page.evaluate(
          ({ id, g2 }) => {
            if (g2)
              return JSON.parse(localStorage.getItem(`family-beta-activity:${id}:weekly-dictation-state-v2`)!)
                .acquisitionProgressEnvelopes[0]
            return Object.keys(localStorage)
              .filter((k) => k.startsWith('family-beta-acquisition-v1:') && !k.includes(':completed:'))
              .map((k) => JSON.parse(localStorage.getItem(k)!))
              .find((r) => r.envelope.childId === id).envelope
          },
          { id, g2: slug === 'grade2' && channel === 'writing' },
        )
      const before = await checkpoint()
      await expect(page.locator('[data-offline-shell-status]')).toContainText('Offline app ready')
      // A true network cut (not just a curriculum HTTP error) plus a fresh page.
      await context.setOffline(true)
      await page.evaluate(() => {
        const auth = JSON.parse(localStorage.getItem('weekly-dictation-auth-v1')!)
        auth.expiresAt = 0
        auth.refreshToken = 'synthetic-offline-refresh'
        localStorage.setItem('weekly-dictation-auth-v1', JSON.stringify(auth))
      })
      await page.reload()
      await expect(page.getByLabel('Child profile')).toHaveValue(id)
      await page.getByText('Saved lessons', { exact: true }).click()
      await page.getByRole('button', { name: new RegExp(`Resume saved ${channel}`) }).click()
      frame = page.frameLocator('iframe:visible')
      await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
      await frame.getByRole('button', { name: activity, exact: true }).click()
      if (channel === 'writing' && slug === 'grade2')
        await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
      expect(await checkpoint()).toEqual(before)
      await answer()
      expect((await checkpoint()).revision).toBe(before.revision + 1)
      // Offline responses must remain available after another cold reload.
      await page.reload()
      expect((await checkpoint()).revision).toBe(before.revision + 1)
      await page.evaluate(() => {
        const auth = JSON.parse(localStorage.getItem('weekly-dictation-auth-v1')!)
        auth.expiresAt = Date.now() + 3600_000
        localStorage.setItem('weekly-dictation-auth-v1', JSON.stringify(auth))
      })
      await context.setOffline(false)
      await expect(page.getByText(/Scores and saved practice confirmed/)).toBeVisible()
    })
  }

test('sign-out removes offline bootstrap access without erasing reviewed practice', async ({ page, context }) => {
  await installFamilyFixtures(page)
  await page.goto('/?grade=grade5')
  await expect(page.getByText(/Scores and saved practice confirmed/)).toBeVisible()
  await expect(page.locator('[data-offline-shell-status]')).toContainText('Offline app ready')
  await page.getByRole('button', { name: 'Parent controls', exact: true }).click()
  page.on('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Sign out parent', exact: true }).click()
  expect(await page.evaluate(() => localStorage.getItem('family-beta-offline-access-v1:synthetic-parent'))).toBeNull()
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByLabel('Child profile')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
})
