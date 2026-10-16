// Explicit opt-in acceptance against a retained local build or the canonical
// release and real Firebase. Exact served bytes are checked before signup.
// Uses only a new, uniquely named disposable family; never an owner's session.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, expect, type FrameLocator, type Page } from '@playwright/test'
import type { WritingProgress } from '../src/application/writingAcquisition/contracts.ts'
import { strokeOrderGuide } from '../src/familyBeta/strokeOrderSlay.ts'
import { getStrokeLayout } from '../src/strokeTeacherPrototype/original/strokeLayout.ts'
import { cleanSyntheticWritingFamily, syntheticWritingScope } from './syntheticWritingScope.ts'

assert.equal(process.env.WRITING_CLOUD_ACCEPTANCE, '1', 'Explicit synthetic cloud acceptance opt-in required')
const base = process.env.WRITING_CLOUD_ORIGIN || 'http://127.0.0.1:5198'
assert.ok(['http://127.0.0.1:5198', 'https://ninjadojo.meghangames.com'].includes(base))
if (base !== 'http://127.0.0.1:5198') {
  assert.ok(
    process.env.WRITING_CLOUD_REVISION && process.env.WRITING_CLOUD_TREE,
    'Canonical acceptance requires the exact explicit release revision and tree',
  )
}
const revision = process.env.WRITING_CLOUD_REVISION || '5d19f9588aee419fc06b719eb240c9205f9a2394'
const tree = process.env.WRITING_CLOUD_TREE || '887827259ef05352397921a3023020b2edc8f6dbf2baffa967a37eb6e997dd83'
assert.match(revision, /^[a-f0-9]{40}$/)
assert.match(tree, /^[a-f0-9]{64}$/)
const slug = process.env.WRITING_CLOUD_GRADE || 'grade2'
assert.ok(['kindergarten', 'grade2', 'grade5'].includes(slug))
const native = slug !== 'grade2'
const grade = slug === 'kindergarten' ? 'Kindergarten' : slug === 'grade5' ? 'Grade 5' : 'Grade 2'
const currentLesson = process.env.WRITING_CLOUD_CURRENT_LESSON === '1'
const week = currentLesson
  ? slug === 'kindergarten'
    ? '2026-10-12'
    : slug === 'grade5'
      ? '2026-10-05'
      : '2026-10-13'
  : slug === 'kindergarten'
    ? '2026-10-05'
    : slug === 'grade5'
      ? '2026-09-14'
      : '2026-09-29'
