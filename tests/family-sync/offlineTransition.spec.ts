import { expect, type Page, test } from '@playwright/test'
import { installFamilyFixtures, readGrade2Workspace } from './fixtures.ts'

test('an already-controlled browser upgrades, safely rolls back, and recovers its original Grade 2 records', async ({
  page,
  context,
  request,
}) => {
  test.skip(
    !process.env.FAMILY_SYNC_REHEARSAL_OLD_ARTIFACT,
    'Requires the verified retained previous release artifact; not a fresh-browser substitute.',
  )
  test.setTimeout(180_000)
  await installFamilyFixtures(page)
  const select = async (version: string) => {
    const result = await request.post(`/__rehearsal__/version?version=${version}`)
    expect(result.ok()).toBe(true)
    return result.json()
  }
  const records = (tab: Page) =>
    tab.evaluate(() =>
      Object.fromEntries(
        Object.keys(localStorage)
          .filter((key) => key.startsWith('family-beta-'))
          .sort()
          .map((key) => [key, localStorage.getItem(key)]),
      ),
    )
  const reopen = async () => {
    const frame = page.frameLocator('iframe:visible')
    await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
    await frame.getByRole('button', { name: 'Learn to Write', exact: true }).click()
    await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
    return frame
  }
  await select('previous')
  await page.goto('/?grade=grade2')
  const previousManifest = JSON.parse(await (await request.get('/family-beta-manifest.json')).text()) as {
    sourceRevision: string
  }
  await expect(page.getByText(`Beta build ${previousManifest.sourceRevision.slice(0, 7)}`)).toBeVisible()
  await page.getByLabel('Practice week').selectOption('2026-09-21')
  let frame = await reopen()
  await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
  await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
  const initialRecords = await records(page)
  const key = Object.keys(initialRecords).find(
    (storedKey) =>
      storedKey === 'family-beta-activity:synthetic-g2:weekly-dictation-state-v2' ||
      storedKey === 'family-beta-activity:synthetic-g2:lesson-workspace-v1',
  )
  expect(key).toBeTruthy()
  const old = (await page.evaluate(readGrade2Workspace))!
  const candidate = await select('candidate')
  await page.reload()
  await expect(page.locator('[data-offline-shell-status]')).toContainText('An app update is ready')
  // The offline shell intentionally waits until every Dojo tab closes before
  // activating a replacement, so an active lesson is never swapped in place.
  await page.goto('about:blank')
  await expect
    .poll(async () => {
      for (const worker of context.serviceWorkers()) {
        try {
          const ready = await worker.evaluate(
            async () => !(await self.registration.waiting) && !self.registration.installing,
          )
          if (ready) return true
        } catch {
          /* The replaced worker can become redundant during polling. */
        }
      }
      return false
    })
    .toBe(true)
  await page.goto('/?grade=grade2')
  await expect(page.getByText(`Beta build ${candidate.candidate.slice(0, 7)}`)).toBeVisible()
  await page.getByLabel('Practice week').selectOption('2026-09-21')
  frame = await reopen()
  const upgraded = (await page.evaluate(readGrade2Workspace))!
  expect(upgraded.acquisitionProgressEnvelopes[0].revision).toBe(old.acquisitionProgressEnvelopes[0].revision)
  expect(upgraded.acquisitionProgressEnvelopes[0].lessonSnapshot).toBeTruthy()
  await expect(page.locator('[data-offline-shell-status]')).toContainText('Offline app ready')
  // First installation does not claim the old document: reload makes it controlled.
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await expect(page.getByText(/Scores, saved practice, and game detail confirmed/)).toBeVisible()
  const beforeRollback = await records(page)

  async function activateReplacement(version: 'rollback' | 'candidate') {
    await select(version)
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())!.update()
    })
    await expect
      .poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting))
      .toBe(true)
    // Updating may not replace the live document or its engine.
    await page.goto('about:blank')
    await expect
      .poll(
        async () => {
          const workers = context.serviceWorkers()
          if (workers.length === 0) return true
          for (const worker of workers) {
            try {
              // A retired worker can leave evaluate pending forever instead of
              // rejecting. Bound that probe so it cannot hide the new worker;
              // the outer activation deadline and served-build checks remain.
              const ready = await Promise.race([
                worker.evaluate(async () => !(await self.registration.waiting) && !self.registration.installing),
                new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 250)),
              ])
              if (ready) return true
            } catch {
              /* The replaced worker can become redundant during polling. */
            }
          }
          return false
        },
        { timeout: 15_000 },
      )
      .toBe(true)
    await page.goto('/?grade=grade2')
  }

  await activateReplacement('rollback')
  await expect(page.getByRole('heading', { name: 'Your saved work is preserved' })).toBeVisible()
  await expect(page.getByLabel('Child profile')).toHaveCount(0)
  expect(await records(page)).toEqual(beforeRollback)
  // The guarded rollback shell also works with its controlled cache offline.
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your saved work is preserved' })).toBeVisible()
  expect(await records(page)).toEqual(beforeRollback)
  await context.setOffline(false)

  await activateReplacement('candidate')
  await expect(page.getByText(`Beta build ${candidate.candidate.slice(0, 7)}`)).toBeVisible()
  await page.getByText('Saved lessons', { exact: true }).click()
  await page.getByRole('button', { name: /Resume saved writing/ }).click()
  frame = await reopen()
  await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
  await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
  const restored = (await page.evaluate(readGrade2Workspace))!
  expect(restored.acquisitionProgressEnvelopes[0].revision).toBe(upgraded.acquisitionProgressEnvelopes[0].revision + 1)
  expect(restored.acquisitionProgressEnvelopes[0].lessonSnapshot).toEqual(
    upgraded.acquisitionProgressEnvelopes[0].lessonSnapshot,
  )
  expect(restored.results.slice(0, old.results.length)).toEqual(old.results)
  if (key!.endsWith('weekly-dictation-state-v2')) expect((await records(page))[key!]).toBe(initialRecords[key!])
})

