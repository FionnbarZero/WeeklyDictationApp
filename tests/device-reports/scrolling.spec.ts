import { expect, type FrameLocator, type Page, test } from '@playwright/test'
import { grades, snapshot } from '../automatic-curriculum/fixtures.ts'

test.beforeEach(async ({ page, context }) => {
  await page.clock.setSystemTime(new Date('2026-10-23T19:00:00Z'))
  await context.route('**/curriculum/beta/*.json', (route) =>
    route.fulfill({
      json: snapshot(
        route
          .request()
          .url()
          .match(/(kindergarten|grade2|grade5)\.json/)![1],
      ),
    }),
  )
  // This suite isolates input/scrolling; native sound has its own existing suite.
  await context.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('playing'))
      setTimeout(() => this.dispatchEvent(new Event('ended')), 20)
      return Promise.resolve()
    }
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices: () => [],
        speak(u: SpeechSynthesisUtterance) {
          u.onstart?.({} as SpeechSynthesisEvent)
          setTimeout(() => u.onend?.({} as SpeechSynthesisEvent), 20)
        },
      },
    })
  })
})

const scrollPosition = async (page: Page, frame: FrameLocator) => ({
  outer: await page.evaluate(() => window.scrollY),
  inner: await frame.locator('body').evaluate(() => window.scrollY),
  elements: await frame
    .locator('body')
    .evaluate(() =>
      [...document.querySelectorAll('*')]
        .filter((e) => e.scrollTop)
        .map((e) => ({ name: `${e.tagName}.${e.className}`, top: e.scrollTop })),
    ),
})

for (const grade of grades) {
  test(`${grade.label}: trackpad movement cannot move the paper during a stroke; outside still scrolls`, async ({
    page,
  }) => {
    await page.goto(`./family-beta-preview.html?grade=${grade.slug}`)
    const f = page.frameLocator('iframe:visible')
    await f.getByRole('button', { name: /Enter the Dojo/ }).click()
    await f.getByRole('button', { name: grade.write, exact: true }).click()
    const teacher = f.getByRole('region', { name: 'Stroke order teacher' })
    const warmup = f.getByRole('button', { name: 'Skip Warmup', exact: true })
    await expect(teacher.or(warmup)).toBeVisible()
    if (await warmup.isVisible()) await warmup.click()
    const pad = teacher.locator('svg[role="application"]')
    await expect(pad).toBeVisible()
    await pad.scrollIntoViewIfNeeded()
    await pad.click({ trial: true })
    const box = (await pad.boundingBox())!
    const before = await scrollPosition(page, f)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 12)
    await page.mouse.wheel(0, -200)
    // Native wheel scrolling is asynchronous. Sample several frames, not just
    // the instant before the compositor gets a chance to move the document.
    const positions = []
    for (let i = 0; i < 12; i++) {
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
      positions.push(await scrollPosition(page, f))
    }
    const after = (await pad.boundingBox())!
    await page.mouse.up()
    await test
      .info()
      .attach('wheel-positions.json', { body: JSON.stringify({ before, positions }), contentType: 'application/json' })
    expect(positions.every((p) => JSON.stringify(p) === JSON.stringify(before))).toBe(true)
    expect(after.y).toBeCloseTo(box.y, 0)
    // The heading belongs to the surrounding document, not the drawing surface.
    // Actual wheel input must expose either end; scrollIntoView is not evidence
    // that a child can reach the clipped controls by scrolling.
    const bounds = (await teacher.locator('.lg-stroke-roundbar').boundingBox())!
    await page.mouse.move(bounds.x + 40, bounds.y + bounds.height / 2)
    await test.info().attach('scroll-containers.json', {
      body: JSON.stringify(
        await pad.evaluate((el) => {
          const out = []
          for (let node: Element | null = el; node; node = node.parentElement) {
            const s = getComputedStyle(node)
            out.push({
              name: `${node.tagName}.${node.className}`,
              overflow: s.overflow,
              touch: s.touchAction,
              height: node.clientHeight,
              scrollHeight: node.scrollHeight,
              top: node.scrollTop,
            })
          }
          return out
        }),
      ),
      contentType: 'application/json',
    })
    await page.mouse.wheel(0, -450)
    await expect.poll(async () => (await scrollPosition(page, f)).inner).toBeLessThan(before.inner)
    await page.mouse.wheel(0, 450)
    await expect.poll(async () => (await scrollPosition(page, f)).inner).toBeGreaterThan(before.inner)
    await expect(pad).toBeInViewport({ ratio: 0.99 })
    await expect(f.getByRole('button', { name: 'Next step', exact: true })).toBeInViewport({ ratio: 0.99 })
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await expect(f.locator('html')).toHaveAttribute('data-activity-paused', 'true')
    await page.getByLabel('What did you see or hear?').fill('Synthetic scrolling check — no child information.')
    await expect(page.getByLabel('What did you see or hear?')).toBeFocused()
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await expect(teacher).toBeVisible()
    await expect(pad).toHaveAttribute('data-next-stroke', '0')
    await f.getByRole('button', { name: 'Exit game', exact: true }).click()
    await expect(f.getByRole('button', { name: grade.write, exact: true })).toBeVisible()
  })
}