const manifest = await fetch(`${base}/family-beta-manifest.json`).then((response) => response.json())
assert.equal(manifest.sourceRevision, revision)
assert.equal(manifest.fileTreeSha256, tree)
assert.equal(manifest.firebaseProject, 'weeklydictationapp')
let verifiedFiles = 0
for (const file of manifest.files as { path: string; sha256: string }[]) {
  if (file.path === '_headers' || file.path.startsWith('.')) continue
  assert.ok(!file.path.includes('..') && !file.path.startsWith('/'))
  const response = await fetch(`${base}/${file.path}`, { signal: AbortSignal.timeout(10_000) })
  assert.equal(response.status, 200)
  assert.equal(new URL(response.url).origin, base)
  assert.equal(
    createHash('sha256')
      .update(Buffer.from(await response.arrayBuffer()))
      .digest('hex'),
    file.sha256,
  )
  verifiedFiles++
}
const email = `ninja-writing-${randomUUID()}@example.invalid`
const password = `T7!${randomUUID()}zQ`
const require = createRequire(import.meta.url)
const auth = require('firebase-tools/lib/auth.js')
const account = auth.getGlobalDefaultAccount()
assert.ok(account?.tokens?.refresh_token, 'Scoped synthetic cleanup requires existing CLI authorization')
const access = await auth.getAccessToken(account.tokens.refresh_token, [
  'https://www.googleapis.com/auth/cloud-platform',
])
assert.ok(access.access_token, 'Cleanup authorization unavailable')
const adminRequest: typeof fetch = (url, options) =>
  fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${access.access_token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
const probe = await adminRequest(
  `https://firestore.googleapis.com/v1/projects/weeklydictationapp/databases/(default)/documents/users/ninja-writing-preflight-${randomUUID()}`,
)
assert.equal(probe.status, 404, 'Cleanup access preflight failed; no account created')
console.log(
  `Exact candidate verified at ${base} (${verifiedFiles} public files); disposable-family cleanup access confirmed.`,
)

const receipt = join(mkdtempSync(join(tmpdir(), 'ninja-writing-cloud-')), 'receipt.json')
let acceptancePassed = false
const record = (cleanupComplete: boolean, deletedTestDocuments?: number) =>
  writeFileSync(
    receipt,
    JSON.stringify(
      {
        sourceRevision: revision,
        origin: base,
        fileTreeSha256: tree,
        grade,
        currentLesson,
        week,
        email,
        syntheticUid: scope?.uid,
        acceptancePassed,
        cleanupComplete,
        deletedTestDocuments,
        realFamilyRecordsTouched: false,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  )

let scope: ReturnType<typeof syntheticWritingScope> | undefined
let idToken = '',
  apiKey = '',
  childId = ''
let settleIdentity!: () => void
const identityReady = new Promise<void>((resolve) => {
  settleIdentity = resolve
})
const browser = await chromium.launch()
const errors: string[] = []

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } })
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
          setTimeout(() => {
            u.onstart?.({} as SpeechSynthesisEvent)
            u.onend?.({} as SpeechSynthesisEvent)
          }, 0)
        },
      },
    })
    HTMLMediaElement.prototype.play = () => Promise.reject(new Error('Synthetic speech only'))
  })
  // Fail closed before any browser request could access an unrelated family.
  await context.route('https://firestore.googleapis.com/**', async (route) => {
    if (!scope) await Promise.race([identityReady, new Promise<void>((resolve) => setTimeout(resolve, 10_000))])
    if (!scope) return route.abort('blockedbyclient')
    try {
      const url = new URL(route.request().url())
      assert.ok(url.pathname.startsWith('/v1/projects/weeklydictationapp/databases/(default)/documents'))
      const path = decodeURIComponent(url.pathname.slice('/v1/'.length))
      if (path.endsWith('/documents:commit')) {
        const body = route.request().postDataJSON()
        assert.ok(Array.isArray(body.writes) && body.writes.length <= 100)
        for (const write of body.writes) scope.validate(write.update?.name || write.delete || write.transform?.document)
      } else if (path.endsWith('/documents:batchGet')) {
        const body = route.request().postDataJSON()
        assert.ok(Array.isArray(body.documents) && body.documents.length <= 100)
        for (const name of body.documents) scope.validate(name)
      } else scope.validate(path.replace(/:runQuery$/, ''))
      await route.continue()
    } catch {
      errors.push('A browser Firestore request exceeded the synthetic family scope')
      await route.abort('blockedbyclient')
    }
  })
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)
  page.on('dialog', (dialog) => dialog.accept())
  page.on('pageerror', () => errors.push('Uncaught browser error'))
  return { context, page }
}

