import { expect, type Page, test } from '@playwright/test'
import { strokeOrderGuide } from '../../src/familyBeta/strokeOrderSlay.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'
import { grades, snapshot } from '../automatic-curriculum/fixtures.ts'

const active = (page: Page) => page.locator('iframe[data-family-active="true"]')
const child = (page: Page) => page.frameLocator('iframe[data-family-active="true"]')
const menuCSS = '**/assets/learningHub-*.css*'
const curriculum = '**/curriculum/beta/*.json'

function barrier() {
  let release!: () => void
  return {
    wait: new Promise<void>((resolve) => {
      release = resolve
    }),
    release: () => release(),
  }
}

test.beforeEach(async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-10-23T19:00:00Z'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route(curriculum, (route) =>
    route.fulfill({
      json: snapshot(
        route
          .request()
          .url()
          .match(/(kindergarten|grade2|grade5)\.json/)![1],
      ),
    }),
  )
})

async function chooseDojo(page: Page) {
  // Use the first visible coordinates, without a font/stability wait or click
  // retry that could conceal the old race between pointer down and pointer up.
  const card = child(page).getByRole('button', { name: /Enter the Dojo/ })
  await expect(card).toBeVisible()
  const box = (await card.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  if (test.info().project.use.hasTouch) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
  await expect(child(page).locator('.learning-hub-detail')).toBeVisible()
  await expect(child(page).locator('.learning-hub-section-grid')).toHaveCount(0)
}

test('negative control ab76131: CSS moving a pressed card loses the first selection', async ({ page, browserName }) => {
  test.skip(browserName !== 'webkit', 'The retained first-click race occurs in WebKit; Chromium waits for linked CSS.')
  test.skip(!process.env.STARTUP_BASELINE_URL, 'Set the retained ab76131 package URL for the negative control.')
  const hold = barrier()
  let requested = 0
  await page.route(menuCSS, async (route) => {
    requested++
    await hold.wait
    await route.continue()
  })
  try {
    await page.goto(`${process.env.STARTUP_BASELINE_URL}/family-beta-preview.html?grade=kindergarten`, {
      waitUntil: 'domcontentloaded',
    })
    await expect.poll(() => requested).toBe(1)
    const card = child(page).getByRole('button', { name: /Practice.*Ninja Skills/ })
    await expect(card).toBeVisible()
    const before = (await card.boundingBox())!
    expect(before.height).toBeLessThan(60)
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
    await page.mouse.down()
    hold.release()
    await expect.poll(async () => (await card.boundingBox())!.height).toBeGreaterThan(200)
    await page.mouse.up()
    await expect(child(page).locator('.learning-hub-section-grid')).toBeVisible()
    await expect(child(page).locator('.learning-hub-detail')).toHaveCount(0)
    await test.info().attach('baseline-layout-shift', {
      body: JSON.stringify({ before, after: await card.boundingBox() }),
      contentType: 'application/json',
    })
  } finally {
    hold.release()
  }
})

for (const grade of grades) {
  test(`${grade.slug}: cold start blocks unfinished cards; one click works after CSS and on repeat`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const hold = barrier()
    let requested = 0
    await page.route(menuCSS, async (route) => {
      requested++
      await hold.wait
      await route.continue()
    })
    try {
      await page.goto(`./family-beta-preview.html?grade=${grade.slug}`, { waitUntil: 'domcontentloaded' })
      await expect.poll(() => requested).toBeGreaterThan(0)
      await expect(page.getByRole('status').filter({ hasText: 'Loading activities…' })).toBeVisible()
      await expect(active(page)).toHaveAttribute('data-family-presentation', 'loading')
      await expect(active(page)).toHaveAttribute('data-family-paused', 'true')
      await expect(active(page)).toHaveAttribute('inert', '')
      await expect(active(page)).toBeHidden()
      // A pointer action while the raw document is laying out cannot hit it.
      const box = await active(page).evaluate((frame) => {
        const r = frame.getBoundingClientRect()
        return { x: r.x + 40, y: r.y + 40 }
      })
      await page.mouse.click(box.x, box.y)
      hold.release()
      await expect(active(page)).toHaveAttribute('data-family-presentation', 'ready')
      await expect(active(page)).toBeVisible()
      await expect(active(page)).not.toHaveAttribute('inert', '')
      const card = child(page).getByRole('button', { name: /Enter the Dojo/ })
      await expect(card).toBeVisible()
      expect((await card.boundingBox())!.height).toBeGreaterThan(200)
      await chooseDojo(page)
      await child(page)
        .getByRole('button', { name: /Back to all challenges/ })
        .click()
      await chooseDojo(page)
      await page.reload()
      await chooseDojo(page)
      expect(errors).toEqual([])
    } finally {
      hold.release()
    }
  })
}

