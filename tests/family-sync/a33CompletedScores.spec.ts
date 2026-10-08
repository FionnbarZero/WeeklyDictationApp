import { createHash } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { grades, installFamilyFixtures } from './fixtures.ts'

for (const [slug, grade, childId] of grades) {
  test(`${grade}: a practice conflict cannot hold a completed score in the outbox`, async ({ page }) => {
    await installFamilyFixtures(page)
    const key = `family-beta-activity:${childId}:synthetic-checkpoint`
    const id = createHash('sha256').update(key).digest('hex')
    const result = {
      schema: 1,
      id: `completed-${slug}`,
      childId,
      grade,
      activity: 'Synthetic completed practice',
      channel: 'writing',
      datasetIds: ['synthetic-week'],
      correct: 1,
      attempted: 2,
      completedAt: '2026-10-07T18:00:00.000Z',
      day: '2026-10-07',
    }
    await page.addInitScript(
      ({ key, id, childId, result }) => {
        localStorage.setItem(key, 'local unfinished copy')
        localStorage.setItem(`family-beta-sync-base-v1:family-synthetic-parent:${childId}:${id}`, 'original copy')
        localStorage.setItem(`family-beta-preview-results-v1:${result.id}`, JSON.stringify(result))
        localStorage.setItem(`family-beta-preview-pending-v1:${result.id}`, JSON.stringify(result))
      },
      { key, id, childId, result },
    )
    await page.route(`**/children/${childId}/betaPractice?*`, (route) =>
      route.fulfill({
        json: {
          documents: [
            {
              name: `projects/weeklydictationapp/databases/(default)/documents/families/family-synthetic-parent/children/${childId}/betaPractice/${id}`,
              updateTime: '2026-10-07T19:00:00.000Z',
              fields: {
                schema: { integerValue: '1' },
                childId: { stringValue: childId },
                key: { stringValue: key },
                payload: { stringValue: 'remote unfinished copy' },
                generation: { integerValue: '2' },
              },
            },
          ],
        },
      }),
    )
    let confirmed = false
    page.on('response', (response) => {
      if (
        response.request().method() === 'GET' &&
        response.url().endsWith(`/betaResults/${result.id}`) &&
        response.ok()
      )
        confirmed = true
    })
    await page.goto(`/?grade=${slug}`)
    await expect
      .poll(() => page.evaluate((id) => localStorage.getItem(`family-beta-preview-pending-v1:${id}`), result.id))
      .toBeNull()
    expect(confirmed).toBe(true)
    expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe('local unfinished copy')
    expect(
      await page.evaluate((id) => JSON.parse(localStorage.getItem(`family-beta-preview-results-v1:${id}`)!), result.id),
    ).toEqual(result)
  })
}
