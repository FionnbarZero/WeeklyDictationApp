import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { prepareAcquisitionProgress } from '../../src/application/acquisitionPersistence.ts'
import { retainGrade2Editions } from '../../src/curriculum/grade2Revisions.ts'
import { APP_STATE_KEY, createInitialState } from '../../src/domain.ts'
import { hydrateLocalStateFromReadOnlySource } from '../../src/localHydration.ts'
import { captureScreenContext } from '../../src/familyBeta/problemReports.ts'

test.beforeEach(async ({ page, baseURL }) => {
  await page.clock.setFixedTime(new Date('2026-10-23T19:00:00Z'))
  await page.route('**/*', (r) =>
    new URL(r.request().url()).origin === new URL(baseURL!).origin ? r.continue() : r.abort(),
  )
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
  })
})

test('label-only correction keeps all original records and ordinary Writing opens the corrected lesson', async ({
  page,
}) => {
  const source = JSON.parse(
    readFileSync(new URL('../fixtures/dojo-launch-2026-10-16/grade2.json', import.meta.url), 'utf8'),
  )
  const incoming = hydrateLocalStateFromReadOnlySource(createInitialState(), source.payload).state.datasets
  const corrected = incoming.find((d) => d.startDate === '2026-10-13')!
  const words = ['strokeorder', ...corrected.words.map((w) => w.text)].map((text, i) => ({
    ...corrected.words[0],
    id: `${corrected.id}-${i + 1}`,
    text,
  }))
  const old = { ...corrected, words, vocabulary: { ...corrected.vocabulary!, tier1: words } }
  const prepared = prepareAcquisitionProgress(
    createInitialState([old, ...incoming.filter((d) => d.id !== old.id)]),
    'preview-1',
    old,
    '2026-10-14T10:00:00.000Z',
    () => 0,
    true,
  )
  expect(prepared.status).toBe('ready')
  const state = retainGrade2Editions(prepared.state, incoming)
  await page.addInitScript(
    ({ state, key }) => {
      if (window !== window.top || localStorage.getItem('w1-seeded')) return
      localStorage.setItem(key, state)
      localStorage.setItem('w1-seeded', 'true')
      localStorage.setItem('w1-unrelated-record', 'preserve')
    },
    { state: JSON.stringify(state), key: `family-beta-activity:preview-1:${APP_STATE_KEY}` },
  )
  await page.goto('/family-beta-preview.html?grade=grade2')
  const frame = page.frameLocator('iframe:visible')
  await expect(frame.getByRole('button', { name: 'Use corrected lesson · keep old work' })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('corrected-lesson-notice.png'), fullPage: true })
  const oldEnvelope = state.acquisitionProgressEnvelopes![0]
  await frame.getByRole('button', { name: 'Use corrected lesson · keep old work' }).click()
  await expect(frame.getByRole('button', { name: /Enter the Dojo/ })).toBeVisible()
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await frame.getByRole('button', { name: 'Learn to Write', exact: true }).click()
  const skip = frame.getByRole('button', { name: 'Skip Warmup', exact: true })
  const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
  await expect(skip.or(teacher)).toBeVisible()
  if (await skip.isVisible()) await skip.click()
  await expect(teacher).toBeVisible()
  await expect(teacher.getByRole('heading', { name: '走', exact: true })).toBeVisible()
  const records = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
  expect(records['w1-unrelated-record']).toBe('preserve')
  expect(Object.keys(records).filter((k) => k.includes('lesson-retirement-v1:'))).toHaveLength(1)
  const savedStates = Object.values(records).flatMap((raw) => {
    try {
      const v = JSON.parse(raw)
      return [
        v,
        ...Object.values(v.records || {}).map((s) => {
          try {
            return JSON.parse(s as string).values || {}
          } catch {
            return {}
          }
        }),
      ]
    } catch {
      return []
    }
  })
  expect(savedStates.flatMap((s) => s.acquisitionProgressEnvelopes || []).find((e) => e.id === oldEnvelope.id)).toEqual(
    oldEnvelope,
  )
  await page.reload()
  await expect(frame.getByRole('button', { name: 'Use corrected lesson · keep old work' })).toHaveCount(0)
})