test('Report opened during startup remains paused when the frame becomes ready', async ({ page }) => {
  const hold = barrier()
  let requested = 0
  await page.route(menuCSS, async (route) => {
    requested++
    await hold.wait
    await route.continue()
  })
  try {
    await page.goto('./family-beta-preview.html?grade=kindergarten', { waitUntil: 'domcontentloaded' })
    await expect.poll(() => requested).toBe(1)
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Report a problem', exact: true })).toBeVisible()
    hold.release()
    await expect(active(page)).toHaveAttribute('data-family-presentation', 'ready')
    await expect(active(page)).toHaveAttribute('data-family-owner-paused', 'true')
    await expect(child(page).locator('html')).toHaveAttribute('data-activity-paused', 'true')
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await expect(child(page).locator('html')).toHaveAttribute('data-activity-paused', 'false')
    await chooseDojo(page)
  } finally {
    hold.release()
  }
})

test('late lazy menu styles finish before the asynchronous Grade 2 menu becomes interactive', async ({ page }) => {
  const hold = barrier()
  let requested = 0
  await page.route('**/assets/PreviewLearningHub-*.css', async (route) => {
    requested++
    await hold.wait
    await route.continue()
  })
  try {
    await page.goto('./family-beta-preview.html?grade=grade2', { waitUntil: 'domcontentloaded' })
    await expect.poll(() => requested).toBe(1)
    await expect(child(page).getByRole('button', { name: /Enter the Dojo/ })).toHaveCount(0)
    hold.release()
    await chooseDojo(page)
  } finally {
    hold.release()
  }
})

test('post-load pending styles and a second lazy stylesheet stay loading until both finish', async ({ page }) => {
  const first = barrier()
  const second = barrier()
  let firstRequested = 0
  let secondRequested = 0
  await page.route('**/startup-late-first.css', async (route) => {
    firstRequested++
    await first.wait
    await route.fulfill({ contentType: 'text/css', body: '.startup-first { color: inherit; }' })
  })
  await page.route('**/startup-late-second.css', async (route) => {
    secondRequested++
    await second.wait
    await route.fulfill({ contentType: 'text/css', body: '.startup-second { color: inherit; }' })
  })
  await page.addInitScript(() => {
    if (window.parent === window) return
    window.addEventListener(
      'load',
      () => {
        const first = document.createElement('link')
        first.rel = 'stylesheet'
        first.href = '/startup-late-first.css'
        first.addEventListener(
          'load',
          () => {
            const second = document.createElement('link')
            second.rel = 'stylesheet'
            second.href = '/startup-late-second.css'
            document.head.append(second)
          },
          { once: true },
        )
        document.head.append(first)
      },
      { once: true },
    )
  })
  const paint = () =>
    child(page)
      .locator('html')
      .evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
      )
  try {
    await page.goto('./family-beta-preview.html?grade=grade2', { waitUntil: 'domcontentloaded' })
    await expect.poll(() => firstRequested).toBe(1)
    await expect
      .poll(() =>
        child(page)
          .locator('html')
          .evaluate(() => document.readyState),
      )
      .toBe('complete')
    await paint()
    await expect(active(page)).toHaveAttribute('data-family-presentation', 'loading')
    await expect(page.getByRole('button', { name: 'Retry activity screen', exact: true })).toHaveCount(0)
    first.release()
    await expect.poll(() => secondRequested).toBe(1)
    await paint()
    await expect(active(page)).toHaveAttribute('data-family-presentation', 'loading')
    await expect(active(page)).toBeHidden()
    second.release()
    await chooseDojo(page)
    await expect(active(page)).toHaveAttribute('data-family-presentation', 'ready')
  } finally {
    first.release()
    second.release()
  }
})

test('failed CSS offers repeatable recovery without clearing saved records', async ({ page }) => {
  let fail = true
  await page.route(menuCSS, (route) => (fail ? route.abort('failed') : route.continue()))
  await page.goto('./family-beta-preview.html?grade=grade2')
  await expect(page.getByRole('button', { name: 'Retry activity screen', exact: true })).toBeVisible()
  await expect(active(page)).toHaveAttribute('data-family-presentation', 'error')
  await expect(active(page)).toBeHidden()
  // Fail a second time: Retry remains possible and does not replace the slot.
  const slot = await active(page).getAttribute('data-family-slot')
  const saved = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))
  await page.getByRole('button', { name: 'Retry activity screen', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retry activity screen', exact: true })).toBeVisible()
  await expect(active(page)).toHaveAttribute('data-family-slot', slot!)
  expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))).toEqual(saved)
  fail = false
  await page.getByRole('button', { name: 'Retry activity screen', exact: true }).click()
  await chooseDojo(page)
  await expect(active(page)).toHaveAttribute('data-family-slot', slot!)
})

async function writingProgress(page: Page) {
  return page.evaluate(() => {
    const progress: { lesson: { targets: { id: string; text: string }[] } }[] = []
    for (const [key, raw] of Object.entries(localStorage)) {
      if (!key.includes('automatic-curriculum-preview-')) continue
      try {
        const workspace = JSON.parse(raw)
        for (const value of Object.values(workspace.records || {})) {
          try {
            progress.push(...(JSON.parse(value as string).values?.writingAcquisitionProgress || []))
          } catch {
            /* other record */
          }
        }
      } catch {
        /* other record */
      }
    }
    return progress
  })
}

