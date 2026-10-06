// Explicit synthetic production check. Never uses a real parent's credentials.
// All created documents are scoped to the newly-created test UID and removed.
import { chromium, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
const base = process.argv[2]
if (
  process.env.FAMILY_SYNC_PRODUCTION_CHECK !== '1' ||
  !base ||
  !['http://127.0.0.1:5198', 'https://ninjadojo.meghangames.com'].includes(base)
)
  throw new Error('Confirm the exact synthetic acceptance target.')
const email = `ninja-sync-${randomUUID()}@example.invalid`
const password = `T7!${randomUUID()}zQ`
const browser = await chromium.launch()
let uid = '',
  idToken = '',
  apiKey = ''
let deleted = 0
async function newPage() {
  const context = await browser.newContext()
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
  })
  const page = await context.newPage()
  page.on('dialog', (dialog) => dialog.accept())
  page.setDefaultTimeout(30000)
  return { context, page }
}
try {
  const first = await newPage()
  first.page.on('response', async (response) => {
    if (response.url().includes('/accounts:signUp?') && response.ok()) {
      const body = await response.json()
      if (body.email !== email) throw new Error('Unexpected synthetic signup identity.')
      uid = body.localId
      idToken = body.idToken
      apiKey = new URL(response.url()).searchParams.get('key') || ''
    }
  })
  await first.page.goto(`${base}/family-beta-preview.html?grade=grade5`)
  await expect(first.page.getByRole('button', { name: 'Report a problem', exact: true })).toBeVisible()
  await first.page.getByRole('button', { name: 'Create account', exact: true }).click()
  await first.page.getByLabel('Email', { exact: true }).fill(email)
  await first.page.getByLabel('Password', { exact: true }).fill(password)
  await first.page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(first.page.getByText('Family account connected.', { exact: true })).toBeVisible()
  console.log('Synthetic parent sign-up passed.')
  await first.page.getByRole('button', { name: 'Parent controls', exact: true }).click()
  await first.page.getByLabel('Confirm parent password').fill(password)
  await first.page.getByRole('button', { name: 'Unlock profile changes' }).click()
  for (const grade of ['Grade 5', 'Grade 2', 'Kindergarten']) {
    await first.page.getByLabel('Child’s name', { exact: true }).fill(`Synthetic ${grade}`)
    await first.page.getByRole('combobox', { name: 'Grade', exact: true }).selectOption(grade)
    await first.page.getByRole('button', { name: 'Add child', exact: true }).click()
    await expect(first.page.getByLabel('Child profile')).toContainText(`Synthetic ${grade}`)
  }
  await first.page.getByLabel('Child profile').selectOption({ label: 'Synthetic Grade 5 · Grade 5' })
  await first.page.getByRole('button', { name: 'Activities', exact: true }).click()
  console.log('Three synthetic child profiles created.')
  const frame = first.page.frameLocator('iframe')
  await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await frame.getByRole('button', { name: 'Learn to Write', exact: true }).click()
  await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
  for (let i = 0; i < 4; i++) {
    await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
    await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
  }
  const before = await first.page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([key]) => key.startsWith('family-beta-acquisition-v1:'))
      .map(([, raw]) => JSON.parse(raw)),
  )
  expect(before).toHaveLength(1)
  expect(before[0].envelope.revision).toBe(4)
  await frame.getByRole('button', { name: 'Done for today', exact: true }).click()
  await first.page.getByRole('button', { name: 'Progress', exact: true }).click()
  await expect(first.page.getByRole('cell', { name: '1 / 1', exact: true })).toBeVisible()
  await expect(first.page.getByRole('status').filter({ hasText: 'Scores and saved practice confirmed' })).toBeVisible()
  console.log('First-device score and practice confirmed.')
  await first.context.close()

  const second = await newPage()
  await second.page.goto(`${base}/family-beta-preview.html?grade=grade5`)
  await second.page.getByLabel('Email', { exact: true }).fill(email)
  await second.page.getByLabel('Password', { exact: true }).fill(password)
  await second.page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await second.page.getByRole('button', { name: 'Progress', exact: true }).click()
  await expect(second.page.getByRole('cell', { name: '1 / 1', exact: true })).toBeVisible()
  await second.page.getByRole('button', { name: 'Activities', exact: true }).click()
  const otherFrame = second.page.frameLocator('iframe')
  await otherFrame.getByRole('button', { name: /Enter the Dojo/ }).click()
  await otherFrame.getByRole('button', { name: 'Learn to Write', exact: true }).click()
  await expect(otherFrame.getByRole('button', { name: 'Skip Timer', exact: true })).toBeVisible()
  const after = await second.page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([key]) => key.startsWith('family-beta-acquisition-v1:'))
      .map(([, raw]) => JSON.parse(raw)),
  )
  expect(after[0].envelope.flow).toEqual(before[0].envelope.flow)
  expect(after[0].assessments).toEqual([])
  expect(after[0].reviewedTrials).toEqual(before[0].reviewedTrials)
  for (const grade of ['Grade 2', 'Kindergarten']) {
    await second.page.getByLabel('Child profile').selectOption({ label: `Synthetic ${grade} · ${grade}` })
    await expect(second.page.frameLocator('iframe').getByRole('heading', { name: /Ready for your next/ })).toBeVisible()
  }
  const denied = await fetch(
    `https://firestore.googleapis.com/v1/projects/weeklydictationapp/databases/(default)/documents/families/family-${uid}/children`,
  )
  expect([401, 403]).toContain(denied.status)
  console.log(
    JSON.stringify({
      passed: true,
      target: base,
      twoIndependentBrowserContexts: true,
      scoresRecovered: true,
      nextPromptRecovered: true,
      threeGradesLoaded: true,
      anonymousReadDenied: true,
    }),
  )
} finally {
  await browser.close()
  if (uid) {
    const require = createRequire(import.meta.url),
      auth = require('firebase-tools/lib/auth.js')
    const account = auth.getGlobalDefaultAccount()
    const token = await auth.getAccessToken(account.tokens.refresh_token, [
      'https://www.googleapis.com/auth/cloud-platform',
    ])
    const headers = { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }
    const root = `projects/weeklydictationapp/databases/(default)/documents/families/family-${uid}`
    async function removeSynthetic(name: string) {
      if (name !== root && !name.startsWith(`${root}/`)) throw new Error('Cleanup refused an unrelated path.')
      const collections = await fetch(`https://firestore.googleapis.com/v1/${name}:listCollectionIds`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ pageSize: 100 }),
      }).then((r) => r.json())
      if (collections.nextPageToken) throw new Error('Unexpected synthetic cleanup size.')
      for (const collection of collections.collectionIds || []) {
        const docs = await fetch(`https://firestore.googleapis.com/v1/${name}/${collection}?pageSize=100`, {
          headers,
        }).then((r) => r.json())
        if (docs.nextPageToken) throw new Error('Unexpected synthetic cleanup size.')
        for (const doc of docs.documents || []) await removeSynthetic(doc.name)
      }
      const response = await fetch(`https://firestore.googleapis.com/v1/${name}`, { method: 'DELETE', headers })
      if (!response.ok && response.status !== 404) throw new Error(`Synthetic cleanup failed (${response.status}).`)
      deleted++
    }
    await removeSynthetic(root)
    const userPath = `projects/weeklydictationapp/databases/(default)/documents/users/${uid}`
    const userDelete = await fetch(`https://firestore.googleapis.com/v1/${userPath}`, { method: 'DELETE', headers })
    if (!userDelete.ok && userDelete.status !== 404) throw new Error('Synthetic parent record cleanup failed.')
    const authDelete = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
    )
    if (!authDelete.ok) throw new Error('Synthetic sign-in cleanup failed.')
    console.log(
      JSON.stringify({
        syntheticCleanupComplete: true,
        deletedTestDocuments: deleted + 1,
        realFamilyRecordsTouched: false,
      }),
    )
  }
}
