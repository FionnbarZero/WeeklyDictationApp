import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { installFamilyFixtures, type SyntheticFamilyDocuments } from '../family-sync/fixtures.ts'
import { strokeOrderGuide } from '../../src/familyBeta/strokeOrderSlay.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'

const grades = [
  { slug: 'kindergarten', child: 'synthetic-k', button: 'Writing characters', character: '土', week: '2026-10-12' },
  { slug: 'grade2', child: 'synthetic-g2', button: 'Learn to Write', character: '走', week: '2026-10-13' },
  { slug: 'grade5', child: 'synthetic-g5', button: 'Learn to Write', character: '盐', week: '2026-10-05' },
]

async function fixtures(page: Page, documents: SyntheticFamilyDocuments) {
  await page.clock.setFixedTime(new Date('2026-10-16T19:00:00Z'))
  await installFamilyFixtures(page, documents)
  // Test-owned curriculum, same current-week fixture as the isolated prototype.
  // The underlying family fixture aborts every other unrecognized external request.
  await page.route('**/curriculum/beta/*.json', (route) => {
    const slug = new URL(route.request().url()).pathname.split('/').pop()!
    return route.fulfill({
      contentType: 'application/json',
      body: readFileSync(new URL(`../fixtures/dojo-launch-2026-10-16/${slug}`, import.meta.url), 'utf8'),
    })
  })
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('playing'))
      setTimeout(() => this.dispatchEvent(new Event('ended')), 10)
      return Promise.resolve()
    }
  })
}

async function launch(page: Page, grade: (typeof grades)[number]) {
  await page.goto(`/family-beta-preview.html?grade=${grade.slug}`)
  const frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await expect(page.getByLabel('Practice week')).toHaveValue('')
  await expect(page.locator('iframe:visible')).toHaveAttribute('data-family-week', grade.week)
  await frame.getByRole('button', { name: grade.button, exact: true }).click()
  const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
  const warmup = frame.getByRole('button', { name: 'Skip Warmup', exact: true })
  await expect(teacher.or(warmup)).toBeVisible()
  if (await warmup.isVisible()) await warmup.click()
  await expect(teacher).toBeVisible()
  return teacher
}

async function advance(page: Page, character: string) {
  const frame = page.frameLocator('iframe:visible')
  const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
  const step = Number(await teacher.getAttribute('data-step'))
  const pad = teacher.locator('svg[role="application"]')
  const strokes = strokeOrderGuide({ id: 'synthetic-resume', text: character }).strokes
  const layout = getStrokeLayout(strokes)
  for (let i = Number(await pad.getAttribute('data-next-stroke')); i < strokes.length; i++) {
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
  await expect(teacher).toHaveAttribute('data-step', String(step + 1))
}

function remoteRevision(documents: SyntheticFamilyDocuments, child: string) {
  for (const doc of documents.values()) {
    if (!doc.name.includes(`/children/${child}/betaPractice/`)) continue
    const raw = (doc.fields.payload as { stringValue?: string } | undefined)?.stringValue
    if (!raw) continue
    const payload = JSON.parse(raw)
    const progress = payload.writing || payload.values?.writingAcquisitionProgress?.[0]
    if (progress) return progress.revision as number
  }
  return -1
}

for (const grade of grades)
  test(`${grade.slug}: ordinary current Writing transfers, retains offline work and resumes after synchronization`, async ({
    page,
    browser,
  }) => {
    const documents: SyntheticFamilyDocuments = new Map()
    await fixtures(page, documents)
    await launch(page, grade)
    await advance(page, grade.character)
    await expect.poll(() => remoteRevision(documents, grade.child), { timeout: 30_000 }).toBe(1)
    const otherContext = await browser.newContext()
    try {
      const other = await otherContext.newPage()
      await fixtures(other, documents)
      let offline = false
      await otherContext.route('**/firestore.googleapis.com/**', (route) =>
        offline ? route.abort('internetdisconnected') : route.fallback(),
      )
      const teacher = await launch(other, grade)
      await expect(teacher).toHaveAttribute('data-step', '2')
      await expect(teacher.locator('svg[role="application"]')).toHaveAttribute('data-next-stroke', '0')
      await advance(other, grade.character)
      await expect.poll(() => remoteRevision(documents, grade.child), { timeout: 30_000 }).toBe(2)
      offline = true
      await otherContext.setOffline(true)
      await advance(other, grade.character)
      expect(remoteRevision(documents, grade.child)).toBe(2)
      offline = false
      await otherContext.setOffline(false)
      await other.reload()
      await expect.poll(() => remoteRevision(documents, grade.child), { timeout: 30_000 }).toBe(3)
      const returned = await launch(page, grade)
      await expect(returned).toHaveAttribute('data-step', '4')
      await expect(returned.getByRole('heading', { name: grade.character, exact: true })).toBeVisible()
    } finally {
      await otherContext.close()
    }
  })
