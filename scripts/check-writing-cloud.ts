// Explicit opt-in acceptance against a retained LOCAL build and real Firebase.
// Uses only a new, uniquely named disposable family; never an owner's session.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, expect, type FrameLocator, type Page } from '@playwright/test'
import { strokeOrderGuide } from '../src/familyBeta/strokeOrderSlay.ts'
import { getStrokeLayout } from '../src/strokeTeacherPrototype/original/strokeLayout.ts'
import { cleanSyntheticWritingFamily, syntheticWritingScope } from './syntheticWritingScope.ts'

assert.equal(process.env.WRITING_CLOUD_ACCEPTANCE, '1', 'Explicit synthetic cloud acceptance opt-in required')
const base = 'http://127.0.0.1:5198'
const revision = '3f81a13a2d4c246028e775302b157bad708a7dcf'
const tree = '02692805e67dd918a692bbb455a1c657b276ba4350bdfe2403b57f9090c40fff'
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
  `Exact local candidate verified (${verifiedFiles} public files); disposable-family cleanup access confirmed.`,
)

const receipt = join(mkdtempSync(join(tmpdir(), 'ninja-writing-cloud-')), 'receipt.json')
let acceptancePassed = false
const record = (cleanupComplete: boolean, deletedTestDocuments?: number) =>
  writeFileSync(
    receipt,
    JSON.stringify(
      {
        sourceRevision: revision,
        fileTreeSha256: tree,
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
  await page.goto(`${base}/family-beta-preview.html?grade=grade2`)
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByLabel('Child profile')).toContainText('Synthetic Writing')
}
async function launch(page: Page) {
  const frame = page.frameLocator('iframe:visible')
  await expect(frame.getByRole('heading', { name: /Ready for your next/ })).toBeVisible()
  if ((await page.getByLabel('Practice week').inputValue()) !== '2026-09-29') {
    await page.getByLabel('Practice week').selectOption('2026-09-29')
    await expect(page.locator('iframe:visible')).toHaveAttribute('src', /week=2026-09-29/)
  }
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await frame.getByRole('button', { name: 'Learn to Write', exact: true }).click()
  await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
  return frame
}
type Checkpoint = {
  progress: { revision: number; completedTeachingSteps: number[] }
  acquisition: { revision: number }
}
async function localCheckpoint(page: Page): Promise<Checkpoint | null> {
  return page.evaluate((id) => {
    const raw = localStorage.getItem(`family-beta-activity:${id}:lesson-workspace-v1`)
    if (!raw) return null
    for (const text of Object.values(JSON.parse(raw).records) as string[]) {
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

try {
  const first = await newPage()
  await first.page.goto(`${base}/family-beta-preview.html?grade=grade2`)
  await expect(first.page.getByText(`Beta build ${revision.slice(0, 7)}`)).toBeVisible()
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
  await first.page.getByRole('button', { name: 'Parent controls', exact: true }).click()
  await first.page.getByLabel('Confirm parent password').fill(password)
  await first.page.getByRole('button', { name: 'Unlock profile changes' }).click()
  await first.page.getByLabel('Child’s name', { exact: true }).fill('Synthetic Writing')
  await first.page.getByRole('combobox', { name: 'Grade', exact: true }).selectOption('Grade 2')
  await first.page.getByRole('button', { name: 'Add child', exact: true }).click()
  await expect(first.page.getByLabel('Child profile')).toContainText('Synthetic Writing')
  childId = await first.page.getByLabel('Child profile').inputValue()
  assert.match(childId, /^[A-Za-z0-9_-]+$/)
  await first.page.getByRole('button', { name: 'Activities', exact: true }).click()
  const firstFrame = await launch(first.page)
  await finishTrial(first.page, firstFrame, '英', 1)
  await synced(first.page, 1)
  assert.equal((await remoteCheckpoint())!.acquisition.revision, 0)
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
  await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
  await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
  await synced(second.page, 11)
  assert.equal((await remoteCheckpoint())!.acquisition.revision, 1)
  const saved = await remoteCheckpoint()
  await second.context.close()
  console.log('Both characters completed before scroll acquisition; first ordinary answer saved atomically.')
  const third = await newPage()
  await login(third.page)
  const resumed = await launch(third.page)
  await expect(resumed.getByRole('region', { name: 'Stroke order teacher' })).toHaveCount(0)
  await expect(resumed.getByRole('button', { name: 'Skip Timer', exact: true })).toBeVisible()
  assert.deepEqual(await localCheckpoint(third.page), saved)
  assert.deepEqual(errors, [])
  acceptancePassed = true
  console.log(
    JSON.stringify({
      passed: true,
      sourceRevision: revision,
      cloudTeachingResume: true,
      offlineReconnect: true,
      wholeWordBeforeAcquisition: true,
      acquisitionFreshBrowserResume: true,
      realFamilyRecordsTouched: false,
      physicalAudioOrTouchTested: false,
    }),
  )
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
