import { createHash } from 'node:crypto'
import { expect, type Page, test } from '@playwright/test'
import { practiceWorkspaceKey, practiceWorkspaceSyncKey } from '../../src/familyBeta/practiceWorkspaceStorage.ts'
import { documentValue, plainValue } from '../../src/firestoreClient.ts'
import { installFamilyFixtures, readGrade2Workspace, type SyntheticFamilyDocuments } from './fixtures.ts'

const childId = 'synthetic-g2'
const key = `family-beta-acquisition-v1:${childId}:startup-conflict`
const digest = createHash('sha256').update(key).digest('hex')
const baseKey = `family-beta-sync-base-v1:family-synthetic-parent:${childId}:${digest}`
const accessKey = 'family-beta-offline-access-v1:synthetic-parent'
const name = `projects/weeklydictationapp/databases/(default)/documents/families/family-synthetic-parent/children/${childId}/betaPractice/${digest}`

for (const invalid of ['malformed-json', 'wrong-child', 'oversized-nested-array'] as const) {
  test(`valid online wrapper with ${invalid} partition remains gated and preserves saved work`, async ({ page }) => {
    const documents: SyntheticFamilyDocuments = new Map()
    await installFamilyFixtures(page, documents)
    await page.goto('/?grade=grade2')
    await expect(page.getByText(/Scores, saved practice, and game detail confirmed/)).toBeVisible()
    const frame = page.frameLocator('iframe:visible')
    await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
    const workspaceKey = practiceWorkspaceKey(childId)
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), workspaceKey)).not.toBeNull()
    const local = await page.evaluate((key) => localStorage.getItem(key)!, workspaceKey)
    const partitionKey = practiceWorkspaceSyncKey(childId, 'weekly-dictation-checkpoint-v1')
    const id = createHash('sha256').update(partitionKey).digest('hex')
    const partitionName = name.slice(0, name.lastIndexOf('/') + 1) + id
    const remote =
      invalid === 'malformed-json'
        ? '{'
        : JSON.stringify({
            schema: 1,
            childId: invalid === 'wrong-child' ? 'other-child' : childId,
            values: invalid === 'oversized-nested-array' ? { nested: Array(501).fill(0) } : {},
          })
    documents.set(partitionName, {
      name: partitionName,
      updateTime: new Date().toISOString(),
      fields: Object.fromEntries(
        Object.entries({ schema: 1, childId, key: partitionKey, payload: remote, generation: 2 }).map(
          ([field, value]) => [field, documentValue(value)],
        ),
      ),
    })
    const baselineKey = `family-beta-sync-base-v1:family-synthetic-parent:${childId}:${id}`
    await page.addInitScript(
      ({ baselineKey }) => {
        if (window === window.top) localStorage.setItem(baselineKey, 'divergent baseline')
      },
      { baselineKey },
    )
    await page.reload()
    await expect(page.getByRole('button', { name: 'Retry saving', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry family sync', exact: true })).toBeVisible()
    await expect(page.locator('iframe')).toHaveCount(0)
    await expect(page.getByText(/Using this device’s saved practice/)).toHaveCount(0)
    expect(await page.evaluate((key) => localStorage.getItem(key), workspaceKey)).toBe(local)
    expect(await page.evaluate((key) => localStorage.getItem(key), baselineKey)).toBe('divergent baseline')
    expect(plainValue(documents.get(partitionName)!.fields.payload)).toBe(remote)
  })
}

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

test('first Grade 2 sync earns entry only after fresh score checks despite an existing practice conflict', async ({
  page,
}) => {
  const documents: SyntheticFamilyDocuments = new Map()
  await installFamilyFixtures(page, documents)
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
  await page.addInitScript(
    ({ key, baseKey, accessKey, local, baseline }) => {
      if (window !== window.top || sessionStorage.getItem('first-sync-conflict-seeded')) return
      sessionStorage.setItem('first-sync-conflict-seeded', 'yes')
      localStorage.setItem(key, local)
      localStorage.setItem(baseKey, baseline)
      localStorage.setItem(
        accessKey,
        JSON.stringify({
          schema: 1,
          uid: 'synthetic-parent',
          familyId: 'family-synthetic-parent',
          profiles: [
            { id: 'synthetic-g2', grade: 'Grade 2', nickname: 'Grade 2 learner', active: true },
            { id: 'synthetic-k', grade: 'Kindergarten', nickname: 'Kindergarten learner', active: true },
            { id: 'synthetic-g5', grade: 'Grade 5', nickname: 'Grade 5 learner', active: true },
          ],
          ready: ['synthetic-k', 'synthetic-g5'],
        }),
      )
    },
    { key, baseKey, accessKey, local, baseline },
  )
  let denyHistory = true
  await page.route(`**/children/${childId}:runQuery`, (route) =>
    denyHistory ? route.fulfill({ status: 403, contentType: 'application/json', body: '{}' }) : route.fallback(),
  )
  await page.goto('/?grade=grade2')
  await expect(page.getByText(/Saved results could not be loaded \(403\)/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry family sync', exact: true })).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(0)
  expect(await page.evaluate((key) => localStorage.getItem(key), accessKey)).toBeNull()

  denyHistory = false
  await page.getByRole('button', { name: 'Retry family sync', exact: true }).click()
  await expect(page.frameLocator('iframe:visible').getByRole('button', { name: /Enter the Dojo/ })).toBeVisible()
  await expect(page.getByText(/Using this device’s saved practice/)).toBeVisible()
  await expect(page.getByText(/Scores, saved practice, and game detail confirmed/)).toHaveCount(0)
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).ready, accessKey)).toContain(childId)
  await page.reload()
  await expect(page.frameLocator('iframe:visible').getByRole('button', { name: /Enter the Dojo/ })).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(local)
  expect(await page.evaluate((key) => localStorage.getItem(key), baseKey)).toBe(baseline)
  expect(plainValue(documents.get(name)!.fields.payload)).toBe(remote)
})

