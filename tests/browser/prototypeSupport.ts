import { expect, type Page } from '@playwright/test'

export function watchForUnexpectedBrowserErrors(page: Page) {
  const errors: string[] = []

  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`)
  })

  return () => expect(errors, 'unexpected browser errors').toEqual([])
}

export async function waitForStablePrototypeFrame(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
}
