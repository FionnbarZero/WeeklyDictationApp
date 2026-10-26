import { writeFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { futureSnapshot, grades, snapshot } from './fixtures.ts'

const endpoint = '**/weekly-dictation-curriculum-*/curriculum/beta/*.json'
const currentFrame = (page: Page) => page.locator('iframe:visible')
const frame = (page: Page) => page.frameLocator('iframe:visible')

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-23T19:00:00Z'))
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices() {
          return []
        },
        speak(u: SpeechSynthesisUtterance) {
          u.onstart?.({} as SpeechSynthesisEvent)
          setTimeout(() => u.onend?.({} as SpeechSynthesisEvent), 5)
        },
      },
    })
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('playing'))
      setTimeout(() => this.dispatchEvent(new Event('ended')), 10)
      return Promise.resolve()
    }
    const top = window.parent as Window & {
      auditHold?: boolean
      auditReject?: boolean
      auditLocks?: string[]
      auditReleases?: (() => void)[]
    }
    if (window === window.parent) {
      top.auditLocks = []
      top.auditReleases = []
    }
    const request = navigator.locks.request.bind(navigator.locks)
    navigator.locks.request = ((name: string, ...args: unknown[]) => {
      const proceed = () =>
        top.auditReject && name.startsWith('ninja-scrolls-write:')
          ? Promise.reject(new Error('Test writing save unavailable. Please retry.'))
          : (request as (...args: unknown[]) => Promise<unknown>)(name, ...args)
      if (!top.auditHold || !name.startsWith('ninja-scrolls-write:')) return proceed()
      top.auditLocks!.push(name)
      return new Promise<void>((resolve) => top.auditReleases!.push(resolve)).then(proceed)
    }) as typeof navigator.locks.request
  })
})

