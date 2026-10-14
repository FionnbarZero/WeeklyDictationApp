import { type BrowserContext, expect, test } from '@playwright/test'
import { grades, installFamilyFixtures } from '../family-sync/fixtures.ts'

async function waitForReplacement(context: BrowserContext) {
  await expect
    .poll(
      async () => {
        const workers = context.serviceWorkers()
        if (workers.length === 0) return true
        for (const worker of workers) {
          try {
            const ready = await Promise.race([
              worker.evaluate(() => !self.registration.waiting && !self.registration.installing),
              new Promise<boolean>((done) => setTimeout(() => done(false), 250)),
            ])
            if (ready) return true
          } catch {
            /* a replaced worker may no longer have an execution context */
          }
        }
        return false
      },
      { timeout: 15_000 },
    )
    .toBe(true)
}

for (const [slug, grade] of grades) {
  test(`${grade}: reviewed writing survives predecessor, candidate, guarded recovery and candidate return`, async ({
    page,
    context,
    request,
  }) => {
    test.setTimeout(180_000)
    await installFamilyFixtures(page)
    const select = async (version: string) => {
      const response = await request.post(`/__rehearsal__/version?version=${version}`)
      expect(response.ok()).toBe(true)
    }
    const records = () =>
      page.evaluate(() =>
        Object.fromEntries(
          Object.keys(localStorage)
            .filter((key) => key.startsWith('family-beta-acquisition-v1:') || key.endsWith(':lesson-workspace-v1'))
            .sort()
            .map((key) => [key, localStorage.getItem(key)]),
        ),
      )
    await select('previous')
    await page.goto(`/?grade=${slug}`)
    if (slug === 'grade2') await page.getByLabel('Practice week').selectOption('2026-09-21')
    const frame = page.frameLocator('iframe:visible')
    await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
    await frame
      .getByRole('button', { name: slug === 'kindergarten' ? 'Writing characters' : 'Learn to Write', exact: true })
      .click()
    if (slug !== 'kindergarten') await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
    await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
    await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
    await expect(page.getByText(/Scores, saved practice, and game detail confirmed/)).toBeVisible()
    const before = await records()
    expect(Object.keys(before).length).toBeGreaterThan(0)
    await expect(page.locator('[data-offline-shell-status]')).toContainText('Offline app ready')
    await page.reload()
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
    for (const version of ['candidate', 'rollback', 'candidate']) {
      await select(version)
      await page.evaluate(async () => {
        await (await navigator.serviceWorker.getRegistration())!.update()
      })
      await expect
        .poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting)), {
          timeout: 15_000,
        })
        .toBe(true)
      await page.goto('about:blank')
      await waitForReplacement(context)
      await page.goto(`/?grade=${slug}`)
      if (version === 'rollback') {
        await expect(page.getByRole('heading', { name: 'Your saved work is preserved' })).toBeVisible()
        await expect(page.getByLabel('Child profile')).toHaveCount(0)
      } else {
        await expect(page.getByText(`Beta build ${process.env.FAMILY_SECURITY_REVISION!.slice(0, 7)}`)).toBeVisible()
        await expect(page.getByText(/Scores, saved practice, and game detail confirmed/)).toBeVisible()
        expect(
          await page.evaluate(async () =>
            (await fetch('/family-beta-preview.html')).headers.get('content-security-policy'),
          ),
        ).toContain("frame-ancestors 'self'")
      }
      expect(await records()).toEqual(before)
    }
  })
}
