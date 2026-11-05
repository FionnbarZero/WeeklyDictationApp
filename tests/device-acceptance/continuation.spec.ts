import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { strokeOrderGuide } from '../../src/familyBeta/strokeOrderSlay.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'
import { installFamilyFixtures, type SyntheticFamilyDocuments } from '../family-sync/fixtures.ts'

const grades = [
  { slug: 'kindergarten', child: 'synthetic-k', button: 'Writing characters', character: '土', week: '2026-10-12' },
  { slug: 'grade2', child: 'synthetic-g2', button: 'Learn to Write', character: '走', week: '2026-10-13' },
  { slug: 'grade5', child: 'synthetic-g5', button: 'Learn to Write', character: '盐', week: '2026-10-05' },
]
const frame = (page: Page) => page.frameLocator('iframe:visible')

async function setup(page: Page, documents: SyntheticFamilyDocuments = new Map()) {
  await installFamilyFixtures(page, documents, 'ninja-device-continuation@example.invalid')
  await page.clock.setFixedTime(new Date('2026-10-16T19:00:00Z'))
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('playing'))
      setTimeout(() => this.dispatchEvent(new Event('ended')), 10)
      return Promise.resolve()
    }
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(new DOMException('test denied', 'NotAllowedError')) },
    })
  })
  let nextWeek = false
  await page.route('**/curriculum/beta/*.json', (route) => {
    const slug = new URL(route.request().url()).pathname.split('/').pop()!
    return route.fulfill({
      contentType: 'application/json',
      body: readFileSync(
        `tests/fixtures/${nextWeek ? 'game-content-2026-10-26' : 'dojo-launch-2026-10-16'}/${slug}`,
        'utf8',
      ),
    })
  })
  return async () => {
    nextWeek = true
    // Advancing eleven days expires the fixture's one-hour, non-refreshable
    // synthetic token. Renew before changing the clock so WebKit's auth listener
    // cannot clear it between the clock update and renewal. Real auth is unchanged.
    const nextTime = new Date('2026-10-27T19:00:00Z')
    await page.evaluate((now) => {
      const auth = JSON.parse(localStorage.getItem('weekly-dictation-auth-v1')!)
      if (!auth.idToken.startsWith('synthetic.')) throw new Error('Expected the intercepted test account.')
      auth.expiresAt = now + 3600_000
      localStorage.setItem('weekly-dictation-auth-v1', JSON.stringify(auth))
    }, nextTime.getTime())
    await page.clock.setFixedTime(nextTime)
    await page.reload()
  }
}

async function enter(page: Page, label: string) {
  const dojo = frame(page).getByRole('button', { name: /Enter the Dojo/ })
  await expect(dojo.or(frame(page).getByRole('button', { name: label, exact: true }))).toBeVisible()
  if (await dojo.isVisible()) await dojo.click()
  await frame(page).getByRole('button', { name: label, exact: true }).click()
}

async function teacher(page: Page) {
  const teaching = frame(page).getByRole('region', { name: 'Stroke order teacher' })
  const warmup = frame(page).getByRole('button', { name: 'Skip Warmup', exact: true })
  await expect(teaching.or(warmup)).toBeVisible()
  if (await warmup.isVisible()) await warmup.click()
  await expect(teaching).toBeVisible()
  return teaching
}

async function advance(page: Page, character: string) {
  const teaching = await teacher(page)
  const pad = teaching.locator('svg[role="application"]')
  const strokes = strokeOrderGuide({ id: 'continuation-test', text: character }).strokes
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
  await frame(page).getByRole('button', { name: 'Next step', exact: true }).click()
  await expect(teaching).toHaveAttribute('data-step', '2')
}

