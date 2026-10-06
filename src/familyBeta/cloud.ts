import { firebaseConfig } from '../config.ts'
import { getIdToken } from '../firebaseClient.ts'
import { firebaseAppCheckHeaders } from '../firebaseSdkRuntime.ts'
import { documentValue, plainValue } from '../firestoreClient.ts'
import { isBetaResult, type BetaResult } from './model.ts'

type CloudDocument = { fields?: Record<string, Parameters<typeof plainValue>[0]> }
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
      signal: AbortSignal.timeout(20000),
    })
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
    async list(childId: string): Promise<BetaResult[]> {
      if (!/^[\w-]+$/.test(childId)) throw new Error('Invalid child scope.')
      const results: BetaResult[] = []
      let pageToken = ''
      do {
        const response = await request(
          `${childId}/betaResults?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`,
        )
        if (!response.ok) throw new Error(`Saved results could not be loaded (${response.status}).`)
        const body = (await response.json()) as { documents?: CloudDocument[]; nextPageToken?: string }
        for (const doc of body.documents || []) {
          const result = decode(doc)
          if (!isBetaResult(result) || result.childId !== childId) throw new Error('A saved result failed validation.')
          results.push(result)
        }
        pageToken = body.nextPageToken || ''
      } while (pageToken)
      return results
    },
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