async function login(page: Page) {
  await page.goto(`${base}/family-beta-preview.html?grade=${slug}`)
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByLabel('Child profile')).toContainText('Synthetic Writing')
}
async function launch(page: Page) {
  const frame = page.frameLocator('iframe:visible')
  await expect(frame.getByRole('heading', { name: /^(Kindergarten|Grade 2|Grade 5)$/ })).toBeVisible()
  if (currentLesson) {
    // Ordinary entry, not a historical-week override masking a launch defect.
    await expect(page.getByLabel('Practice week')).toHaveValue('')
    await expect(page.locator('iframe:visible')).toHaveAttribute('data-family-week', week)
  } else if ((await page.getByLabel('Practice week').inputValue()) !== week) {
    await page.getByLabel('Practice week').selectOption(week)
    await expect(page.locator('iframe:visible')).toHaveAttribute('data-family-week', week)
  }
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await frame
    .getByRole('button', { name: slug === 'kindergarten' ? 'Writing characters' : 'Learn to Write', exact: true })
    .click()
  const skipWarmup = frame.getByRole('button', { name: 'Skip Warmup', exact: true })
  // A saved acquisition can resume directly; do not invent another Warmup.
  await expect(
    skipWarmup
      .or(frame.getByRole('region', { name: 'Stroke order teacher' }))
      .or(frame.getByRole('button', { name: 'Skip Timer', exact: true })),
  ).toBeVisible()
  if (await skipWarmup.isVisible()) await skipWarmup.click()
  return frame
}
type Checkpoint = {
  progress: WritingProgress
  acquisition: WritingProgress['acquisition']
}
async function localCheckpoint(page: Page): Promise<Checkpoint | null> {
  if (native)
    return page.evaluate((id) => {
      for (const [key, raw] of Object.entries(localStorage)) {
        if (!key.startsWith('family-beta-acquisition-v1:') || key.includes(':completed:')) continue
        const record = JSON.parse(raw)
        if (record.schema === 2 && record.envelope?.childId === id)
          return { progress: record.writing, acquisition: record.envelope }
      }
      return null
    }, childId)
  return page.evaluate((id) => {
    const raw = localStorage.getItem(`family-beta-activity:${id}:lesson-workspace-v1`)
    if (!raw) return null
    for (const [key, text] of Object.entries(JSON.parse(raw).records) as [string, string][]) {
      if (!key.startsWith('weekly-dictation-checkpoint-v1:activity:')) continue
      const values = JSON.parse(text).values
      if (values?.writingAcquisitionProgress?.length)
        return {
          progress: values.writingAcquisitionProgress[0],
          acquisition: values.acquisitionProgressEnvelopes[0],
        }
    }
    return null
  }, childId)
}
async function remoteCheckpoint(): Promise<Checkpoint | null> {
  assert.ok(scope && childId)
  const response = await adminRequest(`${scope.url(`${scope.family}/children/${childId}/betaPractice`)}?pageSize=100`)
  assert.ok(response.ok, `Synthetic checkpoint read failed (${response.status})`)
  const body = await response.json()
  assert.ok(!body.nextPageToken)
  for (const document of body.documents || []) {
    scope.validate(document.name)
    const key = document.fields?.key?.stringValue || ''
    if (native) {
      if (!key.startsWith('family-beta-acquisition-v1:') || key.includes(':completed:')) continue
      const saved = JSON.parse(document.fields?.payload?.stringValue || 'null')
      if (saved?.schema === 2 && saved.envelope?.childId === childId)
        return { progress: saved.writing, acquisition: saved.envelope }
      continue
    }
    if (!decodeURIComponent(key).includes(':record:weekly-dictation-checkpoint-v1:activity:')) continue
    const raw = document.fields?.payload?.stringValue
    if (!raw) continue
    const values = JSON.parse(raw).values
    if (values?.writingAcquisitionProgress?.length)
      return {
        progress: values.writingAcquisitionProgress[0],
        acquisition: values.acquisitionProgressEnvelopes[0],
      }
  }
  return null
}
async function synced(page: Page, expectedRevision: number) {
  await expect
    .poll(async () => (await remoteCheckpoint())?.progress.revision, { timeout: 45_000 })
    .toBe(expectedRevision)
  assert.deepEqual(await remoteCheckpoint(), await localCheckpoint(page))
}
async function remoteResults() {
  assert.ok(scope && childId)
  const parent = `${scope.family}/children/${childId}/betaResults`
  const response = await adminRequest(`${scope.url(parent)}?pageSize=100`)
  assert.ok(response.ok, `Synthetic result read failed (${response.status})`)
  const body = await response.json()
  assert.ok(!body.nextPageToken)
  return (body.documents || []).map((document: { name: string; fields: Record<string, unknown> }) => {
    scope!.validate(document.name)
    assert.ok(document.name.startsWith(`${parent}/`))
    return document.fields
  }) as Record<string, { stringValue?: string; integerValue?: string }>[]
}
async function finishTrial(page: Page, frame: FrameLocator, character: string, step: number) {
  const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
  await expect(teacher).toHaveAttribute('data-step', String(step))
  await expect(teacher.locator('.lg-round-label')).toContainText(`Step ${step} of 5`)
  const strokes = strokeOrderGuide({ id: 'cloud-acceptance-guide', text: character }).strokes
  const layout = getStrokeLayout(strokes)
  const pad = teacher.locator('svg[role="application"]')
  await pad.scrollIntoViewIfNeeded()
  for (let index = Number(await pad.getAttribute('data-next-stroke')); index < strokes.length; index++) {
    const bounds = (await pad.boundingBox())!
    const xy = (point: readonly [number, number]) =>
      [
        bounds.x + ((point[0] * layout.scale + layout.offsetX) * bounds.width) / 100,
        bounds.y + ((point[1] * layout.scale + layout.offsetY) * bounds.height) / 100,
      ] as const
    await page.mouse.move(...xy(strokes[index][0]))
    await page.mouse.down()
    for (const point of strokes[index].slice(1)) await page.mouse.move(...xy(point))
    await page.mouse.up()
    await expect(pad).toHaveAttribute('data-next-stroke', String(index + 1))
  }
  await frame.getByRole('button', { name: step === 5 ? 'Compare' : 'Next step', exact: true }).click()
  if (step === 5) await frame.getByRole('button', { name: 'I slayed it', exact: true }).click()
}