for (const grade of grades) {
  test(`${grade.slug}: normal Writing entry continues the original position after the weekly source changes`, async ({
    page,
  }) => {
    const nextWeek = await setup(page)
    await page.goto(`/family-beta-preview.html?grade=${grade.slug}`)
    await enter(page, grade.button)
    await advance(page, grade.character)
    await nextWeek()
    await expect(page.getByText('Saved lessons', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Family preview navigation' })).toHaveCount(0)
    await enter(page, grade.button)
    const teaching = await teacher(page)
    await expect(page.locator('iframe:visible')).toHaveAttribute('data-family-week', grade.week)
    await expect(teaching).toHaveAttribute('data-step', '2')
    await expect(teaching.getByRole('heading', { name: grade.character, exact: true })).toBeVisible()
    await frame(page).getByRole('button', { name: 'Exit game', exact: true }).click()
    await page.getByRole('button', { name: 'Back to all challenges', exact: true }).click()
    await enter(page, grade.button)
    await expect(await teacher(page)).toHaveAttribute('data-step', '2')
  })

  test(`${grade.slug}: normal Reading entry retains the original targets and reviewed position after a new week`, async ({
    page,
  }) => {
    const nextWeek = await setup(page)
    await page.goto(`/family-beta-preview.html?grade=${grade.slug}`)
    const label = grade.slug === 'kindergarten' ? 'High-frequency words' : 'Read the Words'
    await enter(page, label)
    await frame(page).getByRole('button', { name: 'Record my reading', exact: true }).click()
    await frame(page).getByRole('button', { name: 'Continue without recording', exact: true }).click()
    await frame(page).getByRole('button', { name: 'Yes', exact: true }).click()
    const read = () =>
      page.evaluate(
        (child) =>
          Object.keys(localStorage)
            .filter((key) => key.startsWith('family-beta-acquisition-v1:') && !key.includes(':completed:'))
            .map((key) => JSON.parse(localStorage.getItem(key)!))
            .find((record) => record.envelope.childId === child && record.envelope.tier === 'tier-2'),
        grade.child,
      )
    await expect.poll(async () => (await read())?.assessments.length).toBe(1)
    const before = await read()
    const week = await page.locator('iframe:visible').getAttribute('data-family-week')
    await nextWeek()
    await enter(page, label)
    await expect(frame(page).getByRole('button', { name: 'Record my reading', exact: true })).toBeVisible()
    await expect(page.locator('iframe:visible')).toHaveAttribute('data-family-week', week!)
    const after = await read()
    expect(after.envelope).toEqual(before.envelope)
    expect(after.assessments).toEqual(before.assessments)
  })
}

test('switching children keeps their automatic lesson positions separate', async ({ page }) => {
  await setup(page)
  await page.goto('/family-beta-preview.html?grade=kindergarten')
  await enter(page, grades[0].button)
  await advance(page, grades[0].character)
  await frame(page).getByRole('button', { name: 'Exit game', exact: true }).click()
  const controls = page.locator('summary').filter({ hasText: 'Parent controls' })
  await controls.click()
  await page.getByRole('combobox', { name: 'Child profile', exact: true }).selectOption('synthetic-g2')
  await controls.click()
  await enter(page, grades[1].button)
  await expect(await teacher(page)).toHaveAttribute('data-step', '1')
  await expect((await teacher(page)).getByRole('heading', { name: grades[1].character, exact: true })).toBeVisible()
  await frame(page).getByRole('button', { name: 'Exit game', exact: true }).click()
  await controls.click()
  await page.getByRole('combobox', { name: 'Child profile', exact: true }).selectOption('synthetic-k')
  await controls.click()
  await enter(page, grades[0].button)
  await expect(await teacher(page)).toHaveAttribute('data-step', '2')
})

test('ordinary Writing bypasses an idle older menu and continues directly without a reload', async ({ page }) => {
  await setup(page)
  await page.goto('/family-beta-preview.html?grade=kindergarten')
  await expect(frame(page).getByRole('button', { name: /Enter the Dojo/ })).toBeVisible()
  const controls = page.locator('summary').filter({ hasText: 'Parent controls' })
  await controls.click()
  await page.getByRole('combobox', { name: 'Practice week', exact: true }).selectOption('2026-09-21')
  await controls.click()
  await enter(page, grades[0].button)
  await advance(page, '九')
  await frame(page).getByRole('button', { name: 'Exit game', exact: true }).click()
  await controls.click()
  await page.getByRole('combobox', { name: 'Practice week', exact: true }).selectOption('')
  await controls.click()
  await enter(page, grades[0].button)
  await expect(await teacher(page)).toHaveAttribute('data-step', '2')
  await expect(page.locator('iframe:visible')).toHaveAttribute('data-family-week', '2026-09-21')
})

test('parent settings and scores have a return path without the extra tab bar or saved-lesson menu', async ({
  page,
}) => {
  await setup(page)
  await page.goto('/family-beta-preview.html?grade=kindergarten')
  await expect(frame(page).getByRole('button', { name: /Enter the Dojo/ })).toBeVisible()
  const controls = page.locator('summary').filter({ hasText: 'Parent controls' })
  await controls.click()
  await expect(page.getByRole('navigation', { name: 'Family preview navigation' })).toHaveCount(0)
  await expect(page.getByText('Saved lessons', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Manage profiles', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Parent controls', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'View saved scores', exact: true }).click()
  await controls.click()
  await page.getByRole('button', { name: 'Back to activities', exact: true }).click()
  await expect(frame(page).getByRole('button', { name: /Enter the Dojo/ })).toBeVisible()
})

test('Grade 2 confirmed teaching starts cloud saving without waiting for the periodic check', async ({ page }) => {
  const documents: SyntheticFamilyDocuments = new Map()
  await setup(page, documents)
  await page.addInitScript(() => {
    // A throttled background timer must not be the trigger for a child's save.
    // Keep normal intervals in the activity; suppress only the parent's fallback.
    const interval = window.setInterval.bind(window)
    window.setInterval = (handler, delay, ...args) =>
      interval(window === window.top && delay === 15_000 ? () => {} : handler, delay, ...args)
  })
  const remoteRevision = () => {
    const revisions = [...documents.values()].flatMap((document) => {
      if (!document.name.includes('/children/synthetic-g2/betaPractice/')) return []
      const raw = (document.fields.payload as { stringValue?: string } | undefined)?.stringValue
      if (!raw) return []
      const progress = JSON.parse(raw).values?.writingAcquisitionProgress || []
      return progress.map((item: { revision: number }) => item.revision)
    })
    return revisions.length ? Math.max(...revisions) : -1
  }
  await page.goto('/family-beta-preview.html?grade=grade2')
  await enter(page, 'Learn to Write')
  await teacher(page)
  await expect.poll(remoteRevision).toBe(0)
  await page.waitForLoadState('networkidle')
  await advance(page, '走')
  await expect.poll(remoteRevision, { timeout: 5000 }).toBe(1)
})