for (const grade of grades)
  for (const update of [false, true]) {
    test(`${grade.slug}: ${update ? 'new source must preserve' : 'control preserves'} an opening writing lesson`, async ({
      page,
    }) => {
      let live = snapshot(grade.slug)
      await page.route(endpoint, (route) => route.fulfill({ json: live }))
      await page.goto(`./family-beta-preview.html?grade=${grade.slug}`)
      await frame(page)
        .getByRole('button', { name: /Enter the Dojo/ })
        .click()
      await frame(page)
        .locator('body')
        .evaluate(() => document.fonts.ready.then(() => undefined))
      await page.evaluate(() => {
        ;(window as Window & { auditHold: boolean }).auditHold = true
      })
      const id = await currentFrame(page).getAttribute('data-family-slot')
      await frame(page).getByRole('button', { name: grade.write, exact: true }).click()
      const warmup = frame(page).getByRole('button', { name: 'Skip Warmup', exact: true })
      if (await warmup.isVisible()) await warmup.click()
      await expect
        .poll(() => page.evaluate(() => (window as Window & { auditLocks: string[] }).auditLocks.length))
        .toBeGreaterThan(0)
      await expect(frame(page).locator('[data-activity-launch-pending="true"]')).toBeVisible()
      await expect(frame(page).getByRole('button', { name: grade.write, exact: true })).toBeDisabled()
      await expect(frame(page).getByRole('button', { name: '← Back to all challenges', exact: true })).toBeDisabled()
      const phase = await frame(page).locator('html').getAttribute('data-report-phase')
      if (update) {
        live = futureSnapshot(grade.slug)
        await page.evaluate(() => window.dispatchEvent(new Event('online')))
        await expect
          .poll(() =>
            page.evaluate(
              (label) =>
                JSON.parse(localStorage.getItem(`family-beta-validated-automatic-curriculum-v1:${label}`) || '{}')
                  .contentSha256,
              grade.label,
            ),
          )
          .toBe(live.contentSha256)
      }
      await page.waitForTimeout(1500)
      const after = await currentFrame(page).getAttribute('data-family-slot')
      writeFileSync(
        test.info().outputPath('opening-lesson-state.json'),
        JSON.stringify(
          {
            grade: grade.label,
            update,
            beforeFrame: id,
            afterFrame: after,
            launchPhase: phase,
            source: await currentFrame(page).getAttribute('data-family-curriculum'),
          },
          null,
          2,
        ),
      )
      await page.screenshot({ path: test.info().outputPath('pending-launch.png'), fullPage: true })
      await page.evaluate(() => {
        const state = window as Window & { auditHold: boolean; auditReleases: (() => void)[] }
        state.auditHold = false
        for (const release of state.auditReleases) release()
      })
      expect
        .soft(after, 'A curriculum refresh must not replace a frame while its writing launch awaits the save lock')
        .toBe(id)
      if (after !== id) {
        // Verify that re-entering recovers the canceled launch; do not mask the
        // failed frame-preservation assertion above with an automatic retry.
        await frame(page)
          .getByRole('button', { name: /Enter the Dojo/ })
          .click()
        await frame(page).getByRole('button', { name: grade.write, exact: true }).click()
      }
      const teacher = frame(page).getByRole('region', { name: 'Stroke order teacher' })
      const postLaunchWarmup = frame(page).getByRole('button', { name: 'Skip Warmup', exact: true })
      await expect(teacher.or(postLaunchWarmup)).toBeVisible()
      if (await postLaunchWarmup.isVisible()) await postLaunchWarmup.click()
      await expect(teacher).toBeVisible()
      await expect(frame(page).locator('[data-activity-launch-pending="true"]')).toHaveCount(0)
      await frame(page)
        .getByRole('button', { name: /^(Exit game|Pause and return)$/ })
        .click()
      if (update) await expect(currentFrame(page)).toHaveAttribute('data-family-curriculum', live.contentSha256)
      else await expect(currentFrame(page)).toHaveAttribute('data-family-slot', id!)
      const dojo = frame(page).getByRole('button', { name: /Enter the Dojo/ })
      const writing = frame(page).getByRole('button', { name: grade.write, exact: true })
      await expect(dojo.or(writing)).toBeVisible()
      if (await dojo.isVisible()) await dojo.click()
      await expect(writing).toBeEnabled()
      await frame(page)
        .locator('body')
        .evaluate(() => document.fonts.ready.then(() => undefined))
      await writing.click()
      await expect(teacher.or(postLaunchWarmup)).toBeVisible()
      if (await postLaunchWarmup.isVisible()) await postLaunchWarmup.click()
      await expect(teacher).toBeVisible()
      writeFileSync(
        test.info().outputPath('recovery.json'),
        JSON.stringify({ opensAfterRelease: true, manualReentryRequired: after !== id }),
      )
    })
  }