async function acceptNative(first: Awaited<ReturnType<typeof newPage>>) {
  let frame = await launch(first.page)
  await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '1')
  const word = (await localCheckpoint(first.page))!.progress.lesson.targets[0].text
  const characters = [...word]
  await finishTrial(first.page, frame, characters[0], 1)
  await synced(first.page, 1)
  assert.equal((await remoteCheckpoint())!.acquisition.revision, 0)
  assert.equal((await remoteResults()).length, 0)
  await first.context.close()
  const second = await newPage()
  await login(second.page)
  frame = await launch(second.page)
  await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '2')
  await expect(frame.locator('svg[role="application"]')).toHaveAttribute('data-next-stroke', '0')
  await finishTrial(second.page, frame, characters[0], 2)
  await synced(second.page, 2)
  await second.context.setOffline(true)
  await finishTrial(second.page, frame, characters[0], 3)
  await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '4')
  assert.equal((await localCheckpoint(second.page))!.progress.revision, 3)
  assert.equal((await remoteCheckpoint())!.progress.revision, 2)
  await second.context.setOffline(false)
  await second.page.reload()
  frame = await launch(second.page)
  await synced(second.page, 3)
  for (let index = 0; index < characters.length; index++)
    for (let step = index === 0 ? 4 : 1; step <= 5; step++) {
      await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute(
        'data-character-index',
        String(index),
      )
      await finishTrial(second.page, frame, characters[index], step)
    }
  await expect(frame.locator('.slay-writing-integration')).toBeVisible()
  let revision = characters.length * 5
  await synced(second.page, revision)
  assert.equal((await remoteCheckpoint())!.acquisition.revision, 0)
  assert.equal((await remoteResults()).length, 0)
  const review = async (page: Page, current: FrameLocator) => {
    const skip = current.getByRole('button', { name: 'Skip Timer', exact: true })
    const right = current.getByRole('button', { name: 'I got it right', exact: true })
    await expect(skip.or(right)).toBeVisible()
    if (await skip.isVisible()) await skip.click()
    await right.click()
    await synced(page, ++revision)
  }
  for (const kind of ['familiar-dt', 'familiar-dt', 'show-copy', 'target']) {
    assert.equal((await localCheckpoint(second.page))!.acquisition.flow.prompt?.kind, kind)
    await review(second.page, frame)
  }
  await frame.getByRole('button', { name: 'Done for today', exact: true }).click()
  await expect(frame.locator('.native-writing-integration')).toBeHidden()
  await expect.poll(async () => (await remoteResults()).length, { timeout: 45_000 }).toBe(1)
  const results = await remoteResults()
  assert.equal(Number(results[0].correct.integerValue), 1)
  assert.equal(Number(results[0].attempted.integerValue), 1)
  await second.context.close()
  const third = await newPage()
  await login(third.page)
  frame = await launch(third.page)
  await synced(third.page, revision)
  assert.deepEqual(await remoteResults(), results)
  const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
  for (let i = 0; i < 35 && !(await teacher.isVisible()); i++) await review(third.page, frame)
  await expect(teacher).toHaveAttribute('data-step', '1')
  assert.equal((await localCheckpoint(third.page))!.acquisition.flow.targetIndex, 1)
  await third.context.close()
  const fourth = await newPage()
  await login(fourth.page)
  frame = await launch(fourth.page)
  await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '1')
  await synced(fourth.page, revision)
  assert.deepEqual(await remoteResults(), results)
  console.log(
    `${grade}: real-cloud teacher, offline/reconnect, all characters, native flow, Done, fresh-browser result and next-word teaching passed.`,
  )
}