async function openWriting(page: Page) {
  const dojo = child(page).getByRole('button', { name: /Enter the Dojo/ })
  const writing = child(page).getByRole('button', { name: 'Learn to Write', exact: true })
  await expect(dojo.or(writing)).toBeVisible()
  if (await dojo.isVisible()) await dojo.click()
  await writing.click()
  const teacher = child(page).getByRole('region', { name: 'Stroke order teacher' })
  const skip = child(page).getByRole('button', { name: 'Skip Warmup', exact: true })
  await expect(teacher.or(skip)).toBeVisible()
  if (await skip.isVisible()) await skip.click()
  await expect(teacher).toBeVisible()
  return teacher
}

test('kept-alive grades, persisted restore and failed child reload retain reviewed writing', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('playing'))
      setTimeout(() => this.dispatchEvent(new Event('ended')), 10)
      return Promise.resolve()
    }
  })
  await page.goto('./family-beta-preview.html?grade=grade2')
  await chooseDojo(page)
  const teacher = await openWriting(page)
  // The wrapper must preserve Grade 2's direct-child writing layout rules.
  await expect(page.locator('.beta-preview-strip')).toBeHidden()
  const id = await teacher.getAttribute('data-report-target')
  const target = (await writingProgress(page)).flatMap((p) => p.lesson.targets).find((t) => t.id === id)!
  expect(target).toBeTruthy()
  const strokes = strokeOrderGuide({ id: target.id, text: [...target.text][0] }).strokes
  const layout = getStrokeLayout(strokes)
  const pad = teacher.locator('svg[role="application"]')
  for (const [i, stroke] of strokes.entries()) {
    const b = (await pad.boundingBox())!
    const xy = (p: readonly [number, number]) =>
      [
        b.x + ((p[0] * layout.scale + layout.offsetX) * b.width) / 100,
        b.y + ((p[1] * layout.scale + layout.offsetY) * b.height) / 100,
      ] as const
    await page.mouse.move(...xy(stroke[0]))
    await page.mouse.down()
    for (const p of stroke.slice(1)) await page.mouse.move(...xy(p))
    await page.mouse.up()
    await expect(pad).toHaveAttribute('data-next-stroke', String(i + 1))
  }
  await child(page).getByRole('button', { name: 'Next step', exact: true }).click()
  await expect(teacher).toHaveAttribute('data-step', '2')
  const saved = await writingProgress(page)
  expect(saved.length).toBeGreaterThan(0)
  const original = await active(page).elementHandle()
  const slot = await active(page).getAttribute('data-family-slot')
  // Browser routing disables real bfcache in automation. Exercise its exact
  // persisted lifecycle events, which do not generate an iframe load event.
  await child(page)
    .locator('html')
    .evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    })
  await expect(active(page)).toHaveAttribute('data-family-presentation', 'ready')
  await expect(teacher).toHaveAttribute('data-step', '2')
  await child(page)
    .getByRole('button', { name: /^(Exit game|Pause and return)$/ })
    .click()
  await page.getByText('Parent controls', { exact: true }).click()
  await page.getByLabel('Child profile', { exact: true }).selectOption('automatic-curriculum-preview-0')
  await expect(active(page)).toHaveAttribute('title', 'Kindergarten activities')
  await page.getByText('Parent controls', { exact: true }).click()
  await chooseDojo(page)
  await page.getByText('Parent controls', { exact: true }).click()
  await page.getByLabel('Child profile', { exact: true }).selectOption('automatic-curriculum-preview-1')
  await expect(active(page)).toHaveAttribute('data-family-slot', slot!)
  expect(await active(page).evaluate((current, old) => current === old, original)).toBe(true)
  await page.getByText('Parent controls', { exact: true }).click()
  await expect(await openWriting(page)).toHaveAttribute('data-step', '2')
  expect(await writingProgress(page)).toEqual(saved)
  let fail = true
  let failedRequests = 0
  await page.route(menuCSS, (route) => {
    if (!fail) return route.continue()
    failedRequests++
    return route.abort('failed')
  })
  // A same-document reload can reuse the renderer's parsed stylesheet without
  // making a request. Give only this fault-injection reload a fresh asset URL.
  await page.route('**/index.html?*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: (await response.text()).replace(/(learningHub-[^"/]+\.css)/, '$1?startup-failure=1'),
    })
  })
  // Reload only the existing activity document. Its slot and saved owner stay.
  await active(page).evaluate((frame: HTMLIFrameElement) => frame.contentWindow!.location.reload())
  await expect.poll(() => failedRequests).toBeGreaterThan(0)
  await expect(page.getByRole('button', { name: 'Retry activity screen', exact: true })).toBeVisible()
  expect(await writingProgress(page)).toEqual(saved)
  fail = false
  await page.getByRole('button', { name: 'Retry activity screen', exact: true }).click()
  await expect(active(page)).toHaveAttribute('data-family-presentation', 'ready')
  await expect(await openWriting(page)).toHaveAttribute('data-step', '2')
  await expect(active(page)).toHaveAttribute('data-family-slot', slot!)
  expect(await writingProgress(page)).toEqual(saved)
})
