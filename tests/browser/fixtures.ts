import { expect, test as base } from '@playwright/test'

export const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', (error) => {
      errors.push(`pageerror: ${error.message}`)
    })
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console.error: ${message.text()}`)
    })

    await use(page)

    expect(errors, 'unexpected browser errors').toEqual([])
  },
})

export { expect }
