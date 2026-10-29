// Real-backend acceptance, limited to a freshly-created disposable test family.
// No owner credentials, existing-family records or security-policy changes.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium, expect, type Page } from '@playwright/test'
import { unpackWritingWorkspace } from '../src/familyBeta/writingWorkspaceCodec.ts'
import { automaticCurriculumStrokeMedians } from '../src/learningGames/strokeOrder/automaticCurriculumStrokeAssets.ts'
import { grade2StrokeMedians } from '../src/learningGames/strokeOrder/grade2StrokeAssets.ts'
import { buildStrokeOrderRounds } from '../src/learningGames/strokeOrder/rounds.ts'
import { wetlandStrokeMedians } from '../src/learningGames/strokeOrder/wetlandStrokeAssets.ts'
import { getStrokeLayout } from '../src/strokeTeacherPrototype/original/strokeLayout.ts'
import { cleanSyntheticWritingFamily, syntheticWritingScope } from './syntheticWritingScope.ts'

assert.equal(process.env.DEVICE_CLOUD_ACCEPTANCE, '1', 'Explicit synthetic cloud opt-in required')
const academyAcceptance = process.env.ACADEMY_CLOUD_ACCEPTANCE === '1'
const base = process.env.DEVICE_CLOUD_ORIGIN || 'http://127.0.0.1:5193'
assert.ok(
  base === 'http://127.0.0.1:5193' ||
    (academyAcceptance && base === 'https://ninjadojo.meghangames.com') ||
    /^https:\/\/weekly-dictation-staging--(?:device-sync-oct27-v1|academy-integrated-oct27-v1)-[a-z0-9]+\.web\.app$/.test(
      base,
    ),
)
const revision = process.env.DEVICE_CLOUD_REVISION,
  tree = process.env.DEVICE_CLOUD_TREE
assert.match(revision || '', /^[a-f0-9]{40}$/)
assert.match(tree || '', /^[a-f0-9]{64}$/)
const manifest = await fetch(`${base}/${academyAcceptance ? 'family-beta' : 'device-acceptance'}-manifest.json`).then(
  (r) => r.json(),
)
assert.equal(manifest.sourceRevision, revision)
assert.equal(manifest.fileTreeSha256, tree)
if (academyAcceptance) {
  assert.equal(manifest.grade, 'Family')
  assert.equal(manifest.canonicalOrigin, 'https://ninjadojo.meghangames.com')
  assert.equal(manifest.entry, 'family-beta-preview.html')
} else assert.equal(manifest.testAccountsOnly, true)
assert.equal(manifest.firebaseProject, 'weeklydictationapp')
assert.ok(manifest.files.length < 2000)
for (let i = 0; i < manifest.files.length; i += 16)
  await Promise.all(
    manifest.files.slice(i, i + 16).map(async (file: { path: string; sha256: string }) => {
      assert.ok(!file.path.startsWith('/') && !file.path.split('/').includes('..'))
      if (file.path.startsWith('.') || (academyAcceptance && file.path === '_headers')) return
      const response = await fetch(`${base}/${file.path}`, { signal: AbortSignal.timeout(20000) })
      assert.equal(response.status, 200)
      assert.equal(new URL(response.url).origin, base)
      assert.equal(
        createHash('sha256')
          .update(Buffer.from(await response.arrayBuffer()))
          .digest('hex'),
        file.sha256,
      )
    }),
  )
const require = createRequire(import.meta.url)
const auth = require('firebase-tools/lib/auth.js'),
  account = auth.getGlobalDefaultAccount()
assert.ok(account?.tokens?.refresh_token, 'Existing supported CLI cleanup authorization required')
const access = await auth.getAccessToken(account.tokens.refresh_token, [
  'https://www.googleapis.com/auth/cloud-platform',
])
const request: typeof fetch = (url, options) =>
  fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${access.access_token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20000),
  })
const preflight = await request(
  `https://firestore.googleapis.com/v1/projects/weeklydictationapp/databases/(default)/documents/users/ninja-writing-preflight-${randomUUID()}`,
)
assert.equal(preflight.status, 404, 'No test account created without confirmed cleanup access')
console.log(
  `Exact ${academyAcceptance ? 'family release' : 'device prototype'} verified (${manifest.files.length} listed files); cleanup access confirmed.`,
)
const email = `ninja-writing-${randomUUID()}@example.invalid`,
  password = `T7!${randomUUID()}zQ`
let scope: ReturnType<typeof syntheticWritingScope> | undefined,
  idToken = '',
  apiKey = ''
