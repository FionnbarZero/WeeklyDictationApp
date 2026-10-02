import { expect, test } from './fixtures.ts'

test('writing responses stay hidden until one final all-target review', async ({ page }) => {
  await page.goto('/grade2-test-review-prototype.html')
  await page.getByRole('button', { name: 'Try Writing Test Review' }).click()

  await expect(page.getByText('比如', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Yes' })).toHaveCount(0)

  for (let index = 0; index < 5; index += 1) {
    await page.getByRole('button', { name: 'Skip Timer' }).click()
  }

  await expect(page.getByRole('heading', { name: /Review everything/ })).toBeVisible()
  for (const term of ['比如', '部分', '更', '方便', '美好']) {
    await expect(page.getByText(term, { exact: true })).toBeVisible()
  }

  const submit = page.getByRole('button', { name: 'Submit final review' })
  await expect(submit).toBeDisabled()
  const correctButtons = page.getByRole('button', { name: 'Yes' })
  await expect(correctButtons).toHaveCount(5)
  for (let index = 0; index < 5; index += 1) await correctButtons.nth(index).click()

  await expect(submit).toBeEnabled()
  await submit.click()
  await expect(page.getByText('Prototype run complete')).toBeVisible()
  await expect(page.getByRole('heading', { name: '5 of 5' })).toBeVisible()
})
