import { expect, type Page, test } from '@playwright/test'
import { installFamilyFixtures, type SyntheticFamilyDocuments } from './fixtures.ts'

async function start(page: Page, slug: string) {
  await page.goto(`/?grade=${slug}`)
  const frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await frame
    .getByRole('button', { name: slug === 'kindergarten' ? 'Writing characters' : 'Learn to Write', exact: true })
    .click()
  const skip = frame.getByRole('button', { name: 'Skip Warmup', exact: true })
  if (await skip.isVisible()) await skip.click()
  return frame
}

async function answer(page: Page) {
  const frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
  await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
}

for (const slug of ['kindergarten', 'grade5']) {
  test(`${slug}: two browsers finishing a shared lesson keep two immutable scores`, async ({ page, browser }) => {
    const documents: SyntheticFamilyDocuments = new Map()
    await installFamilyFixtures(page, documents)
    await start(page, slug)
    for (let i = 0; i < 4; i++) await answer(page)
    const checkpoint = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith('family-beta-acquisition-v1:'))!
      const raw = localStorage.getItem(key)!
      return { raw, id: JSON.parse(raw).sessionId as string }
    })
    // Wait for the reviewed checkpoint itself, not just a UI save message.
    await expect
      .poll(() =>
        [...documents.values()].some(
          (doc) =>
            doc.name.includes('/betaPractice/') &&
          (doc.fields.payload as { stringValue?: string })?.stringValue === checkpoint.raw,
        ),
      )
      .toBe(true)
    const otherContext = await browser.newContext({ ...test.info().project.use })
    try {
      const other = await otherContext.newPage()
      await installFamilyFixtures(other, documents)
      await start(other, slug)
      // Receiving a saved lesson doesn't count as a new attempt; reviewing does.
      await answer(other)
      await page.frameLocator('iframe:visible').getByRole('button', { name: 'Done for today', exact: true }).click()
      await other.frameLocator('iframe:visible').getByRole('button', { name: 'Done for today', exact: true }).click()
      await expect
        .poll(() => [...documents.values()].filter((doc) => doc.name.includes('/betaResults/')).length)
        .toBe(2)
      const ids = [...documents.values()]
        .filter((doc) => doc.name.includes('/betaResults/'))
        .map((doc) => (doc.fields.id as { stringValue: string }).stringValue)
      expect(new Set(ids).size).toBe(2)
      expect(ids).toContain(checkpoint.id)
      for (const device of [page, other]) {
        await expect
          .poll(() =>
            device.evaluate(
              () => Object.keys(localStorage).filter((key) => key.startsWith('family-beta-preview-pending-v1:')).length,
            ),
          )
          .toBe(0)
      }
    } finally {
      await otherContext.close()
    }
  })
}
