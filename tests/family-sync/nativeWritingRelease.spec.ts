import { expect, type Page, test } from '@playwright/test'
import { installFamilyFixtures } from './fixtures.ts'

test.use({ serviceWorkers: 'block' })
for (const slug of ['kindergarten', 'grade5']) {
  test(`${slug}: actual predecessor correction migrates, next word teaches, guarded recovery preserves it`, async ({
    page,
    request,
  }) => {
    test.skip(
      !process.env.FAMILY_SYNC_REHEARSAL_OLD_ARTIFACT,
      'Actual retained predecessor is mandatory for release rehearsal.',
    )
    const select = async (version: string) =>
      expect((await request.post(`/__rehearsal__/version?version=${version}`)).ok()).toBe(true)
    const read = () =>
      page.evaluate(() => {
        const key = Object.keys(localStorage).find(
          (key) => key.startsWith('family-beta-acquisition-v1:') && !key.includes(':completed:'),
        )!
        const raw = localStorage.getItem(key)!
        return { key, raw, value: JSON.parse(raw) }
      })
    async function launch(tab: Page, olderReader = false) {
      await tab.goto(`/?grade=${slug}`)
      const week = slug === 'kindergarten' ? '2026-10-05' : '2026-09-14'
      if ((await tab.getByLabel('Practice week').inputValue()) !== week) {
        tab.once('dialog', (dialog) => dialog.accept())
        await tab.getByLabel('Practice week').selectOption(week)
      }
      const frame = tab.frameLocator('iframe:visible')
      await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
      await frame
        .getByRole('button', { name: slug === 'kindergarten' ? 'Writing characters' : 'Learn to Write', exact: true })
        .click()
      if (slug === 'grade5' && !olderReader) {
        const warmup = frame.getByRole('button', { name: 'Skip Warmup', exact: true })
        await expect(
          warmup
            .or(frame.getByRole('button', { name: 'Skip Timer', exact: true }))
            .or(frame.getByRole('region', { name: 'Stroke order teacher' })),
        ).toBeVisible()
        if (await warmup.isVisible()) await warmup.click()
      }
      return frame
    }
    await select('previous')
    await installFamilyFixtures(page)
    try {
      let frame = await launch(page)
      for (let i = 0; i < 4; i++) {
        await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
        // The retained predecessor uses the original review labels.
        await frame.getByRole('button', { name: i === 3 ? 'I got it wrong' : 'I got it right', exact: true }).click()
        await expect(frame.getByRole('button', { name: 'Skip Timer', exact: true })).toBeVisible()
      }
      const legacy = await read()
      expect(legacy.value.schema).toBe(1)
      expect(legacy.value.envelope.flow.phase).toBe('correction')
      await select('candidate')
      frame = await launch(page)
      await expect(frame.locator('.native-writing-integration')).toBeVisible()
      const upgraded = await read()
      expect(upgraded.value.schema).toBe(2)
      expect(upgraded.value.envelope).toEqual(legacy.value.envelope)
      expect(upgraded.value.reviewedTrials).toEqual(legacy.value.reviewedTrials)
      expect(upgraded.value.assessments).toEqual(legacy.value.assessments)
      expect(upgraded.value.writing.firstTeacherTargetIndex).toBe(1)
      await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toBeHidden()
      for (let i = 0; (await read()).value.envelope.flow.targetIndex === 0 && i < 50; i++) {
        const skip = frame.getByRole('button', { name: 'Skip Timer', exact: true })
        const right = frame.getByRole('button', { name: 'I got it right', exact: true })
        await expect(skip.or(right)).toBeVisible()
        if (await skip.isVisible()) await skip.click()
        await right.click()
        await expect
          .poll(async () => (await read()).value.envelope.revision)
          .toBe(legacy.value.envelope.revision + i + 1)
      }
      await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '1')
      const retained = await read()
      const results = () =>
        page.evaluate(() =>
          Object.fromEntries(
            Object.keys(localStorage)
              .filter(
                (key) =>
                  key.startsWith('family-beta-preview-results-v1:') ||
                  key.startsWith('family-beta-preview-pending-v1:'),
              )
              .map((key) => [key, localStorage.getItem(key)]),
          ),
        )
      const retainedResults = await results()
      await select('previous')
      frame = await launch(page, true)
      // Exercise the old store/launcher, not merely its outer family page.
      if (slug === 'grade5') {
        // The immutable predecessor hides its lab status in the family frame.
        // Verify its exact refusal and closed activity, not a visible warning
        // that this older UI never supplied. Guarded recovery below must show it.
        await expect(frame.locator('#hub-status')).toHaveText(
          'Saved acquisition does not match this curriculum or teaching sequence. Nothing was erased. Please report this problem.',
        )
        await expect(frame.getByRole('button', { name: 'Learn to Write', exact: true })).toBeVisible()
        await expect(frame.locator('#practice-panel')).toBeHidden()
        await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toHaveCount(0)
        for (const name of ['Skip Warmup', 'Skip Timer', 'I got it right', 'I got it wrong'])
          await expect(frame.getByRole('button', { name, exact: true })).toHaveCount(0)
      } else await expect(frame.getByText(/Saved acquisition does not match.*Nothing was erased/)).toBeVisible()
      expect((await read()).raw).toBe(retained.raw)
      expect(await results()).toEqual(retainedResults)
      await select('rollback')
      await page.goto(`/?grade=${slug}`)
      await expect(page.getByRole('heading', { name: 'Your saved work is preserved' })).toBeVisible()
      expect((await read()).raw).toBe(retained.raw)
      await select('candidate')
      frame = await launch(page)
      await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '1')
      expect((await read()).raw).toBe(retained.raw)
    } finally {
      await select('candidate')
    }
  })
}
