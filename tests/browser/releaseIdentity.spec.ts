import { expect, test } from './fixtures.ts'

const entries = [
  { path: '/', grade: 'Grade 2', status: 'Family beta', persistence: 'Tier 1 writing durable here' },
  {
    path: '/kindergarten-learning-lab.html',
    grade: 'Kindergarten',
    status: 'Experimental',
    persistence: 'Session only',
  },
  { path: '/grade5-learning-hub.html', grade: 'Grade 5', status: 'Experimental', persistence: 'Session only' },
] as const

for (const entry of entries) {
  test(`${entry.grade} displays privacy-safe release identity`, async ({ page }) => {
    await page.goto(entry.path)
    const identity = page.locator('.release-identity')
    await expect(identity).toContainText(entry.grade)
    await expect(identity).toContainText(entry.status)
    await expect(identity).toContainText('v0.2.0-stage2')
    await expect(identity).toContainText(/r[a-f0-9]{7}/)
    await expect(identity).toContainText(entry.persistence)

    await identity.locator('summary').click()
    await expect(identity).toContainText('Report a problem')
    await expect(identity.locator('code')).toContainText(`grade=${entry.grade}`)
    await expect(identity.locator('code')).not.toContainText(/name=|response=|recording=|progress=/i)
  })
}
