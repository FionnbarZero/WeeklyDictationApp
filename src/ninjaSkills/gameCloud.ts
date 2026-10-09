import { documentValue, plainValue, type FirestoreValue } from '../firestoreClient.ts'
import {
  GAME_PROGRESS_BYTES,
  gameCheckpointComplete,
  gameScopeKey,
  serializeGameRecord,
  validateGameCheckpoint,
  validateGameCompletion,
  validateGameRetirement,
  type GameCheckpoint,
  type GameCompletion,
  type GameRetirement,
  type GameScope,
} from './progress.ts'
import type { GameProgressRemote } from './progressSync.ts'

export const GAME_CLOUD_PAGE_SIZE = 10
const DOCUMENT_BYTES = GAME_PROGRESS_BYTES * 2 + 10000
type Kind = 'checkpoint' | 'retirement' | 'completion'
type Value = GameCheckpoint | GameRetirement | GameCompletion
type Document = { name: string; fields: Record<string, FirestoreValue>; updateTime: string }
const collections = {
  checkpoint: 'betaGameCheckpoints',
  retirement: 'betaGameRetirements',
  completion: 'betaGameCompletions',
} as const
function safeId(value: string) {
  if (typeof value !== 'string' || !/^[\w-]{1,300}$/.test(value)) throw new Error('Invalid game cloud scope.')
  return value
}
function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3}|\.\d{6}|\.\d{9})?Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19))
    throw new Error('Invalid game server timestamp.')
  return value
}
const scopeOf = (value: Value) => 'scope' in value ? value.scope : value.checkpoint.scope
async function scopeIdentity(scope: GameScope) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(gameScopeKey(scope)))
  return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join('')
}
async function retirementIdentity(scope: GameScope, runId: string) {
  return `${await scopeIdentity(scope)}_${safeId(runId)}`
}
async function identity(kind: Kind, value: Value) {
  if (kind === 'completion') return safeId((value as GameCompletion).result.id)
  if (kind === 'retirement') {
    const retirement = value as GameRetirement
    return retirementIdentity(retirement.scope, retirement.runId)
  }
  return scopeIdentity(scopeOf(value))
}

/** Concrete REST transport, intentionally NOT installed in the family runtime.
 * Activation requires discard/retirement, history-cache and production-policy
 * gates. No fallback to betaPractice or betaResults and no delete operation. */
