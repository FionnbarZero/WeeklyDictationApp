import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
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
          setTimeout(() => {
            u.onstart?.({} as SpeechSynthesisEvent)
            u.onend?.({} as SpeechSynthesisEvent)
          }, 0)
        },
      },
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException('Synthetic denied microphone', 'NotAllowedError')
        },
      },
    })
  })
})

async function saved(page: Page) {
  return page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith('family-beta-acquisition-v1:'))
      .map((k) => JSON.parse(localStorage.getItem(k)!)),
  )
}
async function launch(page: Page, slug: string, channel: 'writing' | 'reading') {
  if (slug === 'grade2' && (await page.getByLabel('Practice week').inputValue()) !== '2026-09-21') {
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByLabel('Practice week').selectOption('2026-09-21')
    await expect(page.locator('iframe')).toHaveAttribute('src', /week=2026-09-21/)
  }
  const frame = page.frameLocator('iframe')
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  const label =
    slug === 'kindergarten'
      ? channel === 'writing'
        ? 'Writing characters'
        : 'High-frequency words'
      : channel === 'writing'
        ? 'Learn to Write'
        : 'Read the Words'
  await frame.getByRole('button', { name: label, exact: true }).click()
  return frame
}

for (const slug of ['grade5', 'kindergarten']) {
  test(`${slug}: writing saves reviewed trial, resumes after reload, and preserves history after Done`, async ({
    page,
  }) => {
    await page.goto(`/family-beta-preview.html?grade=${slug}`)
    let frame = await launch(page, slug, 'writing')
    if (slug === 'grade5') await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
    for (let i = 0; i < 4; i++) {
      await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
      const correct = frame.getByRole('button', { name: 'I got it right', exact: true })
      await correct.click()
    }
    const [before] = await saved(page)
    expect(before.envelope.revision).toBe(4)
    expect(
      before.assessments.filter((a: { countsTowardWeeklyScore: boolean }) => a.countsTowardWeeklyScore),
    ).toHaveLength(1)
    await page.reload()
    frame = await launch(page, slug, 'writing')
    expect(await saved(page)).toEqual([before])
    await expect(frame.getByRole('button', { name: 'Skip Timer', exact: true })).toBeVisible()
    await frame.getByRole('button', { name: 'Done for today', exact: true }).click()
    await page.getByRole('button', { name: 'Progress', exact: true }).click()
    await expect(page.getByRole('cell', { name: '1 / 1', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Activities', exact: true }).click()
    await launch(page, slug, 'writing')
    const [next] = await saved(page)
    expect(next.envelope).toEqual(before.envelope)
    expect(next.assessments).toHaveLength(0)
    expect(next.reviewedTrials).toEqual(before.reviewedTrials)
    expect(next.sessionId).not.toBe(before.sessionId)
  })
}
for (const slug of ['grade5', 'grade2', 'kindergarten']) {
  test(`${slug}: reading resumes exact next trial without retaining audio`, async ({ page }) => {
    await page.goto(`/family-beta-preview.html?grade=${slug}`)
    const frame = await launch(page, slug, 'reading')
    await frame.getByRole('button', { name: 'Record my reading', exact: true }).click()
    await frame.getByRole('button', { name: 'Continue without recording', exact: true }).click()
    await frame.getByRole('button', { name: 'Yes', exact: true }).click()
    const [before] = await saved(page)
    expect(before.envelope.revision).toBe(1)
    expect(before.reviewedTrials).toHaveLength(1)
    expect(JSON.stringify(before)).not.toMatch(/blob:|data:audio|audio\/webm/)
    await page.reload()
    await launch(page, slug, 'reading')
    expect(await saved(page)).toEqual([before])
    await expect(frame.getByRole('button', { name: 'Record my reading', exact: true })).toBeVisible()
  })
}
