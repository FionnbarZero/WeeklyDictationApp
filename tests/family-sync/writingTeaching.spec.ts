import { expect, type FrameLocator, type Page, test } from '@playwright/test'
import { strokeOrderGuide } from '../../src/familyBeta/strokeOrderSlay.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'
import { installFamilyFixtures, type SyntheticFamilyDocuments } from './fixtures.ts'

const workspaceKey = 'family-beta-activity:synthetic-g2:lesson-workspace-v1'
async function launch(page: Page) {
  await page.goto('/?grade=grade2')
  const frame = page.frameLocator('iframe:visible')
  await expect(frame.getByRole('heading', { name: /Ready for your next/ })).toBeVisible()
  if ((await page.getByLabel('Practice week').inputValue()) !== '2026-09-29') {
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByLabel('Practice week').selectOption('2026-09-29')
    await expect(page.locator('iframe:visible')).toHaveAttribute('src', /week=2026-09-29/)
  }
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await frame.getByRole('button', { name: 'Learn to Write', exact: true }).click()
  await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
  return frame
}
async function finishTrial(page: Page, frame: FrameLocator) {
  const strokes = strokeOrderGuide({ id: 'writing-cloud-guide', text: '英' }).strokes
  const layout = getStrokeLayout(strokes)
  const pad = frame.getByRole('region', { name: 'Stroke order teacher' }).locator('svg[role="application"]')
  await pad.scrollIntoViewIfNeeded()
  const next = Number(await pad.getAttribute('data-next-stroke'))
  for (let index = next; index < strokes.length; index++) {
    const bounds = (await pad.boundingBox())!
    const xy = (point: readonly [number, number]) =>
      [
        bounds.x + ((point[0] * layout.scale + layout.offsetX) * bounds.width) / 100,
        bounds.y + ((point[1] * layout.scale + layout.offsetY) * bounds.height) / 100,
      ] as const
    await page.mouse.move(...xy(strokes[index][0]))
    await page.mouse.down()
    for (const point of strokes[index].slice(1)) await page.mouse.move(...xy(point))
    await page.mouse.up()
    await expect(pad).toHaveAttribute('data-next-stroke', String(index + 1))
  }
  await frame.getByRole('button', { name: 'Next step', exact: true }).click()
}
function remoteRevision(documents: SyntheticFamilyDocuments) {
  for (const document of documents.values()) {
    const raw = (document.fields.payload as { stringValue?: string } | undefined)?.stringValue
    if (!raw) continue
    const progress = JSON.parse(raw).values?.writingAcquisitionProgress?.[0]
    if (progress) return progress.revision as number
  }
  return -1
}

test('packaged five-step writing resumes on a second browser and syncs an offline teaching step', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000)
  const documents: SyntheticFamilyDocuments = new Map()
  await installFamilyFixtures(page, documents)
  const frame = await launch(page)
  await expect(frame.getByRole('region', { name: 'Stroke order teacher' }).locator('.lg-round-label')).toContainText(
    'Step 1 of 5',
  )
  await finishTrial(page, frame)
  await expect.poll(() => remoteRevision(documents), { timeout: 30_000 }).toBe(1)
  const secondContext = await browser.newContext()
  try {
    const second = await secondContext.newPage()
    await installFamilyFixtures(second, documents)
    let cloudOffline = false
    await secondContext.route('**/firestore.googleapis.com/**', (route) =>
      cloudOffline ? route.abort('internetdisconnected') : route.fallback(),
    )
    const other = await launch(second)
    const teacher = other.getByRole('region', { name: 'Stroke order teacher' })
    await expect(teacher).toHaveAttribute('data-step', '2')
    await expect(teacher.locator('svg[role="application"]')).toHaveAttribute('data-next-stroke', '0')
    await finishTrial(second, other)
    await expect.poll(() => remoteRevision(documents), { timeout: 30_000 }).toBe(2)
    cloudOffline = true
    await secondContext.setOffline(true)
    await finishTrial(second, other)
    await expect(teacher).toHaveAttribute('data-step', '4')
    const retained = await second.evaluate((key) => localStorage.getItem(key), workspaceKey)
    expect(retained).toBeTruthy()
    expect(remoteRevision(documents)).toBe(2)
    cloudOffline = false
    await secondContext.setOffline(false)
    // Existing host sync runs on reload/focus; no test-only app bypass.
    await second.reload()
    await expect.poll(() => remoteRevision(documents), { timeout: 30_000 }).toBe(3)
    const resumed = await launch(page)
    await expect(resumed.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '4')
    await expect(resumed.locator('.teacher-supplied-stroke')).toHaveCount(2)
  } finally {
    await secondContext.close()
  }
})

test.describe('old-client and guarded-recovery checkpoint compatibility', () => {
  // This isolates record compatibility; service-worker upgrade acceptance is a separate gate.
  test.use({ serviceWorkers: 'block' })
  test('older package cannot overwrite five-step teaching and guarded recovery preserves it', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000)
    if (!process.env.FAMILY_SYNC_REHEARSAL_OLD_ARTIFACT) throw new Error('A retained predecessor artifact is required.')
    const select = async (version: string) => {
      const response = await request.post(`/__rehearsal__/version?version=${version}`)
      expect(response.ok()).toBe(true)
    }
    await select('candidate')
    await installFamilyFixtures(page)
    try {
      const frame = await launch(page)
      await finishTrial(page, frame)
      await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '2')
      const before = await page.evaluate((key) => localStorage.getItem(key), workspaceKey)
      await select('previous')
      await page.goto('/?grade=grade2')
      await expect(page.getByText(/preserved|could not|needs attention/i).first()).toBeVisible()
      expect(await page.evaluate((key) => localStorage.getItem(key), workspaceKey)).toBe(before)
      await select('rollback')
      await page.goto('/?grade=grade2')
      await expect(page.getByRole('heading', { name: 'Your saved work is preserved' })).toBeVisible()
      expect(await page.evaluate((key) => localStorage.getItem(key), workspaceKey)).toBe(before)
      await select('candidate')
      const restored = await launch(page)
      await expect(restored.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '2')
    } finally {
      await select('candidate')
    }
  })
})
