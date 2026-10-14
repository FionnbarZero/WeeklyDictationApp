import { createHash } from 'node:crypto'
import { expect, type Page, test } from '@playwright/test'
import { documentValue, plainValue } from '../../src/firestoreClient.ts'
import { installFamilyFixtures, type SyntheticFamilyDocuments } from './fixtures.ts'

const childId = 'synthetic-g2'
const key = `family-beta-acquisition-v1:${childId}:startup-conflict`
const digest = createHash('sha256').update(key).digest('hex')
const baseKey = `family-beta-sync-base-v1:family-synthetic-parent:${childId}:${digest}`
const accessKey = 'family-beta-offline-access-v1:synthetic-parent'
const name = `projects/weeklydictationapp/databases/(default)/documents/families/family-synthetic-parent/children/${childId}/betaPractice/${digest}`
const payload = (sessionId: string, reviewedAt?: string) =>
  JSON.stringify({
    sessionId,
    writerId: sessionId,
    envelope: { childId },
    reviewedTrials: reviewedAt ? [{ sessionId, reviewedAt }] : [],
  })

async function seedConflict(page: Page, documents: SyntheticFamilyDocuments) {
  const local = payload('local')
  const remote = payload('remote')
  const baseline = payload('baseline')
  documents.set(name, {
    name,
    updateTime: new Date().toISOString(),
    fields: Object.fromEntries(
      Object.entries({ schema: 1, childId, key, payload: remote, generation: 2 }).map(([field, value]) => [
        field,
        documentValue(value),
      ]),
    ),
  })
  await page.evaluate(
    ({ key, baseKey, local, baseline }) => {
      localStorage.setItem(key, local)
      localStorage.setItem(baseKey, baseline)
    },
    { key, baseKey, local, baseline },
  )
  return { local, remote, baseline }
}

test('online reload with a practice conflict permits confirmed local entry and retains both copies', async ({
  page,
}) => {
  const documents: SyntheticFamilyDocuments = new Map()
  await installFamilyFixtures(page, documents)
  await page.goto('/?grade=grade2')
  await expect(page.getByText(/Scores, saved practice, and game detail confirmed/)).toBeVisible()
  const copies = await seedConflict(page, documents)
  await page.reload()
  await expect(page.getByText(/Practice changed on both devices/)).toBeVisible()
  await expect(page.frameLocator('iframe:visible').getByRole('button', { name: /Enter the Dojo/ })).toBeVisible()
  await expect(page.getByText(/Using this device’s saved practice/)).toBeVisible()
  await expect(page.getByText(/Scores, saved practice, and game detail confirmed/)).toHaveCount(0)
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(copies.local)
  expect(await page.evaluate((key) => localStorage.getItem(key), baseKey)).toBe(copies.baseline)
  expect(plainValue(documents.get(name)!.fields.payload)).toBe(copies.remote)

  // Synthetic reviewed response: retries still use the existing checkpoint
  // arbitration and conditional write, never a new last-write-wins shortcut.
  const reviewed = payload('local', new Date().toISOString())
  await page.evaluate(({ key, reviewed }) => localStorage.setItem(key, reviewed), { key, reviewed })
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click()
  await expect(page.getByText(/Scores, saved practice, and game detail confirmed/)).toBeVisible()
  expect(plainValue(documents.get(name)!.fields.payload)).toBe(reviewed)
})

for (const invalid of ['no-confirmation', 'other-parent', 'other-family', 'other-grade', 'inactive'] as const) {
  test(`practice conflict does not grant startup entry with ${invalid}`, async ({ page }) => {
    const documents: SyntheticFamilyDocuments = new Map()
    await installFamilyFixtures(page, documents)
    await page.goto('/?grade=grade2')
    await expect(page.getByText(/Scores, saved practice, and game detail confirmed/)).toBeVisible()
    const copies = await seedConflict(page, documents)
    await page.evaluate(
      ({ accessKey, invalid, childId }) => {
        const cached = JSON.parse(localStorage.getItem(accessKey)!)
        if (invalid === 'no-confirmation') cached.ready = []
        if (invalid === 'other-parent') cached.uid = 'another-parent'
        if (invalid === 'other-family') cached.familyId = 'another-family'
        if (invalid === 'other-grade') cached.profiles.find((p: { id: string }) => p.id === childId).grade = 'Grade 5'
        if (invalid === 'inactive') cached.profiles.find((p: { id: string }) => p.id === childId).active = false
        localStorage.setItem(accessKey, JSON.stringify(cached))
      },
      { accessKey, invalid, childId },
    )
    await page.reload()
    await expect(page.getByText(/Practice changed on both devices/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry family sync', exact: true })).toBeVisible()
    await expect(page.locator('iframe')).toHaveCount(0)
    expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(copies.local)
    expect(plainValue(documents.get(name)!.fields.payload)).toBe(copies.remote)
  })
}

for (const failure of ['access-denied', 'invalid-record'] as const) {
  test(`confirmed cache does not bypass startup ${failure}`, async ({ page }) => {
    await installFamilyFixtures(page)
    await page.goto('/?grade=grade2')
    await expect(page.getByText(/Scores, saved practice, and game detail confirmed/)).toBeVisible()
    await page.route(`**/children/${childId}/betaPractice?*`, (route) =>
      route.fulfill({
        status: failure === 'access-denied' ? 403 : 200,
        contentType: 'application/json',
        body: JSON.stringify(
          failure === 'access-denied'
            ? {}
            : { documents: [{ name, fields: {}, updateTime: new Date().toISOString() }] },
        ),
      }),
    )
    await page.reload()
    await expect(page.getByRole('button', { name: 'Retry saving', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry family sync', exact: true })).toBeVisible()
    await expect(page.locator('iframe')).toHaveCount(0)
    if (failure === 'access-denied')
      expect(await page.evaluate((key) => localStorage.getItem(key), accessKey)).toBeNull()
  })
}