test('restarting after an unrelated conflict never uploads a staged but uncommitted older workspace copy', async ({
  page,
}) => {
  const documents: SyntheticFamilyDocuments = new Map()
  await installFamilyFixtures(page, documents)
  await page.goto('/?grade=grade2')
  await expect(page.getByText(/Scores, saved practice, and game detail confirmed/)).toBeVisible()
  await page
    .frameLocator('iframe:visible')
    .getByRole('button', { name: /Enter the Dojo/ })
    .click()
  const workspaceKey = practiceWorkspaceKey(childId)
  const partitionRecord = 'weekly-dictation-checkpoint-v1'
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), workspaceKey)).not.toBeNull()
  const local = await page.evaluate(
    ({ workspaceKey, partitionRecord }) =>
      JSON.parse(localStorage.getItem(workspaceKey)!).records[partitionRecord] as string,
    { workspaceKey, partitionRecord },
  )
  const partitionKey = practiceWorkspaceSyncKey(childId, partitionRecord)
  const id = createHash('sha256').update(partitionKey).digest('hex')
  const partitionName = name.slice(0, name.lastIndexOf('/') + 1) + id
  const remote = JSON.stringify({
    ...JSON.parse(local),
    values: { ...JSON.parse(local).values, rotationCycles: { [childId]: 17 } },
  })
  documents.set(partitionName, {
    name: partitionName,
    updateTime: new Date().toISOString(),
    fields: Object.fromEntries(
      Object.entries({ schema: 1, childId, key: partitionKey, payload: remote, generation: 2 }).map(
        ([field, value]) => [field, documentValue(value)],
      ),
    ),
  })
  const copies = await seedConflict(page, documents)
  const baselineKey = `family-beta-sync-base-v1:family-synthetic-parent:${childId}:${id}`
  await page.addInitScript(
    ({ baselineKey, local }) => {
      if (window === window.top && !sessionStorage.getItem('synthetic-staged-baseline-seeded')) {
        localStorage.setItem(baselineKey, local)
        sessionStorage.setItem('synthetic-staged-baseline-seeded', 'yes')
      }
    },
    { baselineKey, local },
  )
  await page.reload()
  const entry = page.frameLocator('iframe:visible').getByRole('button', { name: /Enter the Dojo/ })
  const preservedWarning = page
    .getByRole('alert')
    .filter({ hasText: /Practice changed on both devices|Newer practice is available/ })
  await expect(entry).toBeVisible()
  await expect(preservedWarning).toBeVisible()
  for (let retry = 0; retry < 2; retry += 1) {
    expect(await page.evaluate((key) => localStorage.getItem(key), baselineKey)).toBe(local)
    expect(plainValue(documents.get(partitionName)!.fields.payload)).toBe(remote)
    expect(
      await page.evaluate(
        ({ workspaceKey, partitionRecord }) => JSON.parse(localStorage.getItem(workspaceKey)!).records[partitionRecord],
        { workspaceKey, partitionRecord },
      ),
    ).toBe(local)
    // An already-open activity correctly blocks downloads; exercise the cold
    // restart path that permits hydration and exposed the baseline corruption.
    await page.reload()
    // Mounting the restored activity can trigger another sync whose download
    // ownership guard replaces the initial conflict status. Either warning
    // preserves the same copies; entry and exact data, not transient prose,
    // are the contract under test.
    await expect(entry).toBeVisible()
    await expect(preservedWarning).toBeVisible()
  }
  expect(
    await page.evaluate(
      ({ workspaceKey, partitionRecord }) => JSON.parse(localStorage.getItem(workspaceKey)!).records[partitionRecord],
      { workspaceKey, partitionRecord },
    ),
  ).toBe(local)
  expect(await page.evaluate((key) => localStorage.getItem(key), baselineKey)).toBe(local)
  expect(plainValue(documents.get(partitionName)!.fields.payload)).toBe(remote)
  expect(plainValue(documents.get(name)!.fields.payload)).toBe(copies.remote)
})

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

