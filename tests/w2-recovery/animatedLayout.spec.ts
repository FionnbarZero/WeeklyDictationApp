import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { inspectSnapshot } from '../../src/familyBeta/curriculum.ts'
import { reinforcementGames } from '../../src/familyBeta/gamePools.ts'

for (const [slug, grade] of [
  ['grade2', 'Grade 2'],
  ['grade5', 'Grade 5'],
] as const) {
  test(`${grade}: animated Sushi stays in place through two mistakes, retry and a correct sentence`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.setViewportSize(info.project.use.hasTouch ? { width: 1024, height: 665 } : { width: 983, height: 638 })
    await page.clock.setSystemTime(new Date('2026-10-23T19:00:00Z'))
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
      HTMLMediaElement.prototype.play = function () {
        setTimeout(() => this.dispatchEvent(new Event('ended')), 5)
        return Promise.resolve()
      }
    })
    const source = inspectSnapshot(
      JSON.parse(readFileSync(new URL(`../fixtures/dojo-launch-2026-10-16/${slug}.json`, import.meta.url), 'utf8')),
    )
    const anchor = source.datasets
      .filter((d) => d.startDate <= '2026-10-23')
      .sort((a, b) => b.startDate.localeCompare(a.startDate))[0].startDate
    const candidate = reinforcementGames(source.datasets, anchor, grade).find(
      (g) => g.capability.status === 'ready' && g.capability.pack.moduleId === 'sentence-scramble',
    )!
    if (candidate.capability.status !== 'ready' || candidate.capability.pack.moduleId !== 'sentence-scramble')
      throw new Error('Missing Sushi fixture')
    const round = candidate.capability.pack.rounds[0]
    await page.goto(`/family-beta-preview.html?grade=${slug}`)
    const frame = page.frameLocator('iframe:visible')
    await frame.getByRole('button', { name: /Practice.*Ninja Skills/ }).click()
    await frame.getByRole('button', { name: 'Sushi Scramble', exact: true }).click()
    const card = frame.locator('.lg-scramble-card')
    async function stable() {
      await expect(card).toHaveJSProperty('scrollTop', 0)
      await expect(card).toHaveJSProperty('scrollLeft', 0)
      expect(await frame.locator('html').evaluate(() => scrollY)).toBe(0)
      await expect(frame.getByRole('button', { name: 'Exit learning module', exact: true })).toBeInViewport({
        ratio: 1,
      })
      await expect(frame.getByRole('button', { name: 'Hear slowly', exact: true })).toBeInViewport({ ratio: 1 })
      await expect(frame.locator('.lg-sushi-plate')).toBeInViewport({ ratio: 1 })
      await expect(frame.locator('.lg-sushi-bar')).toBeInViewport({ ratio: 1 })
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const ids = attempt < 2 ? [...round.correctTokenIds].reverse() : round.correctTokenIds
      await expect(frame.locator('.lg-round-label')).toHaveText(
        `Sentence 1 of ${candidate.capability.pack.rounds.length}`,
      )
      for (const [position, id] of ids.entries()) {
        const token = round.tokens.find((t) => t.id === id)!
        await stable()
        await frame
          .locator('.lg-sushi-bar')
          .getByRole('button', { name: `Place ${token.label} in sentence position ${position + 1}`, exact: true })
          .and(frame.locator('button:enabled'))
          .first()
          .click()
      }
      const feedback = frame.locator(`.lg-feedback.is-${attempt < 2 ? 'incorrect' : 'correct'}`)
      // Observe transient feedback in one assertion; a separate visibility wait
      // can consume its lifetime before the viewport observer runs.
      await expect(feedback).toBeInViewport({ ratio: 1 })
      await stable()
      await page.screenshot({ path: info.outputPath(`animated-response-${attempt}.png`) })
      await expect(feedback).toBeHidden()
    }
    await expect(frame.locator('.lg-round-label')).toHaveText(
      `Sentence 2 of ${candidate.capability.pack.rounds.length}`,
    )
    await frame.getByRole('button', { name: 'Exit learning module', exact: true }).click()
    await expect(frame.getByRole('button', { name: 'Sushi Scramble', exact: true })).toBeVisible()
  })
}
