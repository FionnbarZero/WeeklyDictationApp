import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'
import { inspectSnapshot } from '../../src/familyBeta/curriculum.ts'
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
    test(`${slug} ${channel}: confirmed discard survives reload without erasing reviewed history`, async ({ page }) => {
      await installFamilyFixtures(page)
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
      const old = await saved(page, slug === 'grade2' && channel === 'writing')
      await frame
        .locator('body')
        .evaluate(() => parent.postMessage({ type: 'family-beta-activity-paused' }, location.origin))
      page.once('dialog', (d) => d.dismiss())
      await page.getByRole('button', { name: 'Discard unfinished activity', exact: true }).click()
      expect(
        await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes(':lesson-retirement-v1:')).length),
      ).toBe(0)
      page.once('dialog', (d) => d.accept())
      await page.getByRole('button', { name: 'Discard unfinished activity', exact: true }).click()
      await expect
        .poll(() =>
          page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes(':lesson-retirement-v1:')).length),
        )
        .toBe(1)
      await page.reload()
      await page.getByText('Saved lessons', { exact: true }).click()
      await expect(page.getByRole('button', { name: new RegExp(`Resume saved ${channel}`) })).toHaveCount(0)
      frame = await launch(page, slug, channel)
      const envelopes = await page.evaluate(() =>
        Object.keys(localStorage).flatMap((key) => {
          if (key.startsWith('family-beta-acquisition-v1:')) return [JSON.parse(localStorage.getItem(key)!).envelope]
          if (key.startsWith('family-beta-activity:') && key.endsWith(':weekly-dictation-state-v2'))
            return JSON.parse(localStorage.getItem(key)!).acquisitionProgressEnvelopes || []
          return []
        }),
      )
      expect(envelopes.find((e) => e.id === old.id)).toEqual(old)
      const fresh = envelopes.find((e) => e.id !== old.id && e.activityModule.includes(':restart-'))
      expect(fresh?.revision).toBe(0)
      if (channel === 'writing') {
        await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
        await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
      } else {
        await frame.getByRole('button', { name: 'Record my reading', exact: true }).click()
        await frame.getByRole('button', { name: 'Continue without recording', exact: true }).click()
        await frame.getByRole('button', { name: 'Yes', exact: true }).click()
      }
    })
  }
}

test('resuming a live Grade 5 cohort reuses its frame even when the calendar week repeats it', async ({ page }) => {
  await installFamilyFixtures(page)
  await page.goto('/?grade=grade5')
  const frame = await launch(page, 'grade5', 'writing')
  await frame.locator('body').evaluate((body) => {
    body.dataset.resumeProbe = 'original-activity'
  })
  await page.getByText('Saved lessons', { exact: true }).click()
  await page.getByRole('button', { name: /Resume saved writing/ }).click()
  await expect(page.locator('iframe')).toHaveCount(1)
  await expect(frame.locator('body')).toHaveAttribute('data-resume-probe', 'original-activity')
  await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
  await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
  expect((await saved(page, false)).revision).toBe(1)
})

