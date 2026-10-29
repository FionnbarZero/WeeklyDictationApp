import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { validateCurriculum } from '../../src/familyBeta/curriculum.ts'
import { reinforcementGames } from '../../src/familyBeta/gamePools.ts'
import { grade2StrokeMedians } from '../../src/learningGames/strokeOrder/grade2StrokeAssets.ts'
import { buildStrokeOrderRounds } from '../../src/learningGames/strokeOrder/rounds.ts'
import { wetlandStrokeMedians } from '../../src/learningGames/strokeOrder/wetlandStrokeAssets.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'
import { withGameLanguage } from '../w2-recovery/contentFixtures.ts'

const activity = (page: Page) => page.frameLocator('iframe:visible')
const words = ['湿地', '食物', '还有', '动物', '蛋']
type SoundWindow = Window & { wetlandSound: { ended: number; urls: string[]; fallback: string[] } }
const sound = (page: Page) => page.evaluate(() => (window as SoundWindow).wetlandSound)
test.beforeEach(async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-10-26T19:00:00Z'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    const top = window.top as SoundWindow
    top.wetlandSound ||= { ended: 0, urls: [], fallback: [] }
    const original = HTMLMediaElement.prototype.play
    const observed = new WeakSet<HTMLMediaElement>()
    HTMLMediaElement.prototype.play = function () {
      this.muted = true
      if (!observed.has(this)) {
        observed.add(this)
        this.addEventListener('ended', () => top.wetlandSound.ended++)
      }
      return original.call(this)
    }
    const fetchOriginal = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('/audio/kore/')) top.wetlandSound.urls.push(url)
      return fetchOriginal(input, init)
    }
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices: () => [],
        speak(u: SpeechSynthesisUtterance) {
          if (/\p{Script=Han}/u.test(u.text)) top.wetlandSound.fallback.push(u.text)
          u.onstart?.({} as SpeechSynthesisEvent)
          setTimeout(() => u.onend?.({} as SpeechSynthesisEvent), 5)
        },
      },
    })
  })
})
async function open(page: Page) {
  await page.goto('./family-beta-preview.html?grade=grade2')
  await expect(activity(page).getByRole('button', { name: /Enter the Dojo/ })).toBeVisible({ timeout: 30000 })
  await expect(page.locator('iframe:visible')).toHaveAttribute('data-family-week', '2026-10-19')
  const raw = await page.locator('iframe:visible').getAttribute('data-family-source')
  const loaded = await validateCurriculum(raw!, 'Grade 2')
  expect(loaded.datasets.find((d) => d.startDate === '2026-10-19')!.words.map((w) => w.text)).toEqual(words)
  expect(loaded.datasets.some((d) => d.startDate === '2026-10-26')).toBe(false)
  expect(
    await page.getByRole('option', { name: 'This week · Wetland review (10/26–10/30)', exact: true }).count(),
  ).toBe(1)
  return loaded
}
async function write(page: Page) {
  const f = activity(page),
    dojo = f.getByRole('button', { name: /Enter the Dojo/ })
  if (await dojo.isVisible()) await dojo.click()
  await f.getByRole('button', { name: 'Learn to Write', exact: true }).click()
  const teacher = f.getByRole('region', { name: 'Stroke order teacher' }),
    skip = f.getByRole('button', { name: 'Skip Warmup', exact: true })
  await expect(teacher.or(skip)).toBeVisible({ timeout: 30000 })
  if (await skip.isVisible()) await skip.click()
  await expect(teacher).toBeVisible()
  return teacher
}
async function trace(page: Page, character: string) {
  const teacher = activity(page).getByRole('region', { name: 'Stroke order teacher' }),
    pad = teacher.locator('svg[role="application"]')
  const strokes = buildStrokeOrderRounds([{ id: 'test', text: character }], {
    ...grade2StrokeMedians,
    ...wetlandStrokeMedians,
  }).rounds[0].strokes
  const layout = getStrokeLayout(strokes)
  const start = Number(await pad.getAttribute('data-next-stroke'))
  for (let i = start; i < strokes.length; i++) {
    const b = (await pad.boundingBox())!
    const xy = (p: readonly [number, number]) =>
      [
        b.x + ((p[0] * layout.scale + layout.offsetX) * b.width) / 100,
        b.y + ((p[1] * layout.scale + layout.offsetY) * b.height) / 100,
      ] as const
    await page.mouse.move(...xy(strokes[i][0]))
    await page.mouse.down()
    for (const p of strokes[i].slice(1)) await page.mouse.move(...xy(p))
    await page.mouse.up()
    await expect(pad).toHaveAttribute('data-next-stroke', String(i + 1))
  }
}
async function report(page: Page) {
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Report a problem', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
}
test('real teacher source restores Wetland; tracing correction and checkpoint survive reopen and source outage', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const loaded = await open(page),
    teacher = await write(page)
  const targetId = await teacher.getAttribute('data-report-target')
  const word = loaded.datasets.flatMap((d) => d.words).find((w) => w.id === targetId)!.text
  expect(words).toContain(word)
  await expect.poll(async () => (await sound(page)).ended, { timeout: 30000 }).toBeGreaterThan(0)
  expect((await sound(page)).fallback).toEqual([])
  const pad = teacher.locator('svg[role="application"]')
  await expect(pad).toBeInViewport()
  for (let i = 0; i < 3; i++) {
    const b = (await pad.boundingBox())!
    await page.mouse.move(b.x + 8, b.y + 8)
    await page.mouse.down()
    await page.mouse.move(b.x + 20, b.y + 8)
    await page.mouse.up()
    await expect(teacher).toHaveAttribute('data-step', '1')
    await expect(pad).toHaveAttribute('data-next-stroke', '0')
  }
  await trace(page, [...word][0])
  await activity(page).getByRole('button', { name: 'Next step', exact: true }).click()
  await expect(teacher).toHaveAttribute('data-step', '2')
  await report(page)
  await activity(page)
    .getByRole('button', { name: /^(Exit game|Pause and return)$/ })
    .click()
  await page.route('**/weekly-dictation-curriculum-*/curriculum/beta/grade2.json', (r) =>
    r.abort('internetdisconnected'),
  )
  await open(page)
  const resumed = await write(page)
  await expect(resumed).toHaveAttribute('data-step', '2')
  await expect(resumed).toHaveAttribute('data-report-target', targetId!)
  expect(errors).toEqual([])
  await page.screenshot({ path: test.info().outputPath('wetland-resumed.png'), fullPage: true })
})
test('recovered reading targets play Kore and retain Report and Exit', async ({ page }) => {
  await open(page)
  const f = activity(page)
  await f.getByRole('button', { name: /Enter the Dojo/ }).click()
  await f.getByRole('button', { name: 'Read the Words', exact: true }).click()
  const skip = f.getByRole('button', { name: 'Skip Warmup', exact: true }),
    exit = f.getByRole('button', { name: /^(Exit reading|Pause and return)$/ })
  await expect(skip.or(exit)).toBeVisible()
  if (await skip.isVisible()) await skip.click()
  await expect(exit).toBeVisible()
  await f.getByRole('button', { name: 'Record my reading', exact: true }).click()
  await f.getByRole('button', { name: 'Continue without recording', exact: true }).click()
  await expect.poll(async () => (await sound(page)).ended, { timeout: 30000 }).toBeGreaterThan(0)
  expect((await sound(page)).fallback).toEqual([])
  expect((await sound(page)).urls.length).toBeGreaterThan(0)
  await report(page)
  await exit.click()
})
test('both Wetland characters finish all five guided trials before whole-word acquisition', async ({ page }) => {
  const loaded = await open(page),
    teacher = await write(page),
    f = activity(page)
  const id = await teacher.getAttribute('data-report-target')
  expect(loaded.datasets.flatMap((d) => d.words).find((w) => w.id === id)!.text).toBe('湿地')
  for (const [index, char] of [...'湿地'].entries()) {
    await expect(teacher).toHaveAttribute('data-character-index', String(index))
    for (let step = 1; step <= 5; step++) {
      await expect(teacher).toHaveAttribute('data-step', String(step))
      await expect(f.locator('#slay-acquisition-root')).toHaveCount(0)
      await trace(page, char)
      await f.getByRole('button', { name: step === 5 ? 'Compare' : 'Next step', exact: true }).click()
      if (step === 5) await f.getByRole('button', { name: 'I slayed it', exact: true }).click()
    }
  }
  await expect(teacher).toHaveCount(0)
  await expect(f.locator('#slay-acquisition-root')).toBeVisible()
  await expect(f.getByRole('button', { name: /Skip timer/i })).toBeVisible()
  await report(page)
  expect((await sound(page)).fallback).toEqual([])
  await page.screenshot({ path: test.info().outputPath('wetland-whole-word.png'), fullPage: true })
})