async function acceptCurrentLesson(first: Awaited<ReturnType<typeof newPage>>) {
  let frame = await launch(first.page)
  const expected = slug === 'kindergarten' ? '土' : slug === 'grade5' ? '盐' : '走'
  const firstCheckpoint = (await localCheckpoint(first.page))!
  assert.equal(firstCheckpoint.progress.lesson.targets[0].text, expected)
  const characters = [...expected]
  await finishTrial(first.page, frame, characters[0], 1)
  await synced(first.page, 1)
  assert.equal((await remoteResults()).length, 0)
  await first.context.close()

  const second = await newPage()
  await login(second.page)
  frame = await launch(second.page)
  await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '2')
  await expect(frame.locator('svg[role="application"]')).toHaveAttribute('data-next-stroke', '0')
  await finishTrial(second.page, frame, characters[0], 2)
  await synced(second.page, 2)
  await expect(second.page.locator('[data-offline-shell-status]')).toContainText('Offline app ready')
  await second.context.setOffline(true)
  await finishTrial(second.page, frame, characters[0], 3)
  await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '4')
  const offlineCheckpoint = await localCheckpoint(second.page)
  assert.equal(offlineCheckpoint!.progress.revision, 3)
  assert.equal((await remoteCheckpoint())!.progress.revision, 2)
  // Reopen the entire installed app offline; do not use Saved lessons or
  // leave a reachable local shell while only intercepting curriculum errors.
  await second.page.reload()
  frame = await launch(second.page)
  await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '4')
  assert.deepEqual(await localCheckpoint(second.page), offlineCheckpoint)
  assert.equal((await remoteCheckpoint())!.progress.revision, 2)
  await second.context.setOffline(false)
  await synced(second.page, 3)
  for (let index = 0; index < characters.length; index++)
    for (let step = index === 0 ? 4 : 1; step <= 5; step++)
      await finishTrial(second.page, frame, characters[index], step)
  await expect(frame.locator('.slay-writing-integration')).toBeVisible()
  let revision = characters.length * 5
  await synced(second.page, revision)
  assert.equal((await remoteCheckpoint())!.acquisition.revision, 0)
  assert.equal((await remoteResults()).length, 0)
  const acquisition = await remoteCheckpoint()
  await second.context.close()

  const third = await newPage()
  await login(third.page)
  frame = await launch(third.page)
  assert.deepEqual(await localCheckpoint(third.page), acquisition)
  await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toBeHidden()
  const review = async (page: Page, current: FrameLocator) => {
    const skip = current.getByRole('button', { name: 'Skip Timer', exact: true })
    const right = current.getByRole('button', { name: 'I got it right', exact: true })
    await expect(skip.or(right)).toBeVisible()
    if (await skip.isVisible()) await skip.click()
    await right.click()
    await synced(page, ++revision)
  }
  for (const kind of native ? ['familiar-dt', 'familiar-dt', 'show-copy', 'target'] : ['show-copy', 'target']) {
    assert.equal((await localCheckpoint(third.page))!.acquisition.flow.prompt?.kind, kind)
    await review(third.page, frame)
  }
  await frame.getByRole('button', { name: 'Done for today', exact: true }).click()
  await expect.poll(async () => (await remoteResults()).length, { timeout: 45_000 }).toBe(1)
  const results = await remoteResults()
  assert.equal(Number(results[0].correct.integerValue), 1)
  assert.equal(Number(results[0].attempted.integerValue), 1)
  await third.context.close()

  const fourth = await newPage()
  await login(fourth.page)
  frame = await launch(fourth.page)
  await synced(fourth.page, revision)
  assert.deepEqual(await remoteResults(), results)
  const downloadedResult = async (page: Page) => {
    const id = results[0].id.stringValue!
    assert.ok(id)
    await expect
      .poll(() =>
        page.evaluate((id) => {
          const raw = localStorage.getItem(`family-beta-preview-results-v1:${id}`)
          if (!raw) return null
          const result = JSON.parse(raw)
          return { id: result.id, childId: result.childId, correct: result.correct, attempted: result.attempted }
        }, id),
      )
      .toEqual({ id, childId, correct: 1, attempted: 1 })
  }
  await downloadedResult(fourth.page)
  const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
  for (let trial = 0; trial < 35 && !(await teacher.isVisible()); trial++) await review(fourth.page, frame)
  await expect(teacher).toHaveAttribute('data-step', '1')
  assert.equal((await localCheckpoint(fourth.page))!.acquisition.flow.targetIndex, 1)
  const next = await remoteCheckpoint()
  await fourth.context.close()
  const fifth = await newPage()
  await login(fifth.page)
  frame = await launch(fifth.page)
  await expect(frame.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '1')
  assert.deepEqual(await localCheckpoint(fifth.page), next)
  assert.deepEqual(await remoteResults(), results)
  await downloadedResult(fifth.page)
  console.log(
    `${grade}: ordinary current entry, real-cloud resume, full offline reload, acquisition and next-word recovery passed.`,
  )
}