for (const slug of ['kindergarten', 'grade2', 'grade5']) {
  for (const channel of ['writing', 'reading'] as const) {
    for (const sourceState of ['unavailable', 'removed-week'])
      test(`${slug} ${channel}: saved lesson opens after reload with ${sourceState} curriculum`, async ({ page }) => {
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
        const snapshot = JSON.parse(await readFile(`public/curriculum/beta/${slug}.json`, 'utf8'))
        const originalHash = snapshot.contentSha256
        const removed = inspectSnapshot(snapshot).candidates.find(
          (c) => c.datasetId === before.datasetId.replace(/^__kindergarten-lab__/, ''),
        )!
        if (slug === 'kindergarten')
          snapshot.payload.sheets = snapshot.payload.sheets.filter(
            (sheet: { sheetId: number }) => String(sheet.sheetId) !== removed.source.sourceUnitId,
          )
        else
          snapshot.payload.slides = snapshot.payload.slides.filter(
            (slide: { objectId: string }) => slide.objectId !== removed.source.sourceUnitId,
          )
        snapshot.contentSha256 = createHash('sha256').update(JSON.stringify(snapshot.payload)).digest('hex')
        expect(inspectSnapshot(snapshot).candidates.some((c) => c.datasetId === removed.datasetId)).toBe(false)
        await page.route(`**/curriculum/beta/${slug}.json`, (route) =>
          sourceState === 'unavailable'
            ? route.fulfill({ status: 503, body: 'offline' })
            : route.fulfill({ contentType: 'application/json', body: JSON.stringify(snapshot) }),
        )
        await page.reload()
        await page.getByText('Saved lessons', { exact: true }).click()
        await page.getByRole('button', { name: new RegExp(`Resume saved ${channel}`) }).click()
        frame = page.frameLocator('iframe:visible')
        await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
        await expect(
          frame.getByRole('button', {
            name:
              slug === 'kindergarten'
                ? channel === 'writing'
                  ? 'High-frequency words'
                  : 'Writing characters'
                : channel === 'writing'
                  ? 'Read the Words'
                  : 'Learn to Write',
            exact: true,
          }),
        ).toHaveCount(0)
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
        if (slug === 'grade2' && channel === 'writing')
          await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
        expect(await saved(page, slug === 'grade2' && channel === 'writing')).toEqual(before)
        await expect(
          frame.getByRole('button', { name: channel === 'writing' ? 'Skip Timer' : 'Record my reading', exact: true }),
        ).toBeVisible()
        await expect(page.locator('iframe:visible')).toHaveAttribute('data-family-curriculum', originalHash)
        if (channel === 'writing') {
          await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
          await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
        } else {
          await frame.getByRole('button', { name: 'Record my reading', exact: true }).click()
          await frame.getByRole('button', { name: 'Continue without recording', exact: true }).click()
          await frame.getByRole('button', { name: 'Yes', exact: true }).click()
        }
        expect((await saved(page, slug === 'grade2' && channel === 'writing')).revision).toBe(before.revision + 1)
        if (sourceState === 'removed-week') {
          await page.getByRole('button', { name: 'Return to current teacher lessons' }).click()
          await expect(page.locator('iframe:visible')).toHaveAttribute('data-family-curriculum', snapshot.contentSha256)
          await expect(
            page.getByLabel('Practice week').locator(`option[value="${removed.normalizedStartDate}"]`),
          ).toHaveCount(0)
        }
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
        await expect(frame.getByText('Weekly vocabulary could not be updated automatically.')).toHaveCount(0)
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
      if (g2Writing) {
        // Retiring the old attempt must adopt the actual corrected edition,
        // not recreate an attempt against the original dataset's word IDs.
        await frame
          .locator('body')
          .evaluate(() => parent.postMessage({ type: 'family-beta-activity-paused' }, location.origin))
        await page.getByRole('button', { name: 'Discard unfinished activity', exact: true }).click()
        await page.reload()
        frame = await launch(page, slug, channel)
        const readEditions = () =>
          page.evaluate(
            () =>
              JSON.parse(localStorage.getItem('family-beta-activity:synthetic-g2:weekly-dictation-state-v2')!)
                .acquisitionProgressEnvelopes,
          )
        const editions = await readEditions()
        expect(editions.find((e: { id: string }) => e.id === after.id)).toEqual(after)
        const corrected = editions.find((e: { datasetId: string }) => e.datasetId.includes('__rev_'))
        expect(corrected.revision).toBe(0)
        expect(corrected.lessonSnapshot.targetSet.targets[0].text).toBe(words[1].text)
        expect(corrected.lessonSnapshot.targetSet.targets[0].id).not.toBe(words[0].id)
        await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
        await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
        await page.reload()
        await launch(page, slug, channel, true)
        const resumed = await readEditions()
        expect(resumed.find((e: { id: string }) => e.id === corrected.id).revision).toBe(1)
        expect(resumed.find((e: { id: string }) => e.id === after.id)).toEqual(after)
      }
    })
  }
}
