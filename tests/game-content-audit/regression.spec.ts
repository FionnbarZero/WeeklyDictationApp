import { readFileSync } from 'node:fs'
import { expect, type FrameLocator, type Page, test } from '@playwright/test'
import type { WritingProgress } from '../../src/application/writingAcquisition/contracts.ts'
import { inspectSnapshot } from '../../src/familyBeta/curriculum.ts'
import { reinforcementGames } from '../../src/familyBeta/gamePools.ts'
import type { BetaResult } from '../../src/familyBeta/model.ts'
import { strokeOrderGuide } from '../../src/familyBeta/strokeOrderSlay.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'
import { withGameLanguage } from '../w2-recovery/contentFixtures.ts'

test.beforeEach(async ({ page, context }) => {
  await page.clock.setFixedTime(new Date('2026-10-23T19:00:00Z'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await context.addInitScript(() => {
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
      this.dispatchEvent(new Event('playing'))
      setTimeout(() => this.dispatchEvent(new Event('ended')), 10)
      return Promise.resolve()
    }
  })
})

async function writing(page: Page, url: string, slug: string) {
  await page.goto(`${url}/family-beta-preview.html?grade=${slug}`)
  const frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await frame
    .getByRole('button', { name: slug === 'kindergarten' ? 'Writing characters' : 'Learn to Write', exact: true })
    .click()
  const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
  const warmup = frame.getByRole('button', { name: 'Skip Warmup', exact: true })
  await expect(teacher.or(warmup)).toBeVisible()
  if (await warmup.isVisible()) await warmup.click()
  await expect(teacher).toBeVisible()
  return frame
}

async function saved(page: Page): Promise<WritingProgress> {
  return page.evaluate(() => {
    for (const raw of Object.values(localStorage)) {
      let r
      try {
        r = JSON.parse(raw)
      } catch {
        continue
      }
      if (r.writing) return r.writing
      for (const item of Object.values(r.records || {})) {
        try {
          const p = JSON.parse(item as string).values?.writingAcquisitionProgress?.[0]
          if (p) return p
        } catch {
          /* Unrelated synthetic data. */
        }
      }
    }
    throw new Error('No synthetic writing checkpoint')
  })
}

async function oneStep(page: Page, frame: FrameLocator) {
  const before = await saved(page)
  const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
  const targetId = await teacher.getAttribute('data-report-target')
  const target = before.lesson.targets.find((t) => t.id === targetId)!
  const char = Array.from(target.text)[Number(await teacher.getAttribute('data-character-index'))]
  const strokes = strokeOrderGuide({ id: target.id, text: char }).strokes
  const layout = getStrokeLayout(strokes)
  const pad = teacher.locator('svg[role="application"]')
  for (let i = Number(await pad.getAttribute('data-next-stroke')); i < strokes.length; i++) {
    const b = (await pad.boundingBox())!
    const point = (p: readonly [number, number]) =>
      [
        b.x + ((p[0] * layout.scale + layout.offsetX) * b.width) / 100,
        b.y + ((p[1] * layout.scale + layout.offsetY) * b.height) / 100,
      ] as const
    await page.mouse.move(...point(strokes[i][0]))
    await page.mouse.down()
    for (const p of strokes[i].slice(1)) await page.mouse.move(...point(p))
    await page.mouse.up()
    await expect(pad).toHaveAttribute('data-next-stroke', String(i + 1))
  }
  await frame.getByRole('button', { name: 'Next step', exact: true }).click()
  await expect.poll(async () => (await saved(page)).revision).toBe(before.revision + 1)
}

for (const slug of ['kindergarten', 'grade2', 'grade5']) {
  test(`${slug}: Prototype 4 writing resumes its pinned language and step after the content upgrade`, async ({
    page,
    context,
    baseURL,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    const old = await writing(page, 'http://127.0.0.1:5286', slug)
    await oneStep(page, old)
    const before = await saved(page)
    const state = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
    // Transfer only this fresh synthetic context into the new origin, once.
    await context.addInitScript(
      ({ state, origin }) => {
        if (window === window.top && location.origin === origin && !localStorage.getItem('audit-upgrade-seeded')) {
          for (const [key, value] of Object.entries(state)) localStorage.setItem(key, value)
          localStorage.setItem('audit-upgrade-seeded', 'true')
        }
      },
      { state, origin: new URL(baseURL!).origin },
    )
    const current = await writing(page, baseURL!, slug)
    expect(await saved(page)).toEqual(before)
    await expect(current.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '2')
    await oneStep(page, current)
    const continued = await saved(page)
    expect(continued.lesson).toEqual(before.lesson)
    expect(continued.completedTeachingSteps[0]).toBe(before.completedTeachingSteps[0] + 1)
    await page.screenshot({ path: test.info().outputPath(`${slug}-upgraded-step.png`), fullPage: true })
    expect(errors).toEqual([])
  })
}

for (const game of ['Shuriken Match', 'Dictation Streak']) {
  test(`${game}: later Grade 2 visits support the five-character reading target in landscape`, async ({ page }) => {
    const source = inspectSnapshot(
      JSON.parse(readFileSync(new URL('../fixtures/dojo-launch-2026-10-16/grade2.json', import.meta.url), 'utf8')),
    )
    const selected = reinforcementGames(withGameLanguage(source.datasets), '2026-10-13', 'Grade 2').find(
      (g) => g.capability.status === 'ready' && g.capability.pack.title === game,
    )!
    const results: BetaResult[] = Array.from({ length: 11 }, (_, i) => ({
      schema: 1,
      id: `content-audit-visit-${i}`,
      childId: 'preview-1',
      grade: 'Grade 2',
      activity: game,
      channel: 'game',
      datasetIds: selected.datasets.map((d) => d.id),
      correct: 1,
      attempted: 1,
      completedAt: '2026-10-22T19:00:00.000Z',
      day: '2026-10-22',
    }))
    await page.addInitScript((results) => {
      if (!localStorage.getItem('content-audit-seeded')) {
        localStorage.setItem('family-beta-preview-results-v1', JSON.stringify(results))
        localStorage.setItem('content-audit-seeded', 'true')
      }
    }, results)
    await page.goto('/family-beta-preview.html?grade=grade2')
    let frame = page.frameLocator('iframe:visible')
    await frame.getByRole('button', { name: /Practice.*Ninja Skills/ }).click()
    await frame.getByRole('button', { name: game, exact: true }).click()
    frame = page.frameLocator('iframe:visible')
    const rotated = reinforcementGames(
      withGameLanguage(source.datasets),
      '2026-10-13',
      'Grade 2',
      results,
      'preview-1',
    ).find((g) => g.capability.status === 'ready' && g.capability.pack.title === game)!.capability
    if (rotated.status !== 'ready') throw new Error('Expected a playable rotated game')
    const pack = rotated.pack
    const sourceTerms = pack.cohort.terms
    const prompts = 'pairs' in pack ? pack.pairs : pack.rounds
    expect(prompts.some((p) => sourceTerms.find((t) => t.occurrenceId === p.targetId)?.text === '各种各样的')).toBe(
      true,
    )
    if (pack.moduleId === 'speed-match') {
      await expect(frame.locator('.lg-word-seal').first()).toBeVisible()
      // Large boards are vertically scrollable. Check reachability, not an
      // unsupported requirement that all sixteen cards fit above the fold.
      for (const card of await frame.locator('.lg-word-seal').all()) {
        await card.scrollIntoViewIfNeeded()
        await expect(card).toBeInViewport({ ratio: 1 })
      }
      const pair = pack.pairs.find((p) => p.left.label === '各种各样的')!
      for (const side of [pair.left, pair.right])
        await frame.getByRole('button', { name: `${side.label}. Click to hear and select.`, exact: true }).click()
      await expect(frame.locator('.lg-word-seal.is-matched')).toHaveCount(2)
    } else if (pack.moduleId === 'dictation-streak') {
      for (const [i, round] of pack.rounds.entries()) {
        await expect(frame.locator('.lg-round-label')).toHaveText(`Prompt ${i + 1} of ${pack.rounds.length}`)
        let answer = ''
        for (const [index, step] of round.pinyinSteps!.entries()) {
          await frame.locator('input').fill(answer + step.pinyin)
          const char = Array.from(round.targetText)[index]
          const option = frame.getByRole('option', { name: char, exact: true })
          await option.scrollIntoViewIfNeeded()
          await expect(option).toBeInViewport({ ratio: 1 })
          await option.click()
          answer += char
          await expect(frame.locator('input')).toHaveValue(answer)
        }
        const check = frame.getByRole('button', { name: 'Check characters', exact: true })
        await check.scrollIntoViewIfNeeded()
        await expect(check).toBeInViewport({ ratio: 1 })
        await check.click()
      }
      await expect(frame.getByRole('button', { name: 'Back to Ninja Skills', exact: true })).toBeVisible()
    }
    const exit = frame.getByRole('button', { name: 'Exit learning module', exact: true })
    await exit.scrollIntoViewIfNeeded()
    await expect(exit).toBeInViewport({ ratio: 1 })
    const report = page.getByRole('button', { name: 'Report a problem', exact: true })
    // WebKit may crop one outer-toolbar pixel after scrolling the iframe.
    // Require a usable button and verify the actual open/return interaction.
    await expect(report).toBeInViewport({ ratio: 0.95 })
    await report.click()
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await page.screenshot({ path: test.info().outputPath('long-reading-target.png'), fullPage: true })
  })
}
