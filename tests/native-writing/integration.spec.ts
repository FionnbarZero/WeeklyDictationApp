import { expect, type FrameLocator, type Page, test } from '@playwright/test'
import { strokeOrderGuide } from '../../src/familyBeta/strokeOrderSlay.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'
import {
  advanceWritingProgress,
  createWritingCommand,
  teachingPosition,
  writingContext,
} from '../../src/application/writingAcquisition/progress.ts'
import { crossGradeLessons } from '../../src/writingAcquisition/crossGradeLessons.ts'
import { openAcquisitionStore } from '../../src/familyBeta/acquisitionStore.ts'
import { nativeWritingAdapter } from '../../src/familyBeta/nativeWritingCheckpoint.ts'

test.beforeEach(async ({ context, baseURL }) => {
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === new URL(baseURL!).origin ? route.continue() : route.abort(),
  )
  await context.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        getVoices() {
          return []
        },
        speak(u: SpeechSynthesisUtterance) {
          u.onstart?.({} as SpeechSynthesisEvent)
          setTimeout(() => u.onend?.({} as SpeechSynthesisEvent), 5)
        },
      },
    })
    HTMLMediaElement.prototype.play = () => Promise.reject(new Error('Synthetic audio'))
  })
})
async function launch(page: Page, slug: string, week = slug === 'kindergarten' ? '2026-10-05' : '2026-09-14') {
  await page.goto(`/family-beta-preview.html?grade=${slug}`)
  await expect(page.getByLabel('Practice week')).toBeVisible()
  if ((await page.getByLabel('Practice week').inputValue()) !== week) {
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByLabel('Practice week').selectOption(week)
    await expect(page.locator('iframe:visible')).toHaveAttribute('data-family-week', week)
  }
  const frame = page.frameLocator('iframe:visible')
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await frame
    .getByRole('button', { name: slug === 'kindergarten' ? 'Writing characters' : 'Learn to Write', exact: true })
    .click()
  if (slug === 'grade5') {
    await expect(
      frame
        .getByRole('button', { name: 'Skip Warmup', exact: true })
        .or(frame.getByRole('region', { name: 'Stroke order teacher' }))
        .or(frame.getByRole('button', { name: 'Skip Timer', exact: true })),
    ).toBeVisible()
    if (await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).isVisible())
      await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
  }
  await expect(frame.locator('.native-writing-integration')).toBeVisible()
  return frame
}
async function saved(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find(
      (key) => key.startsWith('family-beta-acquisition-v1:') && !key.includes(':completed:'),
    )!
    return { key, value: JSON.parse(localStorage.getItem(key)!) }
  })
}
async function draw(page: Page, frame: FrameLocator, character: string) {
  const strokes = strokeOrderGuide({ id: 'native-test', text: character }).strokes,
    layout = getStrokeLayout(strokes)
  const pad = frame.getByRole('region', { name: 'Stroke order teacher' }).locator('svg[role="application"]')
  for (let i = Number(await pad.getAttribute('data-next-stroke')); i < strokes.length; i++) {
    const b = (await pad.boundingBox())!
    const xy = (p: readonly [number, number]) =>
      [
        b.x + ((p[0] * layout.scale + layout.offsetX) * b.width) / 100,
        b.y + ((p[1] * layout.scale + layout.offsetY) * b.height) / 100,
      ] as const
    await page.mouse.move(...xy(strokes[i][0]))
    await page.mouse.down()
    for (const point of strokes[i].slice(1)) await page.mouse.move(...xy(point))
    await page.mouse.up()
    await expect(pad).toHaveAttribute('data-next-stroke', String(i + 1))
  }
}
async function afterTeaching(page: Page, slug: string) {
  await launch(page, slug)
  const record = await saved(page)
  let progress = record.value.writing
  while (teachingPosition(progress))
    progress = advanceWritingProgress(
      progress,
      createWritingCommand({
        kind: 'complete-teaching-step',
        expectedRevision: progress.revision,
        position: teachingPosition(progress)!,
      }),
      progress.updatedAt,
    )
  record.value.writing = progress
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), record)
  return launch(page, slug)
}

