import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'

export const grades = [
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

export async function installFamilyFixtures(page: Page) {
  // This is the production-configured artifact. All external requests are
  // intercepted: synthetic account/storage fixtures never reach production.
  const documents = new Map<string, { name: string; fields: Record<string, unknown>; updateTime?: string }>()
  await page.context().route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://127.0.0.1:5193') return route.continue()
    const curriculum = url.pathname.match(/\/curriculum\/beta\/(kindergarten|grade2|grade5)\.json$/)
    if (curriculum)
      return route.fulfill({
        contentType: 'application/json',
        body: await readFile(`public/curriculum/beta/${curriculum[1]}.json`, 'utf8'),
      })
    if (url.hostname !== 'firestore.googleapis.com') return route.abort('blockedbyclient')
    const request = route.request()
    const base = 'projects/weeklydictationapp/databases/(default)/documents/'
    const name = url.pathname.split('/v1/')[1]
    const respond = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname.endsWith('/documents:commit')) {
      for (const write of request.postDataJSON().writes) {
        const update = write.update
        documents.set(update.name, { ...update, updateTime: new Date().toISOString() })
      }
      return respond({})
    }
    if (url.pathname.endsWith('/documents:batchGet')) {
      const names = request.postDataJSON().documents as string[]
      return respond(
        names.map((id) => {
          const data = id.endsWith('/users/synthetic-parent')
            ? { familyId: 'family-synthetic-parent', role: 'parent' }
            : { id: 'family-synthetic-parent', ownerParentId: 'synthetic-parent' }
          return { found: { name: id, fields: fields(data) } }
        }),
      )
    }
    if (name === `${base}families/family-synthetic-parent/children`) {
      return respond({
        documents: grades.map(([, grade, id]) => ({
          name: `${name}/${id}`,
          fields: fields({ id, nickname: grade, grade, active: true, schoolYear: '2026–2027' }),
        })),
      })
    }
    if (request.method() === 'PATCH') {
      const doc = { name, fields: request.postDataJSON().fields }
      if (documents.has(name) && url.searchParams.get('currentDocument.exists') === 'false')
        return route.fulfill({ status: 412, contentType: 'application/json', body: '{}' })
      documents.set(name, doc)
      return respond(doc)
    }
    if (/\/betaResults$/.test(name))
      return respond({ documents: [...documents.values()].filter((doc) => doc.name.startsWith(`${name}/`)) })
    if (/\/betaPractice$/.test(name))
      return respond({ documents: [...documents.values()].filter((doc) => doc.name.startsWith(`${name}/`)) })
    if (documents.has(name)) return respond(documents.get(name))
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
  })
  await page.addInitScript(() => {
    localStorage.setItem(
      'weekly-dictation-auth-v1',
      JSON.stringify({
        idToken: 'synthetic-intercepted-token',
        expiresAt: Date.now() + 3600_000,
        user: { uid: 'synthetic-parent', email: 'synthetic@example.invalid' },
      }),
    )
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
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException('Synthetic denied microphone', 'NotAllowedError')
        },
      },
    })
  })
}
