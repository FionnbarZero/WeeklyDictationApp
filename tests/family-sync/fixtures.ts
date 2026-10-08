import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import type { AppState } from '../../src/domain.ts'

/** Serialized by Playwright; keep this reader self-contained. */
export function readGrade2Workspace(childId = 'synthetic-g2'): AppState | null {
  const protectedRaw = localStorage.getItem(`family-beta-activity:${childId}:lesson-workspace-v1`)
  if (protectedRaw === null)
    return JSON.parse(localStorage.getItem(`family-beta-activity:${childId}:weekly-dictation-state-v2`) || 'null')
  const records = JSON.parse(protectedRaw).records as Record<string, string>
  const stateRaw = records['weekly-dictation-state-v2']
  if (stateRaw) return JSON.parse(stateRaw)
  const history = records['weekly-dictation-history-v1']
  const checkpoint = records['weekly-dictation-checkpoint-v1']
  if (!history || !checkpoint) return null
  const values = { ...JSON.parse(history).values, ...JSON.parse(checkpoint).values } as Record<string, unknown>
  const activities = Object.keys(records)
    .filter((item) => item.startsWith('weekly-dictation-checkpoint-v1:activity:'))
    .map((key) => JSON.parse(records[key]).values as Record<string, unknown>)
  for (const field of [
    'acquisitionProgressions',
    'acquisitionProgressEnvelopes',
    'acquisitionTransitionReceipts',
    'acquisitionPendingCheckpoints',
  ])
    values[field] = activities.flatMap((activity) => (Array.isArray(activity[field]) ? activity[field] : []))
  return values as AppState
}

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

export type SyntheticFamilyDocuments = Map<
  string,
  { name: string; fields: Record<string, unknown>; updateTime?: string }
>

export async function installFamilyFixtures(page: Page, documents: SyntheticFamilyDocuments = new Map()) {
  // This is the production-configured artifact. All external requests are
  // intercepted: synthetic account/storage fixtures never reach production.
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
    if (name.endsWith(':runQuery')) {
      const query = request.postDataJSON().structuredQuery
      if (query.from?.[0]?.collectionId !== 'betaResults') throw new Error('Unexpected synthetic query')
      const prefix = `${name.slice(0, -':runQuery'.length)}/betaResults/`
      const ordered = [...documents.values()]
        .filter((doc) => doc.name.startsWith(prefix))
        .sort((a, b) => {
          const at = (a.fields.completedAt as { stringValue: string }).stringValue
          const bt = (b.fields.completedAt as { stringValue: string }).stringValue
          return bt.localeCompare(at) || b.name.localeCompare(a.name)
        })
      const after = query.startAt?.values
      const selected = after
        ? ordered.filter((doc) => {
            const at = (doc.fields.completedAt as { stringValue: string }).stringValue
            return at < after[0].stringValue || (at === after[0].stringValue && doc.name < after[1].referenceValue)
          })
        : ordered
      return respond(selected.slice(0, query.limit).map((document) => ({ document })))
    }
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
    if (!sessionStorage.getItem('synthetic-auth-initialized'))
      localStorage.setItem(
        'weekly-dictation-auth-v1',
        JSON.stringify({
          idToken: 'synthetic-intercepted-token',
          expiresAt: Date.now() + 3600_000,
          user: { uid: 'synthetic-parent', email: 'synthetic@example.invalid' },
        }),
      )
    sessionStorage.setItem('synthetic-auth-initialized', 'true')
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