test('a game-only Stage B checkpoint blocks the older engine without reading credentials or changing storage', async ({
  page,
  context,
  request,
  isMobile,
}) => {
  test.skip(
    !process.env.FAMILY_SYNC_REHEARSAL_OLD_ARTIFACT,
    'Requires the verified retained previous release artifact; not a fresh-browser substitute.',
  )
  test.setTimeout(180_000)
  await installFamilyFixtures(page)
  const select = async (version: 'candidate' | 'rollback') => {
    const result = await request.post(`/__rehearsal__/version?version=${version}`)
    expect(result.ok()).toBe(true)
    return result.json() as Promise<{ candidate: string }>
  }
  const records = () =>
    page.evaluate(() =>
      Object.fromEntries(
        Object.keys(localStorage)
          .filter((key) => key.startsWith('family-beta-'))
          .sort()
          .map((key) => [key, localStorage.getItem(key)]),
      ),
    )
  const activateReplacement = async (version: 'candidate' | 'rollback') => {
    await select(version)
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())!.update()
    })
    await expect
      .poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting))
      .toBe(true)
    await page.goto('about:blank')
    await expect
      .poll(
        async () => {
          const workers = context.serviceWorkers()
          if (workers.length === 0) return true
          for (const worker of workers) {
            try {
              if (
                await Promise.race([
                  worker.evaluate(async () => !(await self.registration.waiting) && !self.registration.installing),
                  new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 250)),
                ])
              )
                return true
            } catch {
              /* The replaced worker can become redundant during polling. */
            }
          }
          return false
        },
        { timeout: 15_000 },
      )
      .toBe(true)
    await page.goto('/?grade=grade5')
  }

  const candidate = await select('candidate')
  await page.goto('/?grade=grade5')
  await expect(page.getByText(`Beta build ${candidate.candidate.slice(0, 7)}`)).toBeVisible()
  await expect(page.locator('[data-offline-shell-status]')).toContainText('Offline app ready', { timeout: 120_000 })
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await page.getByRole('button', { name: 'Ninja Skills', exact: true }).click()
  await page.getByRole('button', { name: 'Memory Lanterns', exact: true }).click()
  const cards = page.frameLocator('iframe:visible').locator('.lg-memory-card')
  await expect(cards.first()).toBeVisible()
  const faces = await cards.locator('.lg-card-face b').allTextContents()
  const pair = faces.flatMap((face, index) => (face === faces[0] ? [index] : []))
  for (const index of pair) {
    if (isMobile) await cards.nth(index).tap()
    else await cards.nth(index).click()
  }
  await expect(cards.nth(pair[0])).toHaveClass(/is-matched/)
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage))
      if (key.startsWith('family-beta-') && !key.startsWith('family-beta-games-v1:')) localStorage.removeItem(key)
  })
  const beforeRollback = await records()
  expect(Object.keys(beforeRollback).some((key) => key.includes(':checkpoint:'))).toBe(true)
  expect(Object.keys(beforeRollback).every((key) => key.startsWith('family-beta-games-v1:'))).toBe(true)
  await page.addInitScript(() => {
    const originalGet = Storage.prototype.getItem
    const originalSet = Storage.prototype.setItem
    const originalRemove = Storage.prototype.removeItem
    const originalClear = Storage.prototype.clear
    Storage.prototype.getItem = function (key) {
      if (key === 'weekly-dictation-auth-v1')
        (window as Window & { __rollbackCredentialRead?: boolean }).__rollbackCredentialRead = true
      return originalGet.call(this, key)
    }
    Storage.prototype.setItem = function (key, value) {
      ;(window as Window & { __rollbackStorageWrite?: boolean }).__rollbackStorageWrite = true
      return originalSet.call(this, key, value)
    }
    Storage.prototype.removeItem = function (key) {
      ;(window as Window & { __rollbackStorageWrite?: boolean }).__rollbackStorageWrite = true
      return originalRemove.call(this, key)
    }
    Storage.prototype.clear = function () {
      ;(window as Window & { __rollbackStorageWrite?: boolean }).__rollbackStorageWrite = true
      return originalClear.call(this)
    }
  })

  await activateReplacement('rollback')
  await expect(page.getByRole('heading', { name: 'Your saved work is preserved' })).toBeVisible()
  expect(
    await page.evaluate(() => ({
      credentialRead: (window as Window & { __rollbackCredentialRead?: boolean }).__rollbackCredentialRead ?? false,
      storageWrite: (window as Window & { __rollbackStorageWrite?: boolean }).__rollbackStorageWrite ?? false,
    })),
  ).toEqual({ credentialRead: false, storageWrite: false })
  expect(await records()).toEqual(beforeRollback)
  await expect(page.getByLabel('Child profile')).toHaveCount(0)

  await activateReplacement('candidate')
  await expect(page.getByText(`Beta build ${candidate.candidate.slice(0, 7)}`)).toBeVisible()
  await page.getByRole('button', { name: 'Ninja Skills', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Resume Memory Lanterns', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Resume Memory Lanterns', exact: true }).click()
  await expect(page.frameLocator('iframe:visible').locator('.is-matched')).toHaveCount(2)
})