let identityReady!: () => void
const identity = new Promise<void>((resolve) => {
  identityReady = resolve
})
const receipt = process.env.DEVICE_CLOUD_RECEIPT || 'family-beta-artifacts/device-sync-2026-10-27/cloud-receipt.json'
const checks: string[] = []
let acceptancePassed = false
const record = (cleanupComplete = false, deletedDocuments = 0) =>
  writeFileSync(
    receipt,
    JSON.stringify(
      {
        sourceRevision: revision,
        fileTreeSha256: tree,
        origin: base,
        syntheticUid: scope?.uid,
        checks,
        cleanupComplete,
        deletedDocuments,
        realFamilyRecordsTouched: false,
        acceptancePassed,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  )
const browser = await chromium.launch()
let currentPage: Page | undefined
const f = (page: Page) => page.frameLocator('iframe:visible')
const acquisition = (page: Page) =>
  f(page)
    .getByRole('button', { name: 'Skip Timer', exact: true })
    .or(f(page).getByRole('button', { name: 'I got it right', exact: true }))
async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: 'block' })
  await context.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('playing'))
      setTimeout(() => this.dispatchEvent(new Event('ended')), 10)
      return Promise.resolve()
    }
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException('Adult synthetic acceptance', 'NotAllowedError')
        },
      },
    })
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
  })
  await context.route('https://firestore.googleapis.com/**', async (route) => {
    if (!scope) await Promise.race([identity, new Promise((resolve) => setTimeout(resolve, 10000))])
    if (!scope) return route.abort('blockedbyclient')
    const url = new URL(route.request().url()),
      path = decodeURIComponent(url.pathname.slice('/v1/'.length))
    try {
      assert.ok(path.startsWith('projects/weeklydictationapp/databases/(default)/documents'))
      if (path.endsWith('/documents:commit'))
        for (const w of route.request().postDataJSON().writes)
          scope.validate(w.update?.name || w.delete || w.transform?.document)
      else if (path.endsWith('/documents:batchGet'))
        for (const n of route.request().postDataJSON().documents) scope.validate(n)
      else scope.validate(path.replace(/:runQuery$/, ''))
      await route.continue()
    } catch {
      checks.push('FAIL: request outside disposable family refused')
      await route.abort('blockedbyclient')
    }
  })
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  page.on('pageerror', () => checks.push('FAIL: uncaught browser error'))
  return { context, page }
}
async function panel(page: Page, open: boolean) {
  const summary = page.locator('summary').filter({ hasText: 'Parent controls' })
  await summary.waitFor()
  if ((await summary.evaluate((el) => (el.parentElement as HTMLDetailsElement).open)) !== open) await summary.click()
}
async function returnToMenu(page: Page) {
  const teacher = f(page).getByRole('region', { name: 'Stroke order teacher' })
  if ((await teacher.isVisible()) || (await acquisition(page).isVisible()))
    await f(page).getByRole('button', { name: 'Exit game', exact: true }).click()
  const reading = f(page).getByRole('button', { name: 'Exit reading', exact: true })
  if (await reading.isVisible()) await reading.click()
  const back = f(page).getByRole('button', { name: /Back to all challenges/ })
  if (await back.isVisible()) await back.click()
}
async function choose(page: Page, grade: string) {
  await returnToMenu(page)
  await panel(page, true)
  await page.getByLabel('Child profile').selectOption({ label: `Device test ${grade} · ${grade}` })
  const back = page.getByRole('button', { name: 'Back to activities', exact: true })
  if (await back.isVisible()) await back.click()
  await panel(page, false)
  await expect(f(page).getByRole('button', { name: /Enter the Dojo/ })).toBeVisible()
}
async function login(page: Page, slug: string, grade: string) {
  await page.goto(`${base}/family-beta-preview.html?grade=${slug}`)
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await choose(page, grade)
}
async function confirmed(page: Page) {
  const writing = await f(page).getByRole('region', { name: 'Stroke order teacher' }).isVisible()
  const grade = await page.locator('.beta-workspace').getAttribute('data-report-grade')
  await returnToMenu(page)
  await panel(page, true)
  await page.getByRole('button', { name: 'Check syncing', exact: true }).click()
  await expect(
    page
      .getByRole('region', { name: academyAcceptance ? 'Family syncing' : 'Device and syncing check' })
      .getByRole('status'),
  ).toContainText('confirmed in your private family account', { timeout: 60000 })
  await panel(page, false)
  if (writing) await openWriting(page, grade!)
}
async function openWriting(page: Page, grade: string, allowAcquisition = false) {
  await f(page)
    .getByRole('button', { name: /Enter the Dojo/ })
    .click()
  await f(page)
    .getByRole('button', { name: grade === 'Kindergarten' ? 'Writing characters' : 'Learn to Write', exact: true })
    .click()
  const teacher = f(page).getByRole('region', { name: 'Stroke order teacher' }),
    warmup = f(page).getByRole('button', { name: 'Skip Warmup', exact: true })
  await expect(allowAcquisition ? teacher.or(warmup).or(acquisition(page)) : teacher.or(warmup)).toBeVisible()
  if (await warmup.isVisible()) await warmup.click()
  if (!allowAcquisition) await expect(teacher).toBeVisible()
  else await expect(teacher.or(acquisition(page))).toBeVisible()
  return teacher
}
async function advance(page: Page) {
  currentPage = page
  const teacher = f(page).getByRole('region', { name: 'Stroke order teacher' })
  const id = await teacher.getAttribute('data-report-target'),
    index = Number(await teacher.getAttribute('data-character-index')),
    step = Number(await teacher.getAttribute('data-step'))
  const word = await page.evaluate((id) => {
    for (const raw of Object.values(localStorage)) {
      let r
      try {
        r = JSON.parse(raw)
      } catch {
        continue
      }
      const candidates = [r?.writing]
      for (const nested of Object.values(r?.records || {})) {
        try {
          candidates.push(...(JSON.parse(nested as string).values?.writingAcquisitionProgress || []))
        } catch {}
      }
      for (const p of candidates) {
        const target = p?.lesson?.targets?.find((t: { id: string }) => t.id === id)
        if (target) return target.text as string
      }
    }
    throw new Error('Test writing target unavailable')
  }, id)
  const strokes = buildStrokeOrderRounds([{ id: id!, text: [...word][index] }], {
      ...grade2StrokeMedians,
      ...automaticCurriculumStrokeMedians,
      ...wetlandStrokeMedians,
    }).rounds[0].strokes,
    layout = getStrokeLayout(strokes),
    pad = teacher.locator('svg[role="application"]')
  await pad.scrollIntoViewIfNeeded()
  for (let i = Number(await pad.getAttribute('data-next-stroke')); i < strokes.length; i++) {
    const b = (await pad.boundingBox())!,
      xy = (p: readonly [number, number]) =>
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
  await f(page)
    .getByRole('button', { name: step === 5 ? 'Compare' : 'Next step', exact: true })
    .click()
  if (step === 5) {
    await f(page).getByRole('button', { name: 'I slayed it', exact: true }).click()
    await expect
      .poll(() =>
        f(page)
          .locator('body')
          .evaluate(
            (root, position) => {
              const next = root.querySelector<HTMLElement>('[aria-label="Stroke order teacher"]')
              if (!next) return Boolean(root.querySelector('.practice-page'))
              return (
                next.dataset.reportTarget !== position.id ||
                Number(next.dataset.characterIndex) !== position.index ||
                Number(next.dataset.step) !== 5
              )
            },
            { id, index },
          ),
      )
      .toBe(true)
      .catch(async (error) => {
        writeFileSync(receipt.replace('.json', '-transition.txt'), await f(page).locator('body').innerText(), {
          mode: 0o600,
        })
        await page.screenshot({ path: receipt.replace('.json', '-transition.png') })
        throw error
      })
  } else await expect(teacher).toHaveAttribute('data-step', String(step + 1))
}
try {
  const first = await newPage()
  currentPage = first.page
  await first.page.goto(`${base}/family-beta-preview.html?grade=grade2`)
  await first.page.getByRole('button', { name: 'Create account', exact: true }).click()
  await first.page.getByLabel('Email', { exact: true }).fill(email)
  await first.page.getByLabel('Password', { exact: true }).fill(password)
  const response = first.page.waitForResponse((r) => r.url().includes('/accounts:signUp?'))
  const click = first.page.getByRole('button', { name: 'Create account', exact: true }).click()
  const signup = await response
  assert.ok(signup.ok())
  const user = await signup.json()
  scope = syntheticWritingScope(user.localId, user.email, email)
  idToken = user.idToken
  apiKey = new URL(signup.url()).searchParams.get('key')!
  record()
  identityReady()
  await click
  await panel(first.page, true)
  await first.page.getByRole('button', { name: 'Manage profiles', exact: true }).click()
  await first.page.getByLabel('Confirm parent password').fill(password)
  await first.page.getByRole('button', { name: 'Unlock profile changes' }).click()
  for (const grade of ['Kindergarten', 'Grade 2', 'Grade 5']) {
    await first.page.getByLabel('Child’s name', { exact: true }).fill(`Device test ${grade}`)
    await first.page.getByRole('combobox', { name: 'Grade', exact: true }).selectOption(grade)
    await first.page.getByRole('button', { name: 'Add child', exact: true }).click()
    await expect(
      first.page.getByRole('combobox', { name: `Grade for Device test ${grade}`, exact: true }),
    ).toBeVisible()
  }
  checks.push('PASS: real parent authentication and three disposable learner profiles')
  record()
  for (const [slug, grade] of [
    ['kindergarten', 'Kindergarten'],
    ['grade2', 'Grade 2'],
  ]) {
    await choose(first.page, grade)
    await openWriting(first.page, grade)
    await advance(first.page)
    await confirmed(first.page)
    const second = await newPage()
    try {
      await login(second.page, slug, grade)
      const teacher = await openWriting(second.page, grade)
      await expect(teacher).toHaveAttribute('data-step', '2')
      await advance(second.page)
      await confirmed(second.page)
      await second.context.setOffline(true)
      await advance(second.page)
      await expect(teacher).toHaveAttribute('data-step', '4')
      await second.context.setOffline(false)
      await confirmed(second.page)
    } finally {
      await second.context.close()
    }
    const third = await newPage()
    try {
      await login(third.page, slug, grade)
      await expect(await openWriting(third.page, grade)).toHaveAttribute('data-step', '4')
      if (process.env.DEVICE_CLOUD_ACQUISITION === '1') {
        let trials = 0
        while (await f(third.page).getByRole('region', { name: 'Stroke order teacher' }).isVisible()) {
          await advance(third.page)
          assert.ok(++trials < 21)
        }
        await expect(acquisition(third.page)).toBeVisible()
        const skip = f(third.page).getByRole('button', { name: 'Skip Timer', exact: true }),
          right = f(third.page).getByRole('button', { name: 'I got it right', exact: true })
        await expect(skip.or(right)).toBeVisible()
        if (await skip.isVisible()) await skip.click()
        await right.click()
        const checkpoint = async (page: Page) => {
          const child = await page.getByLabel('Child profile').inputValue()
          const raws = await page.evaluate(
            (child) =>
              Object.entries(localStorage)
                .filter(
                  ([key]) =>
                    key.startsWith(`family-beta-activity:${child}:`) || key.startsWith('family-beta-acquisition-v1:'),
                )
                .map(([, raw]) => raw),
            child,
          )
          for (const raw of raws) {
            let record
            try {
              record = JSON.parse(raw)
            } catch {
              continue
            }
            if (record?.codec === 'writing-lzw-utf8-v1') record = JSON.parse(unpackWritingWorkspace(record.payload))
            const list = [record?.writing]
            for (const nested of Object.values(record?.records || {})) {
              try {
                list.push(...(JSON.parse(nested as string).values?.writingAcquisitionProgress || []))
              } catch {}
            }
            const progress = list.find((p) => p?.acquisition?.childId === child && p?.acquisition?.revision > 0)
            if (progress)
              return {
                revision: progress.acquisition.revision,
                flow: progress.acquisition.flow,
                lesson: progress.lesson.fingerprint,
              }
          }
          return null
        }
        await expect.poll(async () => (await checkpoint(third.page))?.revision).toBe(1)
        const saved = await checkpoint(third.page)
        await confirmed(third.page)
        const fourth = await newPage()
        try {
          await login(fourth.page, slug, grade)
          await openWriting(fourth.page, grade, true)
          await expect(acquisition(fourth.page)).toBeVisible()
          assert.deepEqual(await checkpoint(fourth.page), saved)
        } finally {
          await fourth.context.close()
        }
        checks.push(
          `PASS: ${grade} complete whole-word teaching and first acquisition answer recover on another device`,
        )
        record()
      }
    } finally {
      await third.context.close()
    }
    checks.push(`PASS: ${grade} current writing transfers to a fresh browser and retains/reconnects offline teaching`)
    record()
  }
  await choose(first.page, 'Grade 5')
  await f(first.page)
    .getByRole('button', { name: /Enter the Dojo/ })
    .click()
  await f(first.page).getByRole('button', { name: 'Read the Words', exact: true }).click()
  await f(first.page).getByRole('button', { name: 'Record my reading', exact: true }).click()
  await f(first.page).getByRole('button', { name: 'Continue without recording', exact: true }).click()
  await f(first.page).getByRole('button', { name: 'Yes', exact: true }).click()
  const practice = f(first.page).locator('.reading-practice-page'),
    target = await practice.getAttribute('data-report-target'),
    phase = await practice.getAttribute('data-report-phase')
  await confirmed(first.page)
  const other = await newPage()
  try {
    await login(other.page, 'grade5', 'Grade 5')
    await f(other.page)
      .getByRole('button', { name: /Enter the Dojo/ })
      .click()
    await f(other.page).getByRole('button', { name: 'Read the Words', exact: true }).click()
    await expect(f(other.page).locator('.reading-practice-page')).toHaveAttribute('data-report-target', target!)
    await expect(f(other.page).locator('.reading-practice-page')).toHaveAttribute('data-report-phase', phase!)
  } finally {
    await other.context.close()
  }
  checks.push('PASS: Grade 5 current 50-word review reading checkpoint transfers to fresh browser')
  record()
  await returnToMenu(first.page)
  await f(first.page)
    .getByRole('button', { name: /Final Boss/ })
    .click()
  await f(first.page).getByRole('button', { name: 'Boss Test', exact: true }).click()
  await f(first.page).getByRole('button', { name: 'Reading Test', exact: true }).click()
  await expect(f(first.page).locator('.deferred-reading-collector')).toBeVisible()
  let answers = 0
  while (await f(first.page).locator('.deferred-reading-collector').count()) {
    await f(first.page).getByRole('button', { name: 'Record my reading', exact: true }).click()
    await f(first.page).getByRole('button', { name: 'Continue without a recording', exact: true }).click()
    answers++
    assert.ok(answers <= 50)
  }
  assert.equal(answers, 50)
  const rows = f(first.page).locator('.deferred-review-row')
  await expect(rows).toHaveCount(50)
  for (let i = 0; i < 50; i++) await rows.nth(i).getByRole('button', { name: 'Yes', exact: true }).click()
  await f(first.page).getByRole('button', { name: 'Submit final review', exact: true }).click()
  await confirmed(first.page)
  const child = await first.page.getByLabel('Child profile').inputValue()
  const resultsUrl = scope.url(`${scope.family}/children/${child}/betaResults`)
  const scores = async () => {
    const response = await request(`${resultsUrl}?pageSize=100`)
    assert.ok(response.ok)
    const body = await response.json()
    assert.ok(!body.nextPageToken)
    return (body.documents || []).filter(
      (d: { fields: { activity: { stringValue: string } } }) =>
        d.fields.activity.stringValue === 'Final Boss Reading Test',
    )
  }
  await expect.poll(async () => (await scores()).length, { timeout: 60000 }).toBe(1)
  const score = (await scores())[0]
  assert.equal(score.fields.correct.integerValue, '50')
  assert.equal(score.fields.attempted.integerValue, '50')
  assert.ok(!/blob:|data:audio|"idToken"|"refreshToken"/.test(JSON.stringify(score)))
  const fourth = await newPage()
  try {
    await login(fourth.page, 'grade5', 'Grade 5')
    await expect(f(fourth.page).getByRole('region', { name: 'Saved Ninja Record' })).toContainText('50/50')
    assert.equal((await scores()).length, 1)
  } finally {
    await fourth.context.close()
  }
  const anonymous = await fetch(resultsUrl, { signal: AbortSignal.timeout(20000) })
  assert.ok([401, 403].includes(anonymous.status))
  checks.push(
    'PASS: all 50 Grade 5 responses save exactly once on the real service and recover on a fresh browser; anonymous reads denied',
  )
  record()

  assert.ok(checks.every((c) => c.startsWith('PASS:')))
  acceptancePassed = true
  record()
  console.log(checks.join('\n'))
} catch (error) {
  writeFileSync(receipt.replace('.json', '-failure.txt'), String(error), { mode: 0o600 })
  if (currentPage && !currentPage.isClosed()) {
    writeFileSync(receipt.replace('.json', '-page.txt'), await currentPage.locator('body').innerText(), { mode: 0o600 })
    await currentPage.screenshot({ path: receipt.replace('.json', '-page.png') })
  }
  throw error
} finally {
  await browser.close()
  if (scope) {
    const deleted = await cleanSyntheticWritingFamily(scope, request)
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(apiKey)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) },
    )
    assert.ok(response.ok, 'Disposable authentication cleanup failed')
    record(true, deleted)
    console.log(`Disposable test family removed (${deleted} documents); no real-family records touched.`)
  }
}
