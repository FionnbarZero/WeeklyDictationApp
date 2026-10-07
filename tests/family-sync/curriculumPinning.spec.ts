import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'
import { installFamilyFixtures } from './fixtures.ts'

async function launch(page: Page, slug: string, channel: 'writing' | 'reading', resuming = false) {
  if (slug === 'grade2') await page.getByLabel('Practice week').selectOption('2026-09-21')
  const frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await frame
    .getByRole('button', {
      name:
        slug === 'kindergarten'
          ? channel === 'writing'
            ? 'Writing characters'
            : 'High-frequency words'
          : channel === 'writing'
            ? 'Learn to Write'
            : 'Read the Words',
      exact: true,
    })
    .click()
  const skip = frame.getByRole('button', { name: 'Skip Warmup', exact: true })
  if (channel === 'writing' && (slug === 'grade2' || (slug === 'grade5' && !resuming))) await skip.click()
  return frame
}

async function saved(page: Page, grade2Writing: boolean) {
  return page.evaluate((g2) => {
    const key = Object.keys(localStorage).find((key) =>
      g2
        ? key.startsWith('family-beta-activity:synthetic-g2:') && key.endsWith('weekly-dictation-state-v2')
        : key.startsWith('family-beta-acquisition-v1:') && !key.includes(':completed:'),
    )
    if (!key) return null
    const value = JSON.parse(localStorage.getItem(key)!)
    return g2 ? value.acquisitionProgressEnvelopes?.[0] : value.envelope
  }, grade2Writing)
}

for (const slug of ['kindergarten', 'grade2', 'grade5']) {
  for (const channel of ['writing', 'reading'] as const) {
    test(`${slug} ${channel}: saved lesson opens after reload without the curriculum service`, async ({ page }) => {
      await installFamilyFixtures(page)
      await page.goto(`/?grade=${slug}`)
      let frame = await launch(page, slug, channel)
      if (channel === 'writing') {
        await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
        await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
      } else {
        await frame.getByRole('button', { name: 'Record my reading', exact: true }).click()
        await frame.getByRole('button', { name: 'Continue without recording', exact: true }).click()
        await frame.getByRole('button', { name: 'Yes', exact: true }).click()
      }
      const before = await saved(page, slug === 'grade2' && channel === 'writing')
      await page.route(`**/curriculum/beta/${slug}.json`, route => route.fulfill({ status: 503, body: 'offline' }))
      await page.reload()
      await page.getByRole('button', { name: new RegExp(`Resume saved ${channel}`) }).click()
      frame = page.frameLocator('iframe:visible')
      await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
      await frame.getByRole('button', { name: slug === 'kindergarten'
        ? channel === 'writing' ? 'Writing characters' : 'High-frequency words'
        : channel === 'writing' ? 'Learn to Write' : 'Read the Words', exact: true }).click()
      if (slug === 'grade2' && channel === 'writing') await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
      expect(await saved(page, slug === 'grade2' && channel === 'writing')).toEqual(before)
      await expect(frame.getByRole('button', { name: channel === 'writing' ? 'Skip Timer' : 'Record my reading', exact: true })).toBeVisible()
    })
    test(`${slug} ${channel}: reviewed lesson survives a teacher edit and a full reload`, async ({ page }) => {
      await installFamilyFixtures(page)
      page.on('dialog', (dialog) => dialog.accept())
      const snapshot = JSON.parse(await readFile(`public/curriculum/beta/${slug}.json`, 'utf8'))
      let updatesServed = 0
      let changed = false
      await page.route(`**/curriculum/beta/${slug}.json`, (route) => {
        if (changed) updatesServed++
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(snapshot) })
      })
      await page.goto(`/?grade=${slug}`)
      let frame = await launch(page, slug, channel)
      if (channel === 'writing') {
        for (let i = 0; i < 4; i++) {
          await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
          await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
        }
      } else {
        await frame.getByRole('button', { name: 'Record my reading', exact: true }).click()
        await frame.getByRole('button', { name: 'Continue without recording', exact: true }).click()
        await frame.getByRole('button', { name: 'Yes', exact: true }).click()
      }
      const g2Writing = slug === 'grade2' && channel === 'writing'
      const before = await saved(page, g2Writing)
      expect(before.lessonSnapshot.engineContract).toBe('acquisition-engine-v1')
      const words = before.lessonSnapshot.targetSet.targets
      expect(words.length).toBeGreaterThan(1)
      const original = JSON.stringify(snapshot.payload)
      expect(original).toContain(words[0].text)
      // A real, checksum-valid teacher change; no local saved records are edited.
      const updated = original
        .split(words[0].text)
        .join('__PIN_TEST_WORD__')
        .split(words[1].text)
        .join(words[0].text)
        .split('__PIN_TEST_WORD__')
        .join(words[1].text)
      expect(updated).not.toBe(original)
      snapshot.payload = JSON.parse(updated)
      snapshot.contentSha256 = createHash('sha256').update(JSON.stringify(snapshot.payload)).digest('hex')
      changed = true
      await page.reload()
      frame = await launch(page, slug, channel, true)
      expect(updatesServed).toBeGreaterThan(0)
      expect(await saved(page, g2Writing)).toEqual(before)
      if (g2Writing) {
        // Replacement of an already imported G2 week is a separate, gated step.
        await expect(frame.getByText('Weekly vocabulary could not be updated automatically.')).toBeVisible()
      }
      if (channel === 'writing') {
        await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
        await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
      } else {
        await frame.getByRole('button', { name: 'Record my reading', exact: true }).click()
        await frame.getByRole('button', { name: 'Continue without recording', exact: true }).click()
        await frame.getByRole('button', { name: 'Yes', exact: true }).click()
      }
      const after = await saved(page, g2Writing)
      expect(after.revision).toBe(before.revision + 1)
      expect(after.lessonSnapshot).toEqual(before.lessonSnapshot)
      expect(JSON.stringify(after)).not.toMatch(/blob:|data:audio|audio\/webm/)
    })
  }
}