test('Wetland Shuriken words recover a wrong match and finish a full board', async ({ page }) => {
  // Source/clock fixture only: demonstrate ordinary earlier-word games once a
  // subsequent week arrives. Never add this synthetic week to a hosted source.
  const source = JSON.parse(
    readFileSync(new URL('../fixtures/game-content-2026-10-26/grade2.json', import.meta.url), 'utf8'),
  )
  const next = structuredClone(
    source.payload.slides.find((s: { objectId: string }) => s.objectId === 'h1ff8b9c421a2a037_0_0'),
  )
  next.objectId = 'synthetic-next-week'
  next.text = next.text.replace('10/19-10/23', '11/2-11/6')
  source.payload.slides.unshift(next)
  source.contentSha256 = createHash('sha256').update(JSON.stringify(source.payload)).digest('hex')
  const loaded = await validateCurriculum(JSON.stringify(source), 'Grade 2')
  const capability = reinforcementGames(withGameLanguage(loaded.datasets), '2026-11-02', 'Grade 2').find(
    (g) => g.capability.status === 'ready' && g.capability.pack.moduleId === 'speed-match',
  )!.capability
  if (capability.status !== 'ready' || capability.pack.moduleId !== 'speed-match')
    throw new Error('Missing Wetland match game')
  expect(capability.pack.cohort.provenance.map((p) => p.datasetId)).toEqual([
    'grade-2__2026-27__2026-10-19__2026-10-23',
  ])
  await page.clock.setSystemTime(new Date('2026-11-02T19:00:00Z'))
  await page.route('**/curriculum/beta/grade2.json', (r) => r.fulfill({ json: source }))
  await page.goto('./family-beta-preview.html?grade=grade2')
  const f = activity(page)
  await f.getByRole('button', { name: /Practice.*Ninja Skills/ }).click()
  await f.getByRole('button', { name: 'Shuriken Match', exact: true }).click()
  const pairs = capability.pack.pairs
  const card = (label: string) => f.getByRole('button', { name: `${label}. Click to hear and select.`, exact: true })
  await card(pairs[0].left.label).click()
  await card(pairs[1].right.label).click()
  await expect(f.locator('.lg-shuriken-status')).toContainText('Decoy seals!')
  for (const [index, pair] of pairs.entries()) {
    await card(pair.left.label).click()
    await card(pair.right.label).click()
    if (index + 1 < pairs.length) await expect(f.locator('.lg-word-seal.is-matched')).toHaveCount((index + 1) * 2)
  }
  await expect(f.getByRole('button', { name: 'Back to Ninja Skills', exact: true })).toBeVisible()
  await report(page)
  await f.getByRole('button', { name: 'Exit learning module', exact: true }).click()
  expect((await sound(page)).fallback).toEqual([])
})

