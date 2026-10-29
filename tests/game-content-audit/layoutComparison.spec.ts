import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { inspectSnapshot } from '../../src/familyBeta/curriculum.ts'
import { reinforcementGames } from '../../src/familyBeta/gamePools.ts'

// These controls already existed in Prototype 4 for Grade 5. Compare that
// working route before attributing the newly enabled Grade 2 layout to content.
for (const game of ['Shuriken Match', 'Dictation Streak']) {
  test(`${game}: predecessor comparison records the existing vertical-scroll layout`, async ({ page, baseURL }) => {
    await page.clock.setFixedTime(new Date('2026-10-23T19:00:00Z'))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(() => {
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: {
          cancel() {},
          resume() {},
          getVoices: () => [],
          speak(u: SpeechSynthesisUtterance) {
            u.onstart?.({} as SpeechSynthesisEvent)
            setTimeout(() => u.onend?.({} as SpeechSynthesisEvent), 5)
          },
        },
      })
    })
    const source = inspectSnapshot(
      JSON.parse(readFileSync(new URL('../fixtures/dojo-launch-2026-10-16/grade5.json', import.meta.url), 'utf8')),
    )
    const capability = reinforcementGames(source.datasets, '2026-10-05', 'Grade 5').find(
      (g) => g.capability.status === 'ready' && g.capability.pack.title === game,
    )!.capability
    if (capability.status !== 'ready') throw new Error('Expected an existing predecessor game')
    const measurements = []
    for (const [version, origin] of [
      ['prototype4', 'http://127.0.0.1:5286'],
      ['prototype5', baseURL!],
    ]) {
      await page.goto(`${origin}/family-beta-preview.html?grade=grade5`)
      const frame = page.frameLocator('iframe:visible')
      await frame.getByRole('button', { name: /Practice.*Ninja Skills/ }).click()
      await frame.getByRole('button', { name: game, exact: true }).click()
      await expect(frame.getByRole('button', { name: 'Exit learning module', exact: true })).toBeVisible()
      if (capability.pack.moduleId === 'dictation-streak') {
        await frame.locator('input').fill(capability.pack.rounds[0].pinyinSteps![0].pinyin)
        await expect(frame.getByRole('option').first()).toBeVisible()
      }
      const controls = frame.locator(game === 'Shuriken Match' ? '.lg-word-seal' : '[role="option"]')
      await expect(controls.first()).toBeVisible()
      const sizes = await controls.evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect()
          return { text: node.textContent, top: rect.top, bottom: rect.bottom, height: innerHeight }
        }),
      )
      measurements.push({ version, sizes })
      // Record where the controls land; focusing the input can scroll WebKit.
      // Overflow is an observation, not a requirement for a healthy game.
      expect(sizes.length).toBeGreaterThan(0)
      await page.screenshot({ path: test.info().outputPath(`${version}-initial-layout.png`) })
      for (const control of await controls.all()) {
        await control.scrollIntoViewIfNeeded()
        await expect(control).toBeInViewport({ ratio: 1 })
      }
    }
    await test.info().attach('layout-comparison', {
      body: JSON.stringify(measurements, null, 2),
      contentType: 'application/json',
    })
  })
}
