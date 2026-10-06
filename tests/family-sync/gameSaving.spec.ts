import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

const grades = [
  ['kindergarten', 'Kindergarten', 'synthetic-k'],
  ['grade2', 'Grade 2', 'synthetic-g2'],
  ['grade5', 'Grade 5', 'synthetic-g5'],
] as const

function value(input: unknown): unknown {
  if (typeof input === 'string') return { stringValue: input }
  if (typeof input === 'boolean') return { booleanValue: input }
  if (typeof input === 'number') return { integerValue: String(input) }
  if (Array.isArray(input)) return { arrayValue: { values: input.map(value) } }
  return { mapValue: { fields: fields(input as Record<string, unknown>) } }
}
function fields(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).map(([key, entry]) => [key, value(entry)]))
}

test.beforeEach(async ({ page }) => {
  // This is the production-configured artifact. All external requests are
  // intercepted: synthetic account/storage fixtures never reach production.
  const documents = new Map<string, { name: string; fields: Record<string, unknown> }>()
  await page.context().route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://127.0.0.1:5193') return route.continue()
    const curriculum = url.pathname.match(/\/curriculum\/beta\/(kindergarten|grade2|grade5)\.json$/)
    if (curriculum) return route.fulfill({ contentType: 'application/json', body: await readFile(`public/curriculum/beta/${curriculum[1]}.json`, 'utf8') })
    if (url.hostname !== 'firestore.googleapis.com') return route.abort('blockedbyclient')
    const request = route.request()
    const base = 'projects/weeklydictationapp/databases/(default)/documents/'
    const name = url.pathname.split('/v1/')[1]
    const respond = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname.endsWith('/documents:batchGet')) {
      const names = request.postDataJSON().documents as string[]
      return respond(names.map((id) => {
        const data = id.endsWith('/users/synthetic-parent')
          ? { familyId: 'family-synthetic-parent', role: 'parent' }
          : { id: 'family-synthetic-parent', ownerParentId: 'synthetic-parent' }
        return { found: { name: id, fields: fields(data) } }
      }))
    }
    if (name === `${base}families/family-synthetic-parent/children`) {
      return respond({ documents: grades.map(([, grade, id]) => ({
        name: `${name}/${id}`, fields: fields({ id, nickname: grade, grade, active: true, schoolYear: '2026–2027' }),
      })) })
    }
    if (request.method() === 'PATCH') {
      const doc = { name, fields: request.postDataJSON().fields }
      if (documents.has(name) && url.searchParams.get('currentDocument.exists') === 'false')
        return route.fulfill({ status: 412, contentType: 'application/json', body: '{}' })
      documents.set(name, doc)
      return respond(doc)
    }
    if (/\/betaResults$/.test(name)) return respond({ documents: [...documents.values()].filter((doc) => doc.name.startsWith(`${name}/`)) })
    if (/\/betaPractice$/.test(name)) return respond({ documents: [] })
    if (documents.has(name)) return respond(documents.get(name))
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
  })
  await page.addInitScript(() => {
    localStorage.setItem('weekly-dictation-auth-v1', JSON.stringify({
      idToken: 'synthetic-intercepted-token', expiresAt: Date.now() + 3600_000,
      user: { uid: 'synthetic-parent', email: 'synthetic@example.invalid' },
    }))
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      cancel() {}, resume() {}, getVoices() { return [] },
      speak(u: SpeechSynthesisUtterance) { setTimeout(() => { u.onstart?.({} as SpeechSynthesisEvent); u.onend?.({} as SpeechSynthesisEvent) }, 0) },
    } })
  })
})

