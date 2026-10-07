import { firebaseConfig } from '../config.ts'
import { getIdToken } from '../firebaseClient.ts'
import { firebaseAppCheckHeaders } from '../firebaseSdkRuntime.ts'
import { documentValue, plainValue } from '../firestoreClient.ts'
import { type BetaResult, isBetaResult } from './model.ts'

type CloudDocument = { fields?: Record<string, Parameters<typeof plainValue>[0]> }
export const RESULT_PAGE_SIZE = 50
export type ResultPage = { results: BetaResult[]; nextPageToken: string }
export function createResultRepository(options: {
  projectId: string
  familyId: string
  token: () => Promise<string>
  endpoint?: string
  fetchImpl?: typeof fetch
  appCheckHeaders?: () => Promise<Record<string, string>>
}) {
  if (!/^[\w-]+$/.test(options.familyId) || !/^[\w-]+$/.test(options.projectId))
    throw new Error('Invalid result scope.')
  const base = `${options.endpoint || 'https://firestore.googleapis.com'}/v1/projects/${options.projectId}/databases/(default)/documents/families/${options.familyId}/children`
  const fetchImpl = options.fetchImpl || fetch
  const decode = (doc: CloudDocument) =>
    Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, plainValue(v)]))
  const request = async (path: string, init: RequestInit = {}) =>
    fetchImpl(`${base}/${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await options.token()}`,
        ...(await options.appCheckHeaders?.()),
      },
      signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
    })
  async function listPage(childId: string, pageToken = '', signal?: AbortSignal): Promise<ResultPage> {
    if (!/^[\w-]+$/.test(childId)) throw new Error('Invalid child scope.')
    if (typeof pageToken !== 'string' || pageToken.length > 1024) throw new Error('Invalid history cursor.')
    let cursor: { childId: string; familyId: string; completedAt: string; id: string } | null = null
    if (pageToken) {
      try {
        cursor = JSON.parse(pageToken)
      } catch {
        throw new Error('Invalid history cursor.')
      }
      if (
        !cursor ||
        cursor.childId !== childId ||
        cursor.familyId !== options.familyId ||
        typeof cursor.id !== 'string' ||
        !/^[\w-]{1,160}$/.test(cursor.id) ||
        typeof cursor.completedAt !== 'string' ||
        !Number.isFinite(Date.parse(cursor.completedAt)) ||
        new Date(cursor.completedAt).toISOString() !== cursor.completedAt
      )
        throw new Error('Invalid history cursor scope.')
    }
    const parent = `projects/${options.projectId}/databases/(default)/documents/families/${options.familyId}/children/${childId}`
    const response = await request(`${childId}:runQuery`, {
      method: 'POST',
      signal,
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'betaResults' }],
          orderBy: [
            { field: { fieldPath: 'completedAt' }, direction: 'DESCENDING' },
            { field: { fieldPath: '__name__' }, direction: 'DESCENDING' },
          ],
          limit: RESULT_PAGE_SIZE + 1,
          ...(cursor
            ? {
                startAt: {
                  before: false,
                  values: [
                    { stringValue: cursor.completedAt },
                    { referenceValue: `${parent}/betaResults/${cursor.id}` },
                  ],
                },
              }
            : {}),
        },
      }),
    })
    if (!response.ok) throw new Error(`Saved results could not be loaded (${response.status}).`)
    const raw = await response.text()
    if (raw.length > 2_000_000) throw new Error('The history page exceeds the safe loading limit.')
    const body = JSON.parse(raw) as { document?: CloudDocument; readTime?: string }[]
    if (
      !Array.isArray(body) ||
      body.length > RESULT_PAGE_SIZE + 2 ||
      body.some(
        (row) =>
          !row || typeof row !== 'object' || Array.isArray(row) || (!row.document && typeof row.readTime !== 'string'),
      )
    )
      throw new Error('The history page failed validation.')
    const documents = body.flatMap((row) => (row.document ? [row.document] : []))
    if (documents.length > RESULT_PAGE_SIZE + 1) throw new Error('The history page failed validation.')
    const results: BetaResult[] = []
    const ids = new Set<string>()
    for (const doc of documents) {
      const result = decode(doc)
      if (!isBetaResult(result) || result.childId !== childId || ids.has(result.id))
        throw new Error('A saved result failed validation.')
      ids.add(result.id)
      results.push(result)
    }
    const visible = results.slice(0, RESULT_PAGE_SIZE)
    const last = visible[visible.length - 1]
    return {
      results: visible,
      nextPageToken:
        results.length > RESULT_PAGE_SIZE && last
          ? JSON.stringify({ childId, familyId: options.familyId, completedAt: last.completedAt, id: last.id })
          : '',
    }
  }
  return {
    async save(result: BetaResult) {
      if (!isBetaResult(result)) throw new Error('Invalid completed result.')
      const path = `${result.childId}/betaResults/${result.id}`
      const fields = Object.fromEntries(Object.entries(result).map(([k, v]) => [k, documentValue(v)]))
      const response = await request(`${path}?currentDocument.exists=false`, {
        method: 'PATCH',
        body: JSON.stringify({ fields }),
      })
      // Immutable rules can reject a duplicate PATCH before evaluating the precondition.
      // Only an identical authorized readback may acknowledge that retry.
      if (!response.ok && ![403, 409, 412].includes(response.status))
        throw new Error(`Score upload failed (${response.status}). Your result remains queued on this device.`)
      const readback = await request(path)
      if (!readback.ok) throw new Error('The uploaded score could not be confirmed. Please retry.')
      const saved = decode(await readback.json())
      if (
        !isBetaResult(saved) ||
        Object.keys(result).some(
          (key) => JSON.stringify(saved[key as keyof BetaResult]) !== JSON.stringify(result[key as keyof BetaResult]),
        )
      )
        throw new Error('Saved result differs from this attempt. No score was overwritten.')
    },
    // Compatibility helper: recent page only. Explicit history browsing uses listPage.
    async list(childId: string): Promise<BetaResult[]> {
      return (await listPage(childId)).results
    },
    listPage,
  }
}

export function familyResultRepository(familyId: string) {
  return createResultRepository({
    projectId: firebaseConfig.projectId,
    familyId,
    token: getIdToken,
    appCheckHeaders: firebaseAppCheckHeaders,
  })
}