export function createGameCloudRepository(options: {
  projectId: string; familyId: string; token: () => Promise<string>; stillOwner: () => boolean
  endpoint?: string; fetchImpl?: typeof fetch; appCheckHeaders?: () => Promise<Record<string, string>>
}) {
  const project = safeId(options.projectId), family = safeId(options.familyId)
  const endpoint = new URL(options.endpoint || 'https://firestore.googleapis.com')
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/' ||
    !(endpoint.origin === 'https://firestore.googleapis.com' ||
      (endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname))))
    throw new Error('Game transport requires Firestore or a local emulator endpoint.')
  const database = `projects/${project}/databases/(default)`
  const root = `${database}/documents`
  const children = `${root}/families/${family}/children`
  const parent = (childId: string) => `${children}/${safeId(childId)}`
  const name = (kind: Kind, childId: string, id: string) => `${parent(childId)}/${collections[kind]}/${safeId(id)}`
  function owned() {
    if (!options.stillOwner()) throw new Error('The game account changed. Device records were preserved.')
  }
  async function request(path: string, init: RequestInit = {}) {
    owned()
    const token = await options.token()
    owned()
    const appCheck = await options.appCheckHeaders?.()
    owned()
    const response = await (options.fetchImpl || fetch)(`${endpoint.origin}/v1/${path}`, {
      ...init, redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { ...appCheck, 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    })
    owned()
    return response
  }
  async function body(response: Response, maximum = DOCUMENT_BYTES): Promise<unknown> {
    if (!response.body) throw new Error('Missing game cloud response.')
    const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true })
    let bytes = 0, text = ''
    try {
      while (true) {
        owned()
        const part = await reader.read()
        owned()
        if (part.done) break
        bytes += part.value.byteLength
        if (bytes > maximum) throw new Error('Game cloud response exceeds its safe loading limit.')
        text += decoder.decode(part.value, { stream: true })
      }
      text += decoder.decode()
      if (!response.ok) {
        let detail = ''
        try {
          const parsed = JSON.parse(text) as { error?: { message?: unknown } }
          if (typeof parsed.error?.message === 'string') detail = ` ${parsed.error.message.slice(0, 300)}`
        } catch {
          // Keep non-JSON provider bodies out of user-facing persistence errors.
        }
        throw Object.assign(
          new Error(`Game cloud request failed (${response.status}).${detail} Saved work remains on this device.`),
          { status: response.status },
        )
      }
      return JSON.parse(text)
    } finally {
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  }
  function validate(kind: Kind, value: Value) {
    if (kind === 'checkpoint') return validateGameCheckpoint(value as GameCheckpoint)
    if (kind === 'retirement') return validateGameRetirement(value as GameRetirement)
    return validateGameCompletion(value as GameCompletion)
  }
  async function envelope(kind: Kind, value: Value) {
    validate(kind, value)
    const scope = scopeOf(value)
    const recordId = await identity(kind, value)
    if (kind === 'completion')
      return { schema: 1, kind, childId: scope.childId, grade: scope.grade, recordId, payload: serializeGameRecord(value) }
    return {
      schema: 1,
      kind,
      childId: scope.childId,
      grade: scope.grade,
      scopeId: await scopeIdentity(scope),
      runId: (value as GameCheckpoint | GameRetirement).runId,
      recordId,
      payload: serializeGameRecord(value),
    }
  }
  async function decode(kind: Kind, childId: string, raw: unknown, expectedName?: string) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid game cloud document.')
    const doc = raw as Document
    timestamp(doc.updateTime)
    if (!doc.fields || typeof doc.fields !== 'object' || Array.isArray(doc.fields)) throw new Error('Invalid game cloud fields.')
    const fields = Object.fromEntries(Object.entries(doc.fields).map(([key, value]) => [key, plainValue(value)]))
    if (typeof fields.payload !== 'string' || new TextEncoder().encode(fields.payload).length > GAME_PROGRESS_BYTES)
      throw new Error('Invalid game cloud payload.')
    const value = validate(kind, JSON.parse(fields.payload))
    const expected = await envelope(kind, value)
    if (expected.childId !== childId || serializeGameRecord(fields) !== serializeGameRecord(expected) ||
      doc.name !== name(kind, childId, expected.recordId) || (expectedName && doc.name !== expectedName))
      throw new Error('Game cloud identity or payload differs. Device records were preserved.')
    owned()
    return { value, version: doc.updateTime }
  }
  async function read(kind: Kind, childId: string, id: string) {
    const documentName = name(kind, childId, id)
    const raw = await body(await request(`${root}:batchGet`, { method: 'POST', body: JSON.stringify({ documents: [documentName] }) }))
    if (!Array.isArray(raw) || raw.length !== 1 || !raw[0] || typeof raw[0] !== 'object') throw new Error('Invalid game cloud readback.')
    const row = raw[0] as { found?: unknown; missing?: string; readTime?: string }
    const serverTime = new Date(timestamp(row.readTime)).toISOString()
    if (row.missing === documentName && !row.found) return null
    if (!row.found || row.missing) throw new Error('Invalid game cloud readback identity.')
    return { ...await decode(kind, childId, row.found, documentName), serverTime }
  }
  async function write(kind: Kind, value: Value, expectedVersion: string | null) {
    const fields = await envelope(kind, value)
    const path = name(kind, fields.childId, fields.recordId)
    const currentDocument =
      expectedVersion === null ? { exists: false } : { updateTime: timestamp(expectedVersion) }
    const response = await request(`${database}/documents:commit`, {
      method: 'POST',
      body: JSON.stringify({
        writes: [
          {
            update: {
              name: path,
              fields: Object.fromEntries(Object.entries(fields).map(([key, item]) => [key, documentValue(item)])),
            },
            currentDocument,
          },
        ],
      }),
    })
    // Identical authorized readback is the only acknowledgement, including a
    // duplicate create rejected by immutable rules or a lost prior response.
    if (!response.ok && ![400, 403, 409, 412].includes(response.status)) await body(response)
    await response.body?.cancel()
    const confirmed = await read(kind, fields.childId, fields.recordId)
    if (!confirmed || serializeGameRecord(confirmed.value) !== serializeGameRecord(value))
      throw new Error('Game cloud write was not confirmed exactly. Retry after reconciliation; no newer record was overwritten.')
    return confirmed
  }
  async function listPage(kind: Kind, childId: string, cursor = '') {
    const collection = `${parent(childId)}/${collections[kind]}`
    if (typeof cursor !== 'string' || cursor.length > 12000) throw new Error('Invalid game history cursor.')
    let token = ''
    if (cursor) {
      const parsed = JSON.parse(cursor)
      if (parsed?.collection !== collection || typeof parsed.token !== 'string' || !parsed.token || parsed.token.length > 8000 || Object.keys(parsed).length !== 2)
        throw new Error('Invalid game history cursor scope.')
      token = parsed.token
    }
    const raw = await body(await request(`${collection}?pageSize=${GAME_CLOUD_PAGE_SIZE}${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`), DOCUMENT_BYTES * GAME_CLOUD_PAGE_SIZE + 12000)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid game history page.')
    const page = raw as { documents?: unknown[]; nextPageToken?: string }
    const docs = page.documents ?? []
    if (!Array.isArray(docs) || docs.length > GAME_CLOUD_PAGE_SIZE ||
      (page.nextPageToken !== undefined && (typeof page.nextPageToken !== 'string' || page.nextPageToken.length > 8000)) ||
      (page.nextPageToken && page.nextPageToken === token)) throw new Error('Invalid or repeated game history page.')
    const values: Value[] = [], ids = new Set<string>()
    for (const doc of docs) {
      const { value } = await decode(kind, childId, doc)
      const id = await identity(kind, value)
      if (ids.has(id)) throw new Error('Duplicate game history record.')
      ids.add(id)
      values.push(value)
    }
    owned()
    return { values, nextPageToken: page.nextPageToken ? JSON.stringify({ collection, token: page.nextPageToken }) : '' }
  }
  const remote: GameProgressRemote = {
    async saveCompletion(value) { return (await write('completion', value, null)).value as GameCompletion },
    async readCompletion(childId, attemptId) { return (await read('completion', childId, safeId(attemptId)))?.value as GameCompletion | null ?? null },
    async readCheckpoint(scope) {
      gameScopeKey(scope)
      const id = await scopeIdentity(scope)
      const found = await read('checkpoint', scope.childId, id)
      if (found && gameScopeKey((found.value as GameCheckpoint).scope) !== gameScopeKey(scope))
        throw new Error('Game checkpoint scope differs.')
      return found as { value: GameCheckpoint; version: string; serverTime: string } | null
    },
    async writeCheckpoint(value, expectedVersion) {
      validateGameCheckpoint(value)
      if (await remote.readRetirement(value.scope, value.runId))
        throw new Error('This discarded game run cannot be uploaded again.')
      if (gameCheckpointComplete(value)) {
        const completion = await remote.readCompletion(value.scope.childId, value.attemptId)
        if (!completion || serializeGameRecord(completion.checkpoint) !== serializeGameRecord(value))
          throw new Error('Confirm the immutable completion before uploading its final checkpoint.')
      }
      const saved = await write('checkpoint', value, expectedVersion)
      return { value: saved.value as GameCheckpoint, version: saved.version }
    },
    async saveRetirement(value) {
      validateGameRetirement(value)
      return (await write('retirement', value, null)).value as GameRetirement
    },
    async readRetirement(scope, runId) {
      gameScopeKey(scope)
      const found = await read('retirement', scope.childId, await retirementIdentity(scope, runId))
      if (found) {
        const value = found.value as GameRetirement
        if (gameScopeKey(value.scope) !== gameScopeKey(scope) || value.runId !== runId)
          throw new Error('Game retirement scope differs.')
        return value
      }
      return null
    },
  }
  return {
    ...remote,
    async listCheckpointPage(childId: string, cursor = '') {
      const page = await listPage('checkpoint', childId, cursor)
      return { checkpoints: page.values as GameCheckpoint[], nextPageToken: page.nextPageToken }
    },
    async listRetirementPage(childId: string, cursor = '') {
      const page = await listPage('retirement', childId, cursor)
      return { retirements: page.values as GameRetirement[], nextPageToken: page.nextPageToken }
    },
    async listCompletionPage(childId: string, cursor = '') {
      const page = await listPage('completion', childId, cursor)
      return { completions: page.values as GameCompletion[], nextPageToken: page.nextPageToken }
    },
  }
}
