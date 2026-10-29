import { expect, type FrameLocator, type Page, test } from '@playwright/test'
import { strokeOrderGuide } from '../../src/familyBeta/strokeOrderSlay.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'

// Independent transcription of the approved page 2 contract. Do not derive
// expected words, meanings or sentences from the application under test.
const targets = [
  { text: '或者', pinyin: 'huò zhě', meaning: 'or', tokens: ['你', '可以', '画画，', '或者', '看书。'] },
  {
    text: '了解',
    pinyin: 'liǎo jiě',
    meaning: 'understand / learn about',
    tokens: ['我', '想', '了解', '大象', '是', '怎么', '生活', '的。'],
  },
  { text: '完', pinyin: 'wán', meaning: 'finish', tokens: ['我', '已经', '看', '完', '这', '本', '书', '了。'] },
  {
    text: '兴奋的',
    pinyin: 'xīng fèn de',
    meaning: 'excited',
    tokens: ['听到', '这个', '好消息，', '他', '是', '很', '兴奋的。'],
  },
  { text: '告诉', pinyin: 'gào su', meaning: 'tell', tokens: ['老师', '告诉', '我们', '一个', '有趣的', '故事。'] },
  { text: '沟通', pinyin: 'gōu tōng', meaning: 'communicate', tokens: ['大象', '会', '用', '声音', '互相', '沟通。'] },
  { text: '快速地', pinyin: 'kuài sù de', meaning: 'quickly', tokens: ['大象', '快速地', '跑', '向', '前方。'] },
  {
    text: '有意思',
    pinyin: 'yǒu yì si',
    meaning: 'interesting',
    tokens: ['大象', '的', '沟通', '方式', '很', '有意思。'],
  },
] as const
const datasetId = 'grade-5__2026-27__2026-10-19__2026-10-23'
const sectionNames = [/Enter the Dojo/, /Practice your Ninja Skills/, /Final Boss/]
const browserErrors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page, baseURL }) => {
  const errors: string[] = []
  browserErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.clock.setFixedTime(new Date('2026-10-21T19:00:00Z'))
  const origin = new URL(baseURL!).origin
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
  )
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices() {
          return []
        },
        speak(utterance: SpeechSynthesisUtterance) {
          utterance.onstart?.({} as SpeechSynthesisEvent)
          setTimeout(() => utterance.onend?.({} as SpeechSynthesisEvent), 5)
        },
      },
    })
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('playing'))
      setTimeout(() => this.dispatchEvent(new Event('ended')), 10)
      return Promise.resolve()
    }
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        async getUserMedia() {
          throw new DOMException('Synthetic microphone refusal', 'NotAllowedError')
        },
      },
    })
  })
  await page.goto('/family-beta-preview.html')
  await expect(page.frameLocator('iframe:visible').getByRole('button', { name: /Enter the Dojo/ })).toBeVisible()
})

test.afterEach(async ({ page }) => expect(browserErrors.get(page)).toEqual([]))
const frameOf = (page: Page) => page.frameLocator('iframe:visible')
async function open(page: Page, section: RegExp, activity?: string) {
  const frame = frameOf(page)
  const back = frame.getByRole('button', { name: '← Back to all challenges', exact: true })
  if (await back.isVisible()) await back.click()
  await frame.getByRole('button', { name: section }).click()
  if (activity && section.source.includes('Final Boss')) {
    const group = activity.startsWith('Return to Dojo')
      ? 'Need more training?'
      : activity.endsWith(' Test')
        ? 'Boss Test'
        : 'Boss Games'
    await frame.getByRole('button', { name: group, exact: true }).click()
  }
  if (
    activity &&
    section.source.includes('Ninja Skills') &&
    (activity.startsWith('Return to Dojo') || activity.endsWith(' Test'))
  )
    await frame.getByRole('button', { name: 'More activities', exact: true }).click()
  if (activity) await frame.getByRole('button', { name: activity, exact: true }).click()
  return frame
}
const results = (page: Page) =>
  page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([key]) => key.startsWith('family-beta-preview-results-v1:'))
      .map(
        ([, raw]) =>
          JSON.parse(raw) as {
            activity: string
            channel: string
            grade: string
            correct: number
            attempted: number
            datasetIds: string[]
          },
      ),
  )
