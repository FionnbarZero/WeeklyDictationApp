import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'
import { installFamilyFixtures, readGrade2Workspace } from './fixtures.ts'

async function installIncompleteWeek(page: Page) {
  const snapshot = JSON.parse(await readFile('public/curriculum/beta/grade2.json', 'utf8'))
  snapshot.payload.slides.unshift({
    objectId: 'future-incomplete',
    text: 'Week 10/19-10/23\nMandarin\nTier 1:\nTier 2:',
  })
  snapshot.contentSha256 = createHash('sha256').update(JSON.stringify(snapshot.payload)).digest('hex')
  await page.route('**/curriculum/beta/grade2.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(snapshot) }),
  )
}

test('Grade 2: an incomplete future week does not block embedded Ninja Skills or reload', async ({ page }) => {
  await installFamilyFixtures(page)
  await installIncompleteWeek(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/?grade=grade2')
  for (let visit = 0; visit < 2; visit++) {
    const frame = page.frameLocator('iframe:visible')
    await frame.getByRole('button', { name: /Practice your Ninja Skills/ }).click()
    await expect(frame.getByRole('button', { name: 'Sky Writing', exact: true })).toHaveCount(0)
    await frame.getByRole('button', { name: 'Shuriken Match', exact: true }).click()
    await expect(frame.getByRole('heading', { name: 'Shuriken Match', exact: true })).toBeVisible()
    await expect(frame.locator('.lg-word-seal').first()).toBeVisible()
    await expect(frame.locator('.lg-word-seal small, .lg-word-seal svg')).toHaveCount(0)
    const state = await page.evaluate(readGrade2Workspace)
    expect(state?.datasets.length).toBeGreaterThan(0)
    expect(state?.datasets.some((dataset) => dataset.startDate === '2026-10-19')).toBe(false)
    await expect(frame.getByText(/conflicts with existing browser lessons/)).toHaveCount(0)
    if (!visit) await page.reload()
  }
  expect(errors).toEqual([])
})

test('Grade 2: an incomplete source week preserves a reviewed writing checkpoint on reload', async ({ page }) => {
  await installFamilyFixtures(page)
  await installIncompleteWeek(page)
  await page.goto('/?grade=grade2')
  await page.getByLabel('Practice week').selectOption('2026-09-21')
  let frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await frame.getByRole('button', { name: 'Learn to Write', exact: true }).click()
  await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
  await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
  await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
  await expect
    .poll(async () => (await page.evaluate(readGrade2Workspace))?.acquisitionProgressEnvelopes?.[0]?.revision)
    .toBe(1)
  const before = (await page.evaluate(readGrade2Workspace))!
  const envelope = before.acquisitionProgressEnvelopes![0]
  await page.reload()
  await page.getByText('Saved lessons', { exact: true }).click()
  await page.getByRole('button', { name: /Resume saved writing/ }).click()
  frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await frame.getByRole('button', { name: 'Learn to Write', exact: true }).click()
  await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Skip Timer', exact: true })).toBeVisible()
  const resumed = (await page.evaluate(readGrade2Workspace))!
  expect(resumed.acquisitionProgressEnvelopes?.[0]).toEqual(envelope)
  expect(resumed.scores).toEqual(before.scores)
  expect(resumed.results).toEqual(before.results)
  expect(resumed.datasets.some((dataset) => dataset.startDate === '2026-10-19')).toBe(false)
})