try {
  const first = await newPage()
  await first.page.goto(`${base}/family-beta-preview.html?grade=${slug}`)
  await first.page.getByRole('button', { name: 'Create account', exact: true }).click()
  await first.page.getByLabel('Email', { exact: true }).fill(email)
  await first.page.getByLabel('Password', { exact: true }).fill(password)
  const signup = first.page.waitForResponse((response) => response.url().includes('/accounts:signUp?'))
  const submitted = first.page.getByRole('button', { name: 'Create account', exact: true }).click()
  const response = await signup
  assert.ok(response.ok(), `Synthetic signup failed (${response.status()})`)
  const identity = await response.json()
  scope = syntheticWritingScope(identity.localId, identity.email, email)
  idToken = identity.idToken
  apiKey = new URL(response.url()).searchParams.get('key') || ''
  record(false)
  console.log(`Synthetic-only recovery receipt: ${receipt}`)
  settleIdentity()
  await submitted
  console.log('New disposable parent created; browser cloud access restricted to its family.')
  await expect(first.page.getByText('Family account connected.', { exact: true })).toBeVisible()
  await expect(first.page.getByText(`Beta build ${revision.slice(0, 7)}`)).toBeVisible()
  await first.page.getByRole('button', { name: 'Parent controls', exact: true }).click()
  await first.page.getByLabel('Confirm parent password').fill(password)
  await first.page.getByRole('button', { name: 'Unlock profile changes' }).click()
  await first.page.getByLabel('Child’s name', { exact: true }).fill('Synthetic Writing')
  await first.page.getByRole('combobox', { name: 'Grade', exact: true }).selectOption(grade)
  await first.page.getByRole('button', { name: 'Add child', exact: true }).click()
  await expect(first.page.getByLabel('Child profile')).toContainText('Synthetic Writing')
  childId = await first.page.getByLabel('Child profile').inputValue()
  assert.match(childId, /^[A-Za-z0-9_-]+$/)
  await first.page.getByRole('button', { name: 'Activities', exact: true }).click()
  if (currentLesson) await acceptCurrentLesson(first)
  else if (native) await acceptNative(first)
  else {
    const firstFrame = await launch(first.page)
    await finishTrial(first.page, firstFrame, '英', 1)
    await synced(first.page, 1)
    assert.equal((await remoteCheckpoint())!.acquisition.revision, 0)
    assert.equal((await remoteCheckpoint())!.progress.lesson.policy, 'grade2-trace-independent-preview-v7')
    await first.context.close()
    console.log('First teaching step confirmed in real cloud; no acquisition answer fabricated.')

    const second = await newPage()
    await login(second.page)
    let frame = await launch(second.page)
    const teacher = () => frame.getByRole('region', { name: 'Stroke order teacher' })
    await expect(teacher()).toHaveAttribute('data-step', '2')
    await expect(teacher().locator('svg[role="application"]')).toHaveAttribute('data-next-stroke', '0')
    await finishTrial(second.page, frame, '英', 2)
    await synced(second.page, 2)
    await second.context.setOffline(true)
    await finishTrial(second.page, frame, '英', 3)
    await expect(teacher()).toHaveAttribute('data-step', '4')
    assert.equal((await localCheckpoint(second.page))!.progress.revision, 3)
    assert.equal((await remoteCheckpoint())!.progress.revision, 2)
    await second.context.setOffline(false)
    await second.page.reload()
    frame = await launch(second.page)
    await expect(teacher()).toHaveAttribute('data-step', '4')
    await expect(teacher().locator('.teacher-supplied-stroke')).toHaveCount(2)
    await synced(second.page, 3)
    console.log('Fresh-browser resume and offline teaching/reconnect confirmed against real cloud.')
    for (const step of [4, 5]) await finishTrial(second.page, frame, '英', step)
    await expect(teacher()).toHaveAttribute('data-character-index', '1')
    await synced(second.page, 5)
    assert.equal((await remoteCheckpoint())!.acquisition.revision, 0)
    for (const step of [1, 2, 3, 4, 5]) await finishTrial(second.page, frame, '雄', step)
    await expect(teacher()).toHaveCount(0)
    await synced(second.page, 10)
    assert.equal((await remoteCheckpoint())!.acquisition.revision, 0)
    await expect(frame.locator('.slay-writing-integration')).toBeVisible()
    await expect(frame.locator('.skywriting-trace-character')).toHaveCount(2)
    await expect(frame.getByRole('timer')).toHaveText(/^00:(?:0[1-9]|1\d|2[0-5])$/)
    assert.equal((await remoteCheckpoint())!.acquisition.flow.prompt?.kind, 'show-copy')
    await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
    await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
    await synced(second.page, 11)
    assert.equal((await remoteCheckpoint())!.acquisition.revision, 1)
    assert.equal((await remoteCheckpoint())!.progress.assessments.filter((a) => a.countsTowardWeeklyScore).length, 0)
    const saved = await remoteCheckpoint()
    await second.context.close()
    console.log('Both characters completed before Slay acquisition; unscored trace saved atomically.')
    const third = await newPage()
    await login(third.page)
    const resumed = await launch(third.page)
    await expect(resumed.getByRole('region', { name: 'Stroke order teacher' })).toHaveCount(0)
    await expect(resumed.getByRole('button', { name: 'Skip Timer', exact: true })).toBeVisible()
    await expect(resumed.locator('.skywriting-trace-character')).toHaveCount(0)
    await expect(resumed.getByRole('timer')).toHaveText(/^00:(?:0[1-9]|1\d|2[0-5])$/)
    assert.equal(saved!.acquisition.flow.prompt?.kind, 'target')
    assert.deepEqual(await localCheckpoint(third.page), saved)
    await resumed.getByRole('button', { name: 'Skip Timer', exact: true }).click()
    await resumed.getByRole('button', { name: 'I got it right', exact: true }).click()
    await expect(resumed.locator('.set-chip')).toContainText('Familiar DT')
    await expect(resumed.getByRole('timer')).toHaveText(/^00:(?:0[1-9]|10)$/)
    await synced(third.page, 12)
    assert.equal((await remoteCheckpoint())!.progress.assessments.filter((a) => a.countsTowardWeeklyScore).length, 1)
    await resumed.getByRole('button', { name: 'Done for today', exact: true }).click()
    await expect(resumed.getByRole('heading', { name: /^(Kindergarten|Grade 2|Grade 5)$/ })).toBeVisible()
    await expect.poll(async () => (await remoteResults()).length, { timeout: 45_000 }).toBe(1)
    const results = await remoteResults()
    assert.equal(results[0].channel.stringValue, 'writing')
    assert.equal(Number(results[0].correct.integerValue), 1)
    assert.equal(Number(results[0].attempted.integerValue), 1)
    await third.context.close()
    console.log('One independent response then Familiar DT confirmed; Done saved one real-cloud result.')

    const fourth = await newPage()
    await login(fourth.page)
    const continued = await launch(fourth.page)
    await expect(continued.locator('.set-chip')).toContainText('Familiar DT')
    await synced(fourth.page, 12)
    assert.deepEqual(await remoteResults(), results)
    await expect
      .poll(() =>
        fourth.page.evaluate(
          () => Object.keys(localStorage).filter((key) => key.startsWith('family-beta-preview-results-v1:')).length,
        ),
      )
      .toBe(1)
    const nextTeacher = continued.getByRole('region', { name: 'Stroke order teacher' })
    const skipTimer = continued.getByRole('button', { name: 'Skip Timer', exact: true })
    const correct = continued.getByRole('button', { name: 'I got it right', exact: true })
    let nextRevision = 12
    for (let trial = 0; trial < 30 && !(await nextTeacher.isVisible()); trial++) {
      // Real cloud readback can outlast a Familiar DT's ten-second window.
      // Review the actual prompt whether the timer was skipped or expired.
      await expect(skipTimer.or(correct)).toBeVisible()
      if (await skipTimer.isVisible()) await skipTimer.click()
      else console.log(`Trial ${trial + 1}: response window already ended; normal review is visible.`)
      await correct.click()
      await synced(fourth.page, ++nextRevision)
      console.log(`Repeated practice checkpoint ${nextRevision} confirmed in real cloud.`)
    }
    await expect(nextTeacher).toHaveAttribute('data-character-index', '0')
    await expect(nextTeacher).toHaveAttribute('data-step', '1')
    const nextCheckpoint = (await remoteCheckpoint())!
    assert.equal(nextCheckpoint.progress.lesson.targets[nextCheckpoint.acquisition.flow.targetIndex].text, '每个')
    await fourth.context.close()
    const fifth = await newPage()
    await login(fifth.page)
    const nextWord = await launch(fifth.page)
    await expect(nextWord.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute('data-step', '1')
    await expect(nextWord.getByRole('region', { name: 'Stroke order teacher' })).toHaveAttribute(
      'data-character-index',
      '0',
    )
    await synced(fifth.page, nextRevision)
    assert.deepEqual(await remoteResults(), results)
    console.log('Fresh-browser result/DT recovery and next-word guided teaching resume confirmed.')
  }
  assert.deepEqual(errors, [])
  acceptancePassed = true
  console.log(
    JSON.stringify({
      passed: true,
      sourceRevision: revision,
      grade,
      currentLesson,
      fullOfflineOrdinaryEntry: currentLesson,
      cloudTeachingResume: true,
      offlineReconnect: true,
      wholeWordBeforeAcquisition: true,
      acquisitionFreshBrowserResume: true,
      traceIndependentThenDistractors: !native,
      nativeAcquisitionSequencePreserved: native,
      completedResultFreshBrowserResume: true,
      nextWordTeachingFreshBrowserResume: true,
      realFamilyRecordsTouched: false,
      physicalAudioOrTouchTested: false,
    }),
  )
} catch (error) {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      const frame = page.frameLocator('iframe:visible')
      console.log({
        failureState: {
          skipTimerVisible: await frame
            .getByRole('button', { name: 'Skip Timer', exact: true })
            .isVisible()
            .catch(() => false),
          reviewVisible: await frame
            .getByRole('button', { name: 'I got it right', exact: true })
            .isVisible()
            .catch(() => false),
          teacherVisible: await frame
            .getByRole('region', { name: 'Stroke order teacher' })
            .isVisible()
            .catch(() => false),
        },
      })
    }
  }
  throw error
} finally {
  await browser.close()
  if (scope) {
    const deleted = await cleanSyntheticWritingFamily(scope, adminRequest)
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        signal: AbortSignal.timeout(20_000),
      },
    )
    assert.ok(response.ok, `Synthetic auth cleanup failed (${response.status})`)
    record(true, deleted)
    console.log(
      JSON.stringify({
        syntheticCleanupComplete: true,
        deletedTestDocuments: deleted,
        realFamilyRecordsTouched: false,
      }),
    )
  }
}