test('a saved lesson resumes and retains new reviewed work while another practice conflict remains', async ({
  page,
}) => {
  const documents: SyntheticFamilyDocuments = new Map()
  await installFamilyFixtures(page, documents)
  await page.goto('/?grade=grade2')
  await page.getByLabel('Practice week').selectOption('2026-09-21')
  const frame = page.frameLocator('iframe:visible')
  const enter = async () => {
    await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
    await frame.getByRole('button', { name: 'Learn to Write', exact: true }).click()
    await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
  }
  const answer = async () => {
    await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
    await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
  }
  await enter()
  await answer()
  const before = (await page.evaluate(readGrade2Workspace))!.acquisitionProgressEnvelopes[0]
  const copies = await seedConflict(page, documents)
  await page.reload()
  await expect(page.getByText(/Using this device’s saved practice/)).toBeVisible()
  await page.getByText('Saved lessons', { exact: true }).click()
  await page.getByRole('button', { name: /Resume saved writing/ }).click()
  await enter()
  expect((await page.evaluate(readGrade2Workspace))!.acquisitionProgressEnvelopes[0]).toEqual(before)
  await answer()
  await expect
    .poll(async () => (await page.evaluate(readGrade2Workspace))!.acquisitionProgressEnvelopes[0].revision)
    .toBe(before.revision + 1)
  await page.reload()
  await expect(page.getByText(/Using this device’s saved practice/)).toBeVisible()
  expect((await page.evaluate(readGrade2Workspace))!.acquisitionProgressEnvelopes[0].revision).toBe(before.revision + 1)
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(copies.local)
  expect(plainValue(documents.get(name)!.fields.payload)).toBe(copies.remote)
})

for (const invalid of ['no-confirmation', 'other-parent', 'other-family', 'other-grade', 'inactive'] as const) {
  test(`fresh online verification earns entry despite ${invalid} cached readiness`, async ({ page }) => {
    const documents: SyntheticFamilyDocuments = new Map()
    await installFamilyFixtures(page, documents)
    await page.goto('/?grade=grade2')
    await expect(page.getByText(/Scores, saved practice, and game detail confirmed/)).toBeVisible()
    const copies = await seedConflict(page, documents)
    const cachedRaw = await page.evaluate((accessKey) => localStorage.getItem(accessKey)!, accessKey)
    // Set the exact cold-start condition before the replacement app executes.
    // Mutating an active tab can race its already-successful sync acknowledgement.
    await page.addInitScript(
      ({ accessKey, invalid, childId, cachedRaw }) => {
        if (window !== window.top) return
        const cached = JSON.parse(cachedRaw)
        if (invalid === 'no-confirmation') cached.ready = []
        if (invalid === 'other-parent') cached.uid = 'another-parent'
        if (invalid === 'other-family') cached.familyId = 'another-family'
        if (invalid === 'other-grade') cached.profiles.find((p: { id: string }) => p.id === childId).grade = 'Grade 5'
        if (invalid === 'inactive') cached.profiles.find((p: { id: string }) => p.id === childId).active = false
        localStorage.setItem(accessKey, JSON.stringify(cached))
      },
      { accessKey, invalid, childId, cachedRaw },
    )
    await page.reload()
    await expect(page.getByText(/Practice changed on both devices/)).toBeVisible()
    await expect(page.frameLocator('iframe:visible').getByRole('button', { name: /Enter the Dojo/ })).toBeVisible()
    await expect(page.getByText(/Your family account and scores are confirmed/)).toBeVisible()
    expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(copies.local)
    expect(plainValue(documents.get(name)!.fields.payload)).toBe(copies.remote)
  })
}

for (const failure of ['game-access-denied', 'score-unavailable', 'invalid-score'] as const) {
  test(`first-time conflict entry stays blocked when fresh verification has ${failure}`, async ({ page }) => {
    const documents: SyntheticFamilyDocuments = new Map()
    await installFamilyFixtures(page, documents)
    await page.goto('/?grade=grade2')
    await expect(page.getByText(/Scores, saved practice, and game detail confirmed/)).toBeVisible()
    const copies = await seedConflict(page, documents)
    await page.addInitScript((accessKey) => {
      if (window !== window.top) return
      const raw = localStorage.getItem(accessKey)
      if (raw) localStorage.setItem(accessKey, JSON.stringify({ ...JSON.parse(raw), ready: [] }))
    }, accessKey)
    await page.route(
      failure === 'game-access-denied'
        ? `**/children/${childId}/betaGameCompletions?*`
        : `**/children/${childId}:runQuery`,
      (route) =>
        route.fulfill({
          status: failure === 'game-access-denied' ? 403 : failure === 'score-unavailable' ? 503 : 200,
          contentType: 'application/json',
          body: failure === 'invalid-score' ? '[{"document":{"fields":{}}}]' : '{}',
        }),
    )
    await page.reload()
    await expect(page.getByRole('button', { name: 'Retry saving', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry family sync', exact: true })).toBeVisible()
    await expect(page.locator('iframe')).toHaveCount(0)
    expect(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null')?.ready || [], accessKey),
    ).not.toContain(childId)
    expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(copies.local)
    expect(await page.evaluate((key) => localStorage.getItem(key), baseKey)).toBe(copies.baseline)
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