const writingRecords = (page: Page) =>
  page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([key]) => key.startsWith('family-beta-acquisition-v1:'))
      .map(([, raw]) => JSON.parse(raw))
      .filter((record) => record.writing),
  )

test('one Grade 5 entry exposes all eight shared words in all three paths with compact controls and no retired cards', async ({
  page,
}, info) => {
  await expect(page.locator('.beta-preview-child-label')).toHaveText('Grade 5')
  const toolbar = page.locator('.beta-preview-strip')
  expect((await toolbar.boundingBox())!.height).toBeLessThanOrEqual(48)
  for (const section of sectionNames) {
    const frame = await open(page, section)
    const groups = frame.locator('.learning-hub-word-list')
    await expect(groups).toHaveCount(2)
    for (const group of await groups.all())
      await expect(group.locator('span')).toHaveText(targets.map((target) => target.text))
    await expect(
      frame.getByRole('button', { name: /^(Stroke Order Slay|Stroke Order|Whispering Scrolls)$/ }),
    ).toHaveCount(0)
    await expect(frame.locator('.learning-hub-cohort-heading')).toContainText('8 writing · 8 reading')
  }
  await page.getByText('Parent controls', { exact: true }).click()
  await expect(page.getByRole('note')).toContainText(
    process.env.GRADE5_PRESENTATION_NAME || '10/19 – Fifth Grade Mandarin Ninja Academy',
  )
  if (process.env.GRADE5_PRESENTATION_REVISION)
    await expect(page.getByRole('note')).toContainText(process.env.GRADE5_PRESENTATION_REVISION.slice(0, 7))
  await expect(page.getByRole('option', { name: /Kindergarten|Grade 2/ })).toHaveCount(0)
  await page.getByText('Parent controls', { exact: true }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('grade5-main-menu.png'), fullPage: true })
})

