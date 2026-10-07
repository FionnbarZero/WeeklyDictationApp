import { expect, test } from '@playwright/test'
import { grades, installFamilyFixtures } from './fixtures.ts'

test.beforeEach(async ({ page }) => installFamilyFixtures(page))

test('a completed Boss recording stays available across reporting and parent navigation', async ({ page }) => {
  await page.goto('/?grade=grade5')
  const frame = page.frameLocator('iframe:visible')
  await frame.locator('body').evaluate(() => {
    const stream = { getTracks: () => [{ stop() {} }] }
    class Recorder {
      static isTypeSupported() {
        return true
      }
      state = 'inactive'
      mimeType = 'audio/webm'
      ondataavailable?: (event: { data: Blob }) => void
      onstop?: () => void
      start() {
        this.state = 'recording'
      }
      stop() {
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob(['synthetic-clip']) })
        this.onstop?.()
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: Recorder })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => stream },
    })
    const original = URL.createObjectURL
    URL.createObjectURL = (blob) => {
      const url = original(blob)
      Object.assign(window, { completedClip: url })
      return url
    }
  })
  await frame.getByRole('button', { name: /The Final Boss Test/ }).click()
  await frame.getByRole('button', { name: 'Reading Test', exact: true }).click()
  await frame.getByRole('button', { name: 'Record my reading', exact: true }).click()
  await frame.getByRole('button', { name: 'Stop recording', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Save response and continue', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await page.getByRole('button', { name: 'Activities', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Save response and continue', exact: true })).toBeVisible()
  expect(await frame.locator('body').evaluate(async () => (await fetch((window as any).completedClip)).text())).toBe(
    'synthetic-clip',
  )
  expect(await page.evaluate(() => Object.values(localStorage).join('\n'))).not.toMatch(
    /synthetic-clip|blob:|data:audio/,
  )
})

for (const [slug, grade] of grades) {
  for (const phase of ['acquisition', 'boss'] as const) {
    for (const pending of [false, true]) {
      test(`${grade} ${phase}: report interrupts ${pending ? 'pending permission' : 'recording'} without saving a provisional clip`, async ({
        page,
      }) => {
        await page.goto(`/?grade=${slug}`)
        if (slug === 'grade2') await page.getByLabel('Practice week').selectOption('2026-09-21')
        const frame = page.frameLocator('iframe:visible')
        await frame.locator('body').evaluate((_, pending) => {
          const probe = { started: 0, stopped: 0, urls: 0, permit: () => {} }
          Object.assign(window, { microphoneProbe: probe })
          class Recorder {
            static isTypeSupported() {
              return true
            }
            state = 'inactive'
            mimeType = 'audio/webm'
            ondataavailable?: (event: { data: Blob }) => void
            onstop?: () => void
            start() {
              this.state = 'recording'
              probe.started++
            }
            stop() {
              this.state = 'inactive'
              this.ondataavailable?.({ data: new Blob(['synthetic']) })
              this.onstop?.()
            }
          }
          Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: Recorder })
          Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: {
              getUserMedia: () =>
                new Promise((resolve) => {
                  probe.permit = () =>
                    resolve({
                      getTracks: () => [
                        {
                          stop: () => {
                            probe.stopped++
                          },
                        },
                      ],
                    })
                  if (!pending) probe.permit()
                }),
            },
          })
          const original = URL.createObjectURL
          URL.createObjectURL = (blob) => {
            probe.urls++
            return original(blob)
          }
        }, pending)
        await frame.getByRole('button', { name: phase === 'boss' ? /The Final Boss Test/ : /Enter the Dojo/ }).click()
        await frame
          .getByRole('button', {
            name:
              phase === 'boss' ? 'Reading Test' : slug === 'kindergarten' ? 'High-frequency words' : 'Read the Words',
            exact: true,
          })
          .click()
        await frame.getByRole('button', { name: 'Record my reading', exact: true }).click()
        if (pending) await expect(frame.getByText('Waiting for microphone permission…', { exact: true })).toBeVisible()
        else await expect(frame.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible()
        const prompt = await frame.locator('[data-report-target]').last().getAttribute('data-report-target')
        await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
        if (pending) await frame.locator('body').evaluate(() => (window as any).microphoneProbe.permit())
        await expect.poll(() => frame.locator('body').evaluate(() => (window as any).microphoneProbe.stopped)).toBe(1)
        await page.getByRole('button', { name: 'Close and return', exact: true }).click()
        await expect(frame.getByRole('button', { name: 'Record my reading', exact: true })).toBeVisible()
        await expect(frame.locator('[data-report-target]').last()).toHaveAttribute('data-report-target', prompt!)
        const probe = await frame.locator('body').evaluate(() => (window as any).microphoneProbe)
        expect(probe.urls).toBe(0)
        expect(probe.started).toBe(pending ? 0 : 1)
        expect(
          await page.evaluate(() =>
            Object.keys(localStorage).filter((k) => k.startsWith('family-beta-preview-results-v1:')),
          ),
        ).toEqual([])
      })
    }
  }
}