for (const slug of ['kindergarten', 'grade5']) {
  test(`${slug}: another tab cannot add answers to a completed visit`, async ({ page, context }) => {
    const frame = await afterTeaching(page, slug)
    for (let i = 0; i < 4; i++) {
      await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
      await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
      await expect(frame.getByRole('button', { name: 'Skip Timer', exact: true })).toBeVisible()
    }
    const other = await context.newPage()
    const otherFrame = await launch(other, slug)
    const before = await saved(page)
    await page.bringToFront()
    await frame.getByRole('button', { name: 'Done for today', exact: true }).click()
    await page.getByRole('button', { name: 'Progress', exact: true }).click()
    await expect(page.getByRole('cell', { name: '1 / 1', exact: true })).toBeVisible()
    await other.bringToFront()
    await otherFrame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
    await otherFrame.getByRole('button', { name: 'I got it right', exact: true }).click()
    await expect(otherFrame.getByRole('alert')).toContainText('already being saved or is complete')
    expect(await saved(other)).toEqual(before)
    await other.close()
  })
  test(`${slug}: report pauses teacher clue and input without saving a trial`, async ({ page }) => {
    await page.clock.install()
    const frame = await launch(page, slug)
    const before = await saved(page)
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click()
    await page.clock.fastForward(9000)
    await expect(frame.getByRole('button', { name: 'Next step', exact: true })).toBeDisabled()
    await expect(frame.locator('.lg-vocabulary-main')).toBeVisible()
    expect(await saved(page)).toEqual(before)
    await page.getByRole('button', { name: 'Close and return', exact: true }).click()
    await page.clock.fastForward(8000)
    await expect(frame.locator('.lg-vocabulary-main')).toBeHidden()
    expect(await saved(page)).toEqual(before)
  })
  test(`${slug}: actual family teacher, every character, native acquisition, next teacher, reload`, async ({
    page,
  }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let frame = await launch(page, slug)
    const record = await saved(page),
      word = record.value.writing.lesson.targets[0].text
    const approved = crossGradeLessons(slug === 'kindergarten' ? 'Kindergarten' : 'Grade 5')
      .flatMap((lesson) => lesson.targets)
      .find((target) => target.text === word)!
    expect(record.value.writing.lesson.targets[0]).toMatchObject({
      pinyin: approved.pinyin,
      meaning: approved.meaning,
      guideFingerprint: approved.guideFingerprint,
    })
    for (const [index, character] of [...word].entries())
      for (let step = 1; step <= 5; step++) {
        const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
        await expect(teacher).toHaveAttribute('data-character-index', String(index))
        await expect(teacher).toHaveAttribute('data-step', String(step))
        await draw(page, frame, character as string)
        await frame.getByRole('button', { name: step === 5 ? 'Compare' : 'Next step', exact: true }).click()
        if (step === 5) await frame.getByRole('button', { name: 'I slayed it', exact: true }).click()
        if (index === 0 && step === 1) {
          frame = await launch(page, slug)
          await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '2')
          await expect(frame.locator('svg[role="application"]')).toHaveAttribute('data-next-stroke', '0')
        }
      }
    await expect(frame.locator('.slay-writing-integration')).toBeVisible()
    for (const kind of ['familiar-dt', 'familiar-dt', 'show-copy', 'target']) {
      expect((await saved(page)).value.envelope.flow.prompt.kind).toBe(kind)
      if (kind === 'show-copy')
        await page.screenshot({ path: info.outputPath('native-acquisition.png'), fullPage: true })
      await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
      await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
      await expect(frame.getByRole('button', { name: 'Skip Timer', exact: true })).toBeVisible()
    }
    for (let i = 0; (await saved(page)).value.envelope.flow.targetIndex === 0 && i < 35; i++) {
      const skip = frame.getByRole('button', { name: 'Skip Timer', exact: true })
      const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
      await expect(skip.or(teacher)).toBeVisible()
      if (await teacher.isVisible()) break
      await skip.click()
      await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
    }
    await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '1')
    const before = await saved(page)
    frame = await launch(page, slug)
    await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '1')
    expect(await saved(page)).toEqual(before)
    expect(errors).toEqual([])
  })

  for (const action of ['Done for today', 'Exit game'])
    test(`${slug}: ${action} retains native score/visit semantics and usable tablet controls`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: 768, height: 1024 })
      const frame = await afterTeaching(page, slug)
      for (let i = 0; i < 4; i++) {
        await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
        await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
        await expect(frame.getByRole('button', { name: 'Skip Timer', exact: true })).toBeVisible()
      }
      for (const name of ['Hear', 'Skip Timer', 'Done for today', 'Exit game']) {
        const b = (await frame.getByRole('button', { name, exact: true }).boundingBox())!
        expect(b.x).toBeGreaterThanOrEqual(0)
        expect(b.y).toBeGreaterThanOrEqual(0)
        expect(b.x + b.width).toBeLessThanOrEqual(769)
        expect(b.y + b.height).toBeLessThanOrEqual(1025)
      }
      const before = await saved(page)
      expect(
        before.value.assessments.filter((a: { countsTowardWeeklyScore: boolean }) => a.countsTowardWeeklyScore),
      ).toHaveLength(1)
      await page.screenshot({ path: info.outputPath('native-portrait.png'), fullPage: true })
      await frame.getByRole('button', { name: action, exact: true }).click()
      await page.getByRole('button', { name: 'Progress', exact: true }).click()
      if (action === 'Done for today')
        await expect(page.getByRole('cell', { name: '1 / 1', exact: true })).toBeVisible()
      else await expect(page.getByRole('cell', { name: '1 / 1', exact: true })).toHaveCount(0)
      await launch(page, slug)
      const next = (await saved(page)).value
      expect(next.envelope).toEqual(before.value.envelope)
      expect(next.writing).toEqual(before.value.writing)
      expect(next.reviewedTrials).toEqual(before.value.reviewedTrials)
      expect(next.assessments).toHaveLength(action === 'Done for today' ? 0 : before.value.assessments.length)
    })
}

