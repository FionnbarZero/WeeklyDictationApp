import { expect, test } from '@playwright/test'

test.skip(process.env.GRADE5_PRESENTATION_NAME !== '5th grade Dojo', 'Standalone branding and hosting only')

test('standalone root opens the named Grade 5 app with unchanged safety and storage disclosures', async ({
  page,
  request,
  baseURL,
}) => {
  const response = await request.get('/', { maxRedirects: 0 })
  expect(response.status()).toBe(302)
  const destination = new URL(response.headers().location, baseURL)
  expect(destination.origin).toBe(new URL(baseURL!).origin)
  expect(destination.pathname + destination.search).toBe('/family-beta-preview.html?grade=grade5')
  const manifest = await (await request.get('/dojo-launch-manifest.json')).json()
  expect(manifest).toMatchObject({
    name: '5th grade Dojo',
    edition: 'standalone-browser-only',
    prototype: '5th grade Dojo / Standalone 1',
    approvedPreviewRevision: '97c559d74db813ef839a0a3c793838c2c33a4f38',
    grades: ['Grade 5'],
  })
  await page.goto('/')
  await expect(page).toHaveTitle('5th grade Dojo')
  await expect(page.locator('.beta-preview-child-label')).toHaveText('Grade 5')
  await page.getByText('Parent controls', { exact: true }).click()
  await expect(page.getByRole('note')).toContainText('5th grade Dojo · Standalone 1')
  await expect(page.getByRole('note')).toContainText(
    'Progress saves in this browser; no account, cloud sync or offline installation.',
  )
  await expect(page.getByRole('option', { name: /Kindergarten|Grade 2/ })).toHaveCount(0)
  await page.getByText('Parent controls', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'Report a problem', exact: true })).toBeVisible()
  const frame = page.frameLocator('iframe:visible')
  await expect(frame.getByRole('button', { name: /Practice your Ninja Skills/ })).toBeVisible()
})
