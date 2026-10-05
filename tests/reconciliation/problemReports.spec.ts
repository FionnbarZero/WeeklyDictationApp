import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

async function openReport(page: Page) {
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Report a problem' })).toBeVisible()
}

test('large report batches retain their data when attachment export fails', async ({ page }) => {
  await page.goto('/family-beta-preview.html?grade=kindergarten')
  await openReport(page)
  await page.getByLabel('What did you see or hear?').fill('声音'.repeat(700))
  await page.getByRole('button', { name: 'Save report on this device', exact: true }).click()
  await page.getByRole('dialog', { name: 'Report a problem', exact: true }).getByRole('button', { name: 'Finish session & email reports', exact: true }).click()
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true })
    URL.createObjectURL = () => { throw new Error('Download unavailable') }
  })
  await page.getByRole('button', { name: 'Email all saved reports together' }).click()
  const dialog = page.getByRole('dialog', { name: 'Finish session & email reports', exact: true })
  await expect(dialog).toContainText('Saved reports could not be exported')
  await expect(dialog.getByRole('status')).not.toContainText('download was requested')
  await expect(dialog).toContainText('1 saved report(s)')
})

test('session finish shares all saved reports together and keeps them after cancellation', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => {
      const content = await data.files![0].text()
      Object.assign(window, { sharedProblemReports: JSON.parse(content) })
      throw new DOMException('User cancelled', 'AbortError')
    } })
  })
  await page.goto('/family-beta-preview.html?grade=kindergarten')
  for (const description of ['Sound was silent.', 'The button moved.']) {
    await openReport(page)
    await page.getByLabel('What did you see or hear?').fill(description)
    await page.getByRole('button', { name: 'Save report on this device', exact: true }).click()
    await page.getByRole('button', { name: 'Close and return' }).click()
  }
  expect(await page.evaluate(() => 'sharedProblemReports' in window)).toBe(false)
  await page.reload()
  await page.getByRole('button', { name: 'Finish session & email reports', exact: true }).click()
  const finish = page.getByRole('dialog', { name: 'Finish session & email reports', exact: true })
  await expect(finish).toContainText('2 saved report(s)')
  await finish.getByRole('button', { name: 'Email all saved reports together' }).click()
  await expect(finish).toContainText('Sharing was cancelled or unavailable')
  const batch = await page.evaluate(() => (window as unknown as { sharedProblemReports: { reports: { description: string }[] } }).sharedProblemReports)
  expect(batch.reports.map(r => r.description).sort()).toEqual(['Sound was silent.', 'The button moved.'].sort())
  await page.reload()
  await page.getByRole('button', { name: 'Finish session & email reports', exact: true }).click()
  await expect(finish).toContainText('2 saved report(s)')
})