for (const slug of ['kindergarten', 'grade2', 'grade5'])
  test(`${slug}: actual game's report inherits module, phase and section without child responses`, async ({ page }) => {
    await page.goto(`/family-beta-preview.html?grade=${slug}`)
    const frame = page.frameLocator('iframe:visible')
    await frame.getByRole('button', { name: /Practice.*Ninja Skills/i }).click()
    await frame.getByRole('button', { name: 'Memory Lanterns', exact: true }).click()
    await expect(frame.locator('.lg-shell')).toBeVisible()
    const context = await page.evaluate(`(${captureScreenContext.toString()})(document)`)
    expect(context.activity).toBe('Memory Lanterns')
    expect(context.phase).toBe('game')
    expect(context.module).toBe('memory-flip')
    expect(context.section).toBeTruthy()
    expect(context.revision).toMatch(/^[a-f0-9]{40}$/)
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Close and return', exact: true })).toBeVisible()
    await page.getByLabel('What did you see or hear?').fill('Synthetic W1 game attribution check')
    await page.getByRole('button', { name: 'Save report on this device', exact: true }).click()
    const report = await page.evaluate(
      () =>
        Object.entries(localStorage)
          .filter(([k]) => k.startsWith('family-beta-problem-report-v1:'))
          .map(([, v]) => JSON.parse(v))[0],
    )
    expect(report.context).toMatchObject({
      activity: 'Memory Lanterns',
      phase: 'game',
      module: 'memory-flip',
      section: context.section,
      revision: context.revision,
    })
    expect(JSON.stringify(report.context)).not.toContain('Synthetic W1')
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await expect(frame.locator('.lg-shell')).toBeVisible()
    await frame.getByRole('button', { name: 'Exit learning module', exact: true }).click()
    await expect(frame.getByRole('button', { name: 'Memory Lanterns', exact: true })).toBeVisible()
    const menu = await page.evaluate(`(${captureScreenContext.toString()})(document)`)
    expect(menu.phase).toBe('activity-menu')
    expect(menu.module).toBeUndefined()
  })

test('diagnostics prefer visible launch errors and never scrape inputs or page text', async ({ page }) => {
  await page.goto('/family-beta-preview.html?grade=kindergarten')
  await expect(page.locator('iframe:visible')).toBeVisible()
  await page.evaluate(() => {
    const alert = document.createElement('div')
    alert.setAttribute('role', 'alert')
    alert.setAttribute('data-report-activity', 'Activity could not open or close')
    alert.setAttribute('data-report-phase', 'activity-error')
    alert.textContent = 'PRIVATE RESPONSE NOT FOR REPORTS'
    const input = document.createElement('input')
    input.value = 'PRIVATE TYPED ANSWER'
    alert.append(input)
    document.body.append(alert)
  })
  const context = await page.evaluate(`(${captureScreenContext.toString()})(document)`)
  expect(context.activity).toBe('Activity could not open or close')
  expect(context.phase).toBe('activity-error')
  expect(JSON.stringify(context)).not.toContain('PRIVATE')
})

test('built-in repair example is playable, resumes on reload and leaves the normal test learner untouched', async ({
  page,
}) => {
  await page.goto('/family-beta-preview.html?grade=grade2')
  const frame = page.frameLocator('iframe:visible')
  await expect(frame.getByRole('button', { name: /Enter the Dojo/ })).toBeVisible()
  const before = await page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith('family-beta-activity:preview-1:'))),
  )
  await page.goto('/family-beta-preview.html?grade=grade2&example=curriculum-repair')
  await expect(
    frame.getByText('This is a synthetic saved-lesson example. Your normal test learner is unchanged.'),
  ).toBeVisible()
  expect(
    (await frame.getByRole('button', { name: 'Use corrected lesson · keep old work' }).boundingBox())!.height,
  ).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: test.info().outputPath('built-in-repair-example.png'), fullPage: true })
  await frame.getByRole('button', { name: 'Use corrected lesson · keep old work' }).click()
  await expect(frame.getByRole('button', { name: /Enter the Dojo/ })).toBeVisible()
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await frame.getByRole('button', { name: 'Learn to Write', exact: true }).click()
  const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
  const skip = frame.getByRole('button', { name: 'Skip Warmup', exact: true })
  await expect(skip.or(teacher)).toBeVisible()
  if (await skip.isVisible()) await skip.click()
  await expect(teacher.getByRole('heading', { name: '走', exact: true })).toBeVisible()
  await page.reload()
  await expect(frame.getByRole('button', { name: /Enter the Dojo/ })).toBeVisible()
  await expect(frame.getByRole('button', { name: 'Use corrected lesson · keep old work' })).toHaveCount(0)
  const after = await page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith('family-beta-activity:preview-1:'))),
  )
  expect(after).toEqual(before)
})
