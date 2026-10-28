import { expect, type Page, test } from '@playwright/test'
import { strokeOrderGuide } from '../../src/familyBeta/strokeOrderSlay.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'
import { grades, installFamilyFixtures } from '../family-sync/fixtures.ts'

async function parentPanel(page: Page, open: boolean) {
  const summary = page.locator('summary').filter({ hasText: 'Parent controls' })
  if (await summary.count()) {
    if ((await summary.evaluate((el) => (el.parentElement as HTMLDetailsElement).open)) !== open) await summary.click()
  }
}
function savedPractice() {
  return Object.fromEntries(
    Object.entries(localStorage).filter(
      ([key]) =>
        key.startsWith('family-beta-acquisition-v1:') ||
        (key.startsWith('family-beta-activity:') &&
          (key.endsWith(':lesson-workspace-v1') || key.includes(':lesson-launch-v1:'))),
    ),
  )
}

function expectReopenedPracticePreserved(before: Record<string, string>, after: Record<string, string>) {
  const normalized = { ...after }
  for (const [key, raw] of Object.entries(before)) {
    if (!key.endsWith(':lesson-workspace-v1')) continue
    const oldWorkspace = JSON.parse(raw)
    const nextWorkspace = JSON.parse(after[key])
    const checkpointKey = 'weekly-dictation-checkpoint-v1'
    const oldCheckpoint = JSON.parse(oldWorkspace.records[checkpointKey])
    const nextCheckpoint = JSON.parse(nextWorkspace.records[checkpointKey])
    // Reopening explicitly starts another optional Warmup visit. Prior visits
    // and receipts must remain byte-equivalent and ordered; all other saved
    // fields, including writing progress, must remain exactly unchanged.
    for (const field of ['warmupVisitsV1', 'warmupTransitionReceiptsV1']) {
      const previous = oldCheckpoint.values[field] || []
      const next = nextCheckpoint.values[field] || []
      expect(next.slice(0, previous.length)).toEqual(previous)
      expect(next.length).toBeGreaterThanOrEqual(previous.length)
      nextCheckpoint.values[field] = oldCheckpoint.values[field]
    }
    nextWorkspace.records[checkpointKey] = JSON.stringify(nextCheckpoint)
    normalized[key] = JSON.stringify(nextWorkspace)
  }
  expect(normalized).toEqual(before)
}

for (const [slug, grade] of grades) {
  test(`${grade}: the actual predecessor upgrades a confirmed lesson and guarded recovery preserves new work`, async ({
    page,
    request,
  }) => {
    const select = async (version: string) =>
      expect((await request.post(`/__rehearsal__/version?version=${version}`)).ok()).toBe(true)
    await select('previous')
    await installFamilyFixtures(page)
    const week = slug === 'kindergarten' ? '2026-10-05' : slug === 'grade5' ? '2026-09-14' : '2026-09-29'
    const frame = page.frameLocator('iframe:visible')
    async function launch() {
      await page.goto(`/family-beta-preview.html?grade=${slug}`)
      await expect(frame.getByRole('button', { name: /Enter the Dojo/ })).toBeVisible()
      await parentPanel(page, true)
      const picker = page.getByLabel('Practice week')
      if ((await picker.inputValue()) !== week) {
        page.once('dialog', (dialog) => dialog.accept())
        await picker.selectOption(week)
      }
      await expect(page.locator('iframe:visible')).toHaveAttribute('data-family-week', week)
      await parentPanel(page, false)
      await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
      await frame
        .getByRole('button', { name: slug === 'kindergarten' ? 'Writing characters' : 'Learn to Write', exact: true })
        .click()
      const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
      const warmup = frame.getByRole('button', { name: 'Skip Warmup', exact: true })
      await expect(teacher.or(warmup)).toBeVisible()
      if (await warmup.isVisible()) await warmup.click()
      await expect(teacher).toBeVisible()
      return teacher
    }
    const teacher = await launch()
    await expect(teacher).toHaveAttribute('data-step', '1')
    const character = await teacher.locator('svg[role="application"]').getAttribute('aria-label')
    const target = await page.evaluate(() => {
      for (const [key, raw] of Object.entries(localStorage)) {
        if (key.startsWith('family-beta-acquisition-v1:')) {
          const progress = JSON.parse(raw).writing
          if (progress) return progress.lesson.targets[0].text
        }
        if (key.endsWith(':lesson-workspace-v1')) {
          const records = JSON.parse(raw).records
          for (const [name, value] of Object.entries(records)) {
            if (!name.startsWith('weekly-dictation-checkpoint-v1:activity:')) continue
            const progress = JSON.parse(value as string).values?.writingAcquisitionProgress?.[0]
            if (progress) return progress.lesson.targets[0].text
          }
        }
      }
      return null
    })
    expect(target, character || 'Saved lesson target').toBeTruthy()
    const strokes = strokeOrderGuide({ id: 'synthetic-release-upgrade', text: [...target!][0] }).strokes
    const layout = getStrokeLayout(strokes)
    const pad = teacher.locator('svg[role="application"]')
    await pad.scrollIntoViewIfNeeded()
    for (let i = 0; i < strokes.length; i++) {
      const bounds = (await pad.boundingBox())!
      const xy = (point: readonly [number, number]) =>
        [
          bounds.x + ((point[0] * layout.scale + layout.offsetX) * bounds.width) / 100,
          bounds.y + ((point[1] * layout.scale + layout.offsetY) * bounds.height) / 100,
        ] as const
      await page.mouse.move(...xy(strokes[i][0]))
      await page.mouse.down()
      for (const point of strokes[i].slice(1)) await page.mouse.move(...xy(point))
      await page.mouse.up()
      await expect(pad).toHaveAttribute('data-next-stroke', String(i + 1))
    }
    await frame.getByRole('button', { name: 'Next step', exact: true }).click()
    await expect(teacher).toHaveAttribute('data-step', '2')
    // The predecessor hides its parent status while a child is writing.
    // Return through the real activity control before checking confirmation.
    await frame.getByRole('button', { name: /^(Exit game|Pause and return)$/ }).click()
    await parentPanel(page, true)
    await expect(page.getByText(/Scores, saved practice, and game detail confirmed/)).toBeVisible()
    const previous = await page.evaluate(savedPractice)
    expect(Object.keys(previous).length).toBeGreaterThan(0)
    await select('candidate')
    await expect(await launch()).toHaveAttribute('data-step', '2')
    const upgraded = await page.evaluate(savedPractice)
    expect(Object.keys(upgraded).length).toBeGreaterThan(0)
    await select('rollback')
    await page.goto(`/family-beta-preview.html?grade=${slug}`)
    await expect(page.getByRole('heading', { name: 'Your saved work is preserved' })).toBeVisible()
    expect(await page.evaluate(savedPractice)).toEqual(upgraded)
    await select('candidate')
    await expect(await launch()).toHaveAttribute('data-step', '2')
    expectReopenedPracticePreserved(upgraded, await page.evaluate(savedPractice))
  })
}