test('reporting remains usable inside the sound-check modal and returns to it', async ({ page }) => {
  await page.goto('/family-beta-preview.html?grade=kindergarten')
  await page.getByRole('button', { name: 'Check sound & microphone' }).click()
  await openReport(page)
  const report = page.getByRole('dialog', { name: 'Report a problem', exact: true })
  await expect(report).toContainText('Sound and microphone check')
  await page.getByLabel('What did you see or hear?').fill('The test word is silent.')
  await expect(report.getByRole('button', { name: 'Email this report' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Close and return' }).click()
  await expect(page.getByRole('dialog', { name: 'Check sound and microphone', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Report a problem', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Close sound check' }).click()
  await openReport(page)
  await expect(page.getByLabel('What did you see or hear?')).toHaveValue('The test word is silent.')
})

for (const [route, grade] of [
  ['kindergarten-learning-lab.html', 'Kindergarten'],
  ['index.html', 'Grade 2'],
  ['grade5-learning-hub.html', 'Grade 5'],
]) {
  test(`${grade}: standalone grade page keeps its own reporting window`, async ({ page }) => {
    await page.goto(`/${route}`)
    await openReport(page)
    const report = page.getByRole('dialog', { name: 'Report a problem', exact: true })
    await expect(report).toContainText(grade)
    await page.getByLabel('What did you see or hear?').fill('A standalone page issue.')
    await page.getByRole('button', { name: 'Save report on this device', exact: true }).click()
    const saved = await page.evaluate(() => Object.entries(localStorage)
      .filter(([key]) => key.startsWith('family-beta-problem-report-v1:')).map(([, value]) => JSON.parse(value)))
    expect(saved[0].context.grade).toBe(grade)
    expect(saved[0].context.route).toBe(`/${route}`)
  })
}

for (const [slug, grade] of [
  ['kindergarten', 'Kindergarten'],
  ['grade2', 'Grade 2'],
  ['grade5', 'Grade 5'],
]) {
  test(`${grade}: reporting stays available across screens and exports after reload`, async ({ page }) => {
    await page.goto(`/family-beta-preview.html?grade=${slug}`)
    await expect(page.frameLocator('iframe').getByRole('heading', { name: /Ready for your next/ })).toBeVisible()
    await openReport(page)
    await page.getByLabel('What did you see or hear?').fill(`A problem in ${grade}`)
    await page.getByLabel('What kind of problem?').selectOption('Sound or microphone')
    await page.getByRole('button', { name: 'Save report on this device', exact: true }).click()
    await expect(page.getByRole('dialog')).toContainText('Saved on this device—not sent')
    await page.getByRole('button', { name: 'Close and return' }).click()
    await expect(page.getByRole('button', { name: 'Report a problem', exact: true })).toBeFocused()
    for (const tab of ['Ninja Skills', 'Progress', 'Parent controls']) {
      await page.getByRole('button', { name: tab, exact: true }).click()
      await openReport(page)
      await expect(page.getByRole('dialog')).toContainText(grade)
      await page.keyboard.press('Escape')
    }
    await page.getByRole('button', { name: 'Ninja Skills', exact: true }).click()
    await page.getByRole('button', { name: 'Memory Lanterns', exact: true }).click()
    await openReport(page)
    await expect(page.getByRole('dialog')).toContainText('Memory Lanterns')
    await page.getByLabel('What did you see or hear?').fill('The game has a layout problem.')
    await page.getByRole('button', { name: 'Save report on this device', exact: true }).click()
    await page.reload()
    await openReport(page)
    await expect(page.getByRole('dialog')).toContainText('2 saved report(s)')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export saved reports' }).click()
    const exported = JSON.parse(await readFile((await (await download).path())!, 'utf8'))
    expect(exported.reports).toHaveLength(2)
    expect(exported.reports.every((report: { context: { grade: string } }) => report.context.grade === grade)).toBe(
      true,
    )
    expect(exported.reports[1].context.activity).toBe('Learning hub')
    expect(JSON.stringify(exported)).not.toMatch(/Learner [123]|childId|password|recordings|answers/)
  })
}

test('a nested activity captures its prompt and keeps a draft when closed', async ({ page }) => {
  await page.goto('/family-beta-preview.html?grade=kindergarten')
  const frame = page.frameLocator('iframe')
  await frame.getByRole('button', { name: /The Final Boss Test/ }).click()
  await frame.getByRole('button', { name: 'Writing Test', exact: true }).click()
  await expect(frame.locator('[data-report-target]')).toBeVisible()
  const target = await frame.locator('[data-report-target]').getAttribute('data-report-target')
  await openReport(page)
  await page.getByLabel('What did you see or hear?').fill('The audio sounds wrong on this word.')
  await page.getByRole('button', { name: 'Close and return' }).click()
  await frame.getByRole('button', { name: 'Skip Timer' }).click()
  await openReport(page)
  await expect(page.getByLabel('What did you see or hear?')).toHaveValue('The audio sounds wrong on this word.')
  await page.getByRole('button', { name: 'Save report on this device', exact: true }).click()
  const stored = await page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([key]) => key.startsWith('family-beta-problem-report-v1:'))
      .map(([, value]) => JSON.parse(value)),
  )
  expect(stored[0].context.target).toBe(target)
  expect(stored[0].context.phase).toBe('collect')
  await page.getByRole('button', { name: 'Close and return' }).click()
  await expect(frame.getByRole('button', { name: 'Skip Timer' })).toBeVisible()
})

test('storage and clipboard failures retain the report for manual copying', async ({ page }) => {
  await page.goto('/family-beta-preview.html?grade=grade2')
  await expect(page.frameLocator('iframe').getByRole('heading', { name: /Ready for your next/ })).toBeVisible()
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('family-beta-problem-report-v1:')) throw new Error('Quota exceeded')
      original.call(this, key, value)
    }
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('Denied')) } })
  })
  await openReport(page)
  await page.getByLabel('What did you see or hear?').fill('Keep this description.')
  await page.getByRole('button', { name: 'Save report on this device', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Could not save on this device')
  await page.getByRole('button', { name: 'Copy this report', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Clipboard access is unavailable')
  await page.getByText('Report text for manual copying', { exact: true }).click()
  await expect(page.getByLabel('Report text for manual copying')).toContainText('Keep this description.')
})

test('reporter is usable on a phone and when curriculum cannot load', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/curriculum/beta/*.json', (route) => route.fulfill({ status: 503, body: 'Unavailable' }))
  await page.goto('/family-beta-preview.html?grade=grade5')
  await expect(page.getByRole('button', { name: 'Retry lessons' })).toBeVisible()
  await openReport(page)
  await page.getByLabel('What did you see or hear?').fill('The lesson will not load.')
  await page.getByRole('button', { name: 'Save report on this device', exact: true }).click()
  expect(await page.getByRole('dialog').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: 'reconciliation-test-results/problem-report-phone.png' })
})