test('Grade 5 native four-character portrait uses approved large two-by-two boxes', async ({ page }, info) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  const lesson = crossGradeLessons('Grade 5').find((lesson) =>
    lesson.targets.some((target) => target.text === '各种各样'),
  )!
  await launch(page, 'grade5', lesson.dataset.startDate)
  const record = await saved(page)
  let raw = JSON.stringify(record.value)
  const store = openAcquisitionStore(
    {
      getItem: (key) => (key === record.key ? raw : null),
      setItem: (_key, value) => {
        raw = value
      },
    },
    writingContext(record.value.writing.lesson, record.value.writing.owner, record.value.envelope),
    { writing: nativeWritingAdapter(lesson.dataset), random: () => 0.25 },
  )
  for (let i = 0; i < 500; i++) {
    const progress = store.current.writing!,
      position = teachingPosition(progress),
      prompt = store.current.envelope.flow.prompt!
    if (!position && prompt.kind === 'show-copy' && prompt.word.text === '各种各样') break
    if (position)
      store.completeTeachingStep(
        createWritingCommand({ kind: 'complete-teaching-step', expectedRevision: progress.revision, position }),
      )
    else store.answer(true, 'skip_timer')
  }
  expect(store.current.envelope.flow.prompt?.word.text).toBe('各种各样')
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: record.key, value: raw })
  const frame = await launch(page, 'grade5', lesson.dataset.startDate)
  const boxes = frame.locator('.skywriting-scroll-cell')
  await expect(boxes).toHaveCount(4)
  const bounds = []
  for (const box of await boxes.all()) {
    const b = (await box.boundingBox())!
    bounds.push(b)
    expect(b.width).toBeGreaterThan(200)
    expect(b.height).toBeGreaterThan(200)
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.x + b.width).toBeLessThanOrEqual(769)
    expect(b.y + b.height).toBeLessThanOrEqual(1025)
  }
  expect(Math.abs(bounds[0].y - bounds[1].y)).toBeLessThan(2)
  expect(bounds[2].y).toBeGreaterThan(bounds[0].y + 200)
  await page.screenshot({ path: info.outputPath('native-four-character-portrait.png'), fullPage: true })
})