for (const grade of grades) {
  test(`${grade.slug}: failed launch releases the menu; retry and later updates work`, async ({ page }) => {
    let live = snapshot(grade.slug)
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.route(endpoint, (route) => route.fulfill({ json: live }))
    await page.goto(`./family-beta-preview.html?grade=${grade.slug}`)
    await frame(page)
      .getByRole('button', { name: /Enter the Dojo/ })
      .click()
    await frame(page)
      .locator('body')
      .evaluate(() => document.fonts.ready.then(() => undefined))
    const id = await currentFrame(page).getAttribute('data-family-slot')
    await page.evaluate(() => {
      ;(window as Window & { auditReject: boolean }).auditReject = true
    })
    const writing = frame(page).getByRole('button', { name: grade.write, exact: true })
    await writing.click()
    await expect(
      frame(page).locator('[role="alert"], [role="status"]').filter({ hasText: 'Test writing save unavailable' }),
    ).toBeVisible()
    await expect(frame(page).locator('[data-activity-launch-pending="true"]')).toHaveCount(0)
    await expect(writing).toBeEnabled()
    if (grade.slug === 'grade5')
      await expect(frame(page).getByRole('alert').filter({ hasText: 'Test writing save unavailable' })).toBeInViewport()
    await page.screenshot({ path: test.info().outputPath('launch-error.png'), fullPage: true })
    await page.evaluate(() => {
      ;(window as Window & { auditReject: boolean }).auditReject = false
    })
    await writing.click()
    const retryTeacher = frame(page).getByRole('region', { name: 'Stroke order teacher' })
    const retryWarmup = frame(page).getByRole('button', { name: 'Skip Warmup', exact: true })
    await expect(retryTeacher.or(retryWarmup)).toBeVisible()
    if (await retryWarmup.isVisible()) await retryWarmup.click()
    await expect(retryTeacher).toBeVisible()
    await expect(currentFrame(page)).toHaveAttribute('data-family-slot', id!)
    await frame(page)
      .getByRole('button', { name: /^(Exit game|Pause and return)$/ })
      .click()
    // An old reportPhase=activity-launch must not permanently block an idle menu.
    live = futureSnapshot(grade.slug)
    await page.evaluate(() => {
      ;(window as Window & { auditReject: boolean }).auditReject = false
      window.dispatchEvent(new Event('online'))
    })
    await expect(currentFrame(page)).toHaveAttribute('data-family-curriculum', live.contentSha256)
    await expect(currentFrame(page)).not.toHaveAttribute('data-family-slot', id!)
    await frame(page)
      .getByRole('button', { name: /Enter the Dojo/ })
      .click()
    await frame(page)
      .locator('body')
      .evaluate(() => document.fonts.ready.then(() => undefined))
    await writing.click()
    const teacher = frame(page).getByRole('region', { name: 'Stroke order teacher' })
    const warmup = frame(page).getByRole('button', { name: 'Skip Warmup', exact: true })
    await expect(teacher.or(warmup)).toBeVisible()
    if (await warmup.isVisible()) await warmup.click()
    await expect(teacher).toBeVisible()
    expect(pageErrors).toEqual([])
  })

  test(`${grade.slug}: Report can pause an opening lesson without stranding its launch guard`, async ({ page }) => {
    let live = snapshot(grade.slug)
    await page.route(endpoint, (route) => route.fulfill({ json: live }))
    await page.goto(`./family-beta-preview.html?grade=${grade.slug}`)
    await frame(page)
      .getByRole('button', { name: /Enter the Dojo/ })
      .click()
    await frame(page)
      .locator('body')
      .evaluate(() => document.fonts.ready.then(() => undefined))
    await page.evaluate(() => {
      ;(window as Window & { auditHold: boolean }).auditHold = true
    })
    const id = await currentFrame(page).getAttribute('data-family-slot')
    await frame(page).getByRole('button', { name: grade.write, exact: true }).click()
    await expect
      .poll(() => page.evaluate(() => (window as Window & { auditLocks: string[] }).auditLocks.length))
      .toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Report a problem', exact: true })).toBeVisible()
    live = futureSnapshot(grade.slug)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await page.waitForTimeout(1300)
    await expect(currentFrame(page)).toHaveAttribute('data-family-slot', id!)
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await expect(currentFrame(page)).toHaveAttribute('data-family-slot', id!)
    await page.evaluate(() => {
      const state = window as Window & { auditHold: boolean; auditReleases: (() => void)[] }
      state.auditHold = false
      for (const release of state.auditReleases) release()
    })
    const teacher = frame(page).getByRole('region', { name: 'Stroke order teacher' })
    const warmup = frame(page).getByRole('button', { name: 'Skip Warmup', exact: true })
    await expect(teacher.or(warmup)).toBeVisible()
    if (await warmup.isVisible()) await warmup.click()
    await expect(teacher).toBeVisible()
    await expect(currentFrame(page)).toHaveAttribute('data-family-slot', id!)
    await frame(page)
      .getByRole('button', { name: /^(Exit game|Pause and return)$/ })
      .click()
    await expect(currentFrame(page)).toHaveAttribute('data-family-curriculum', live.contentSha256)
  })
}