test('Final Boss nests tests, games and training separately with safe back and report controls', async ({
  page,
}, info) => {
  const frame = await open(page, sectionNames[2])
  const activityButtons = frame.locator('.learning-hub-activity-grid button')
  await expect(activityButtons).toHaveText(['Boss Test', 'Boss Games', 'Need more training?'])
  const cards = frame.locator('.learning-hub-group-grid > article')
  const first = (await cards.nth(0).boundingBox())!
  const second = (await cards.nth(1).boundingBox())!
  const training = (await cards.nth(2).boundingBox())!
  expect(training.y).toBeGreaterThanOrEqual(Math.max(first.y + first.height, second.y + second.height))
  await page.screenshot({ path: info.outputPath('grade5-final-boss-nested.png'), fullPage: true })
  const groups: [string, string[]][] = [
    ['Boss Test', ['Writing Test', 'Reading Test']],
    ['Boss Games', ['Shuriken Match', 'Shadow Strike Dojo', 'Memory Lanterns', 'Context Gap Dash', 'Sushi Scramble']],
    ['Need more training?', ['Return to Dojo · Writing', 'Return to Dojo · Reading']],
  ]
  for (const [group, buttons] of groups) {
    await frame.getByRole('button', { name: group, exact: true }).click()
    await expect(activityButtons).toHaveText(buttons)
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await expect(activityButtons).toHaveText(buttons)
    await frame.getByRole('button', { name: '← Back to Final Boss', exact: true }).click()
    await expect(activityButtons).toHaveText(['Boss Test', 'Boss Games', 'Need more training?'])
  }
  await frame.getByRole('button', { name: 'Need more training?', exact: true }).click()
  await frame.getByRole('button', { name: 'Return to Dojo · Reading', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Record my reading', exact: true })).toBeVisible()
  await frame.getByRole('button', { name: 'Exit reading', exact: true }).click()
  await expect(activityButtons).toHaveText(['Return to Dojo · Writing', 'Return to Dojo · Reading'])
  await frame.getByRole('button', { name: '← Back to all challenges', exact: true }).click()
  await frame.getByRole('button', { name: sectionNames[2] }).click()
  await expect(activityButtons).toHaveText(['Boss Test', 'Boss Games', 'Need more training?'])
  expect(await results(page)).toEqual([])
})

for (const [sectionIndex, section] of sectionNames.slice(1).entries()) {
  for (const mode of ['Writing', 'Reading'] as const) {
    test(`${sectionIndex === 0 ? 'Ninja Skills' : 'Final Boss'}: ${mode} collects all eight and saves one reviewed result`, async ({
      page,
    }) => {
      const frame = await open(page, section, `${mode} Test`)
      if (mode === 'Writing') await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
      const collection = frame.locator('.deferred-collection-review')
      for (const [index, target] of targets.entries()) {
        await expect(collection).toHaveAttribute('data-report-position', String(index + 1))
        await expect(frame.getByRole('button', { name: 'Yes', exact: true })).toHaveCount(0)
        if (mode === 'Writing') await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
        else {
          await expect(collection).toContainText(target.text)
          await frame.getByRole('button', { name: 'Record my reading', exact: true }).click()
          await frame.getByRole('button', { name: 'Continue without a recording', exact: true }).click()
        }
      }
      const rows = frame.locator('.deferred-review-row')
      await expect(rows).toHaveCount(8)
      for (const [index, target] of targets.entries()) {
        await expect(rows.nth(index)).toContainText(target.text)
        await rows
          .nth(index)
          .getByRole('button', { name: index % 2 ? 'Not yet' : 'Yes', exact: true })
          .click()
      }
      if (sectionIndex === 0) {
        await frame.locator('body').evaluate(() => {
          const original = Storage.prototype.setItem
          let once = true
          Storage.prototype.setItem = function (key, value) {
            if (once && key.startsWith('family-beta-preview-results-v1:')) {
              once = false
              throw new DOMException('Synthetic final-test storage failure', 'QuotaExceededError')
            }
            return original.call(this, key, value)
          }
        })
        await frame.getByRole('button', { name: 'Submit final review', exact: true }).click()
        await expect(frame.getByRole('alert')).toBeVisible()
        await expect(rows).toHaveCount(8)
        for (let index = 0; index < 8; index++)
          await expect(rows.nth(index)).toHaveClass(index % 2 ? /is-incorrect/ : /is-correct/)
        expect(await results(page)).toEqual([])
      }
      await frame.getByRole('button', { name: 'Submit final review', exact: true }).click()
      await expect(frame.getByRole('button', { name: `${mode} Test`, exact: true })).toBeVisible()
      const saved = await results(page)
      expect(saved).toHaveLength(1)
      expect(saved[0]).toMatchObject({
        grade: 'Grade 5',
        channel: mode.toLowerCase(),
        correct: 4,
        attempted: 8,
        datasetIds: [datasetId],
      })
      await page.reload()
      expect(await results(page)).toEqual(saved)
    })
  }
}

function card(frame: FrameLocator, label: string) {
  return frame.getByRole('button', { name: `${label}. Click to hear and select.`, exact: true })
}

test('Shuriken uses all eight definitions, green same-target retry, repeated input and a saved reviewed score', async ({
  page,
}, info) => {
  const frame = await open(page, sectionNames[1], 'Shuriken Match')
  await expect(frame.locator('.lg-word-seal')).toHaveCount(16)
  for (const target of targets) {
    await expect(card(frame, target.text)).toBeVisible()
    await expect(card(frame, target.meaning)).toBeVisible()
  }
  await card(frame, targets[0].text).click()
  await card(frame, targets[1].meaning).click()
  const hint = card(frame, targets[0].meaning)
  await expect(hint).toHaveClass(/is-correction-hint/)
  await expect(card(frame, targets[1].meaning)).not.toHaveClass(/is-correction-hint/)
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  const timer = await frame.locator('.lg-moon-timer').innerText()
  await page.waitForTimeout(2200)
  await expect(hint).toHaveClass(/is-correction-hint/)
  expect(await frame.locator('.lg-moon-timer').innerText()).toBe(timer)
  await page
    .getByLabel('What did you see or hear?')
    .fill('Synthetic integrated Grade 5 matching check. No child information.')
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  await expect(hint).not.toHaveClass(/is-correction-hint/)
  await expect(hint).toBeEnabled()
  await expect(card(frame, targets[1].text)).toBeDisabled()
  await expect(card(frame, targets[0].text)).toHaveClass(/is-selected/)
  await page.screenshot({ path: info.outputPath('grade5-matching-retry.png'), fullPage: true })
  await card(frame, targets[2].meaning).click()
  await expect(hint).toHaveClass(/is-correction-hint/)
  await expect(hint).toBeEnabled()
  await hint.click()
  await expect(card(frame, targets[0].text)).toHaveClass(/is-matched/)
  await expect(frame.locator('.lg-shuriken-stat-row')).toContainText('33%')
  for (const target of targets.slice(1)) {
    await expect(frame.locator('.lg-shuriken-board')).not.toHaveClass(/is-correct|is-incorrect/)
    await card(frame, target.text).click()
    await card(frame, target.meaning).click()
    await expect(card(frame, target.text)).toHaveClass(/is-matched/)
  }
  await frame.getByRole('button', { name: 'Back to Ninja Skills', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Shuriken Match', exact: true })).toBeVisible()
  expect(await results(page)).toMatchObject([
    { activity: 'Shuriken Match', channel: 'game', correct: 8, attempted: 10, datasetIds: [datasetId] },
  ])
  await open(page, sectionNames[2], 'Shuriken Match')
  await card(frame, targets[1].meaning).click()
  await card(frame, targets[0].text).click()
  await expect(card(frame, targets[1].text)).toHaveClass(/is-correction-hint/)
  await frame.getByRole('button', { name: 'Exit learning module', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Shuriken Match', exact: true })).toBeVisible()
  expect(await results(page)).toHaveLength(1)
})

test('Sushi completes all eight exact reference sentences, retains an error and preserves 是', async ({
  page,
}, info) => {
  const frame = await open(page, sectionNames[1], 'Sushi Scramble')
  const place = (label: string) =>
    frame.getByRole('button', { name: new RegExp(`^Place ${label} in sentence position`) })
  const used = new Set<string>()
  for (let index = 0; index < 8; index++) {
    await expect(frame.getByText(`Sentence ${index + 1} of 8`, { exact: true })).toBeVisible()
    const labels = await frame.getByRole('button', { name: /^Place .+ in sentence position/ }).allTextContents()
    const target = targets.find(
      (target) =>
        !used.has(target.text) &&
        target.tokens.length === labels.length &&
        [...target.tokens].sort().join('|') ===
          labels
            .map((label) => label.trim())
            .sort()
            .join('|'),
    )
    expect(target, `Unexpected tokens for sentence ${index + 1}: ${labels.join('|')}`).toBeDefined()
    if (!target) throw new Error('Unknown reference sentence')
    if (index === 0) {
      for (const token of [...target.tokens].reverse()) await place(token).click()
      await expect(frame.getByText('That order needs another try.')).toBeVisible()
      await expect(frame.getByText('Sentence 1 of 8', { exact: true })).toBeVisible()
    }
    for (const token of target.tokens) await place(token).click()
    await expect(frame.getByText('Perfect order!', { exact: true })).toBeVisible()
    if (target.text === '兴奋的')
      await page.screenshot({ path: info.outputPath('grade5-sushi-source-sentence.png'), fullPage: true })
    used.add(target.text)
  }
  expect([...used].sort()).toEqual(targets.map((target) => target.text).sort())
  await frame.getByRole('button', { name: 'Back to Ninja Skills', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Sushi Scramble', exact: true })).toBeVisible()
  expect(await results(page)).toMatchObject([
    { activity: 'Sushi Scramble', channel: 'game', correct: 8, attempted: 9, datasetIds: [datasetId] },
  ])
  await open(page, sectionNames[2], 'Sushi Scramble')
  await expect(frame.getByText('Sentence 1 of 8', { exact: true })).toBeVisible()
  await frame.getByRole('button', { name: 'Exit learning module', exact: true }).click()
  await expect(frame.getByRole('button', { name: 'Sushi Scramble', exact: true })).toBeVisible()
})

async function draw(page: Page, character: string) {
  const strokes = strokeOrderGuide({ id: 'grade5-presentation-test', text: character }).strokes
  const layout = getStrokeLayout(strokes)
  const pad = frameOf(page).getByRole('region', { name: 'Stroke order teacher' }).locator('svg[role="application"]')
  await pad.scrollIntoViewIfNeeded()
  for (let index = Number(await pad.getAttribute('data-next-stroke')); index < strokes.length; index++) {
    const box = (await pad.boundingBox())!
    const xy = (point: readonly [number, number]) =>
      [
        box.x + ((point[0] * layout.scale + layout.offsetX) * box.width) / 100,
        box.y + ((point[1] * layout.scale + layout.offsetY) * box.height) / 100,
      ] as const
    await page.mouse.move(...xy(strokes[index][0]))
    await page.mouse.down()
    for (const point of strokes[index].slice(1)) await page.mouse.move(...xy(point))
    await page.mouse.up()
    await expect(pad).toHaveAttribute('data-next-stroke', String(index + 1))
  }
}

test('Writing teaches both characters, resumes from either menu after reload, follows native trials and teaches the next word', async ({
  page,
}, info) => {
  test.setTimeout(360000)
  let frame = await open(page, sectionNames[0], 'Learn to Write')
  await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
  const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
  await expect(teacher).toHaveAttribute('data-step', '1')
  const initial = await writingRecords(page)
  expect(initial).toHaveLength(1)
  expect(
    initial[0].writing.lesson.targets.map((target: { text: string; pinyin: string; meaning: string }) => ({
      text: target.text,
      pinyin: target.pinyin,
      meaning: target.meaning,
    })),
  ).toEqual(targets.map(({ text, pinyin, meaning }) => ({ text, pinyin, meaning })))
  for (const [index, character] of [...targets[0].text].entries()) {
    for (let step = 1; step <= 5; step++) {
      await expect(teacher).toHaveAttribute('data-character-index', String(index))
      await expect(teacher).toHaveAttribute('data-step', String(step))
      if (index === 0 && step === 2) {
        await frame.getByRole('button', { name: 'Exit game', exact: true }).click()
        await page.reload()
        frame = await open(page, sectionNames[1], 'Return to Dojo · Writing')
        await expect(teacher).toHaveAttribute('data-step', '2')
        await expect(teacher.locator('svg[role="application"]')).toHaveAttribute('data-next-stroke', '0')
      }
      await draw(page, character)
      await frame.getByRole('button', { name: step === 5 ? 'Compare' : 'Next step', exact: true }).click()
      if (step === 5) await frame.getByRole('button', { name: 'I slayed it', exact: true }).click()
    }
  }
  const skip = frame.getByRole('button', { name: 'Skip Timer', exact: true })
  const right = frame.getByRole('button', { name: 'I got it right', exact: true })
  for (const kind of ['familiar-dt', 'familiar-dt', 'show-copy', 'target']) {
    await expect(skip).toBeEnabled()
    expect((await writingRecords(page))[0].writing.acquisition.flow.prompt.kind).toBe(kind)
    if (kind === 'show-copy')
      await page.screenshot({ path: info.outputPath('grade5-native-writing.png'), fullPage: true })
    await skip.click()
    await right.click()
    await expect(skip.or(teacher)).toBeVisible()
  }
  for (let index = 0; index < 40 && !(await teacher.isVisible()); index++) {
    if (await skip.isVisible()) await skip.click()
    await right.click()
    await expect(skip.or(teacher)).toBeVisible()
  }
  await expect(teacher).toHaveAttribute('data-step', '1')
  await expect(teacher).toHaveAttribute('data-character-index', '0')
  await expect(frame.locator('.lg-vocabulary-main')).toContainText('了解')
  const before = await writingRecords(page)
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
  await page.getByLabel('What did you see or hear?').fill('Synthetic new-word teacher check. No child information.')
  await page.waitForTimeout(8000)
  await expect(frame.locator('.lg-vocabulary-main')).toBeVisible()
  await page.getByRole('button', { name: 'Close and return', exact: true }).click()
  expect(await writingRecords(page)).toEqual(before)
  await frame.getByRole('button', { name: 'Exit game', exact: true }).click()
  await open(page, sectionNames[2], 'Return to Dojo · Writing')
  await expect(frame.locator('.lg-vocabulary-main')).toContainText('了解')
  await expect(teacher).toHaveAttribute('data-step', '1')
  await expect(page.getByRole('heading', { name: 'Your paused work', exact: true })).toBeHidden()
})