test('selected new Kore files decode and finish through native media', async ({ page }) => {
  await open(page)
  const catalog = JSON.parse(readFileSync(new URL('../../src/audio/kore/catalog.json', import.meta.url), 'utf8')).assets
  const newWords = [
    '湿地',
    '栖息地',
    '还有',
    '蛋',
    '昆虫',
    '金蛙',
    '蛇',
    '鳄鱼',
    '湿',
    '食',
    '还',
    '这只金蛙的身体是金黄色的',
    '湿地是许多鸟的家',
    '池塘里有鱼，还有青蛙',
    '鸟在窝里下蛋',
    '池塘是青蛙的栖息地',
    '我在草地上发现一只昆虫',
    '这条蛇在草丛里爬',
    '鳄鱼有一条长长的尾巴',
  ]
  for (const text of newWords) {
    const result = await page.evaluate(async (path) => {
      const response = await fetch('./' + path)
      if (!response.ok) return 'HTTP ' + response.status
      const url = URL.createObjectURL(await response.blob()),
        audio = new Audio(url)
      audio.muted = true
      audio.playbackRate = 4
      try {
        return await new Promise<string>((resolve) => {
          const timer = setTimeout(() => resolve('timeout'), 20000)
          audio.onended = () => {
            clearTimeout(timer)
            resolve('ended')
          }
          audio.onerror = () => {
            clearTimeout(timer)
            resolve('decode error')
          }
          audio.play().catch((e) => {
            clearTimeout(timer)
            resolve(e.name)
          })
        })
      } finally {
        audio.pause()
        URL.revokeObjectURL(url)
      }
    }, catalog[text])
    expect(result, text).toBe('ended')
  }
})