async function completeLanterns(page: Page) {
  await page.getByRole('button', { name: 'Ninja Skills', exact: true }).click()
  await page.getByRole('button', { name: 'Memory Lanterns', exact: true }).click()
  const cards = page.locator('.lg-memory-card')
  await expect(cards.first()).toBeVisible()
  const faces = await cards.locator('.lg-card-face b').allTextContents()
  const unique = [...new Set(faces)]
  for (const face of unique) {
    const indices = faces.flatMap((text, i) => text === face ? [i] : [])
    expect(indices).toHaveLength(2)
    await expect(cards.nth(indices[0])).toBeEnabled()
    await cards.nth(indices[0]).click()
    await cards.nth(indices[1]).click()
    if (face !== unique[unique.length - 1]) await expect(cards.nth(indices[0])).toHaveClass(/is-matched/)
  }
  await expect(page.getByRole('button', { name: 'Back to Ninja Skills', exact: true })).toBeVisible()
  return new Set(faces).size
}
async function results(page: Page) {
  return page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('family-beta-preview-results-v1:')).map(key => JSON.parse(localStorage.getItem(key)!)))
}

for (const [slug, grade, childId] of grades) {
  test(`${grade}: canonical root selects child and game result survives reload`, async ({ page }) => {
    await page.goto(`/?grade=${slug}`)
    await expect(page).toHaveURL(new RegExp(`/family-beta-preview\\?grade=${slug}$`))
    await expect(page.getByLabel('Child profile')).toHaveValue(childId)
    await expect(page.frameLocator('iframe').getByRole('heading', { name: /Ready for your next/ })).toBeVisible()
    const attempted = await completeLanterns(page)
    await page.getByRole('button', { name: 'Back to Ninja Skills', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Practice your Ninja Skills' })).toBeVisible()
    const saved = await results(page)
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ childId, grade, activity: 'Memory Lanterns', correct: attempted, attempted })
    await page.reload()
    await page.getByRole('button', { name: 'Progress', exact: true }).click()
    await expect(page.getByRole('cell', { name: `${attempted} / ${attempted}`, exact: true })).toBeVisible()
    expect(await results(page)).toEqual(saved)
  })
}

test('HTML-preserving alias completes and saves through the same package', async ({ page }) => {
  await page.goto('/alias/family-beta-preview.html?grade=grade5')
  const attempted = await completeLanterns(page)
  await page.getByRole('button', { name: 'Back to Ninja Skills', exact: true }).click()
  expect(await results(page)).toHaveLength(1)
  await page.reload()
  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await expect(page.getByRole('cell', { name: `${attempted} / ${attempted}`, exact: true })).toBeVisible()
})

test('missing child context keeps completed game open for retry', async ({ page }) => {
  await page.goto('/family-beta-preview.html?grade=grade5')
  await completeLanterns(page)
  const profile = await page.evaluate(() => sessionStorage.getItem('family-beta-preview-selected-v1'))
  await page.evaluate(() => sessionStorage.removeItem('family-beta-preview-selected-v1'))
  await page.getByRole('button', { name: 'Back to Ninja Skills', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Back to Ninja Skills', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Keep the game open')
  expect(await results(page)).toHaveLength(0)
  await page.evaluate(profile => sessionStorage.setItem('family-beta-preview-selected-v1', profile!), profile)
  await page.getByRole('button', { name: 'Back to Ninja Skills', exact: true }).click()
  expect(await results(page)).toHaveLength(1)
})

test('partial save retries the same attempt without a duplicate or closing early', async ({ page }) => {
  await page.goto('/alias/family-beta-preview.html?grade=grade5')
  await completeLanterns(page)
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    let failed = false
    Storage.prototype.setItem = function (key, data) {
      if (!failed && key.startsWith('family-beta-preview-results-v1:')) { failed = true; throw new Error('Synthetic interrupted ledger write') }
      return original.call(this, key, data)
    }
  })
  const done = page.getByRole('button', { name: 'Back to Ninja Skills', exact: true })
  await done.click()
  await expect(done).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Keep the game open')
  const pending = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('family-beta-preview-pending-v1:')).map(key => JSON.parse(localStorage.getItem(key)!)))
  expect(pending).toHaveLength(1)
  await done.click()
  await expect(page.getByRole('heading', { name: 'Practice your Ninja Skills' })).toBeVisible()
  const saved = await results(page)
  expect(saved).toHaveLength(1)
  expect(saved[0]).toEqual(pending[0])
})
