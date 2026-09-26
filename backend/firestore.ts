import { importLogIdFor, isDuplicateOnlyBatch, type ExistingDatasetReference, type ImportBatchOutcome } from '../src/slidesImporter.ts'

type FetchLike = typeof fetch
type FirestoreValue = Record<string, unknown>

export async function firestoreAccessToken(fetchImpl: FetchLike = fetch) {
  const configured = process.env.FIRESTORE_ACCESS_TOKEN
  if (configured) return configured
  const response = await fetchImpl('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', { headers: { 'Metadata-Flavor': 'Google' } })
  const body = await response.json().catch(() => ({})) as { access_token?: string; error?: string }
  if (!response.ok || !body.access_token) throw new Error(`Cloud Run service-account authorization failed: ${body.error || response.statusText}`)
  return body.access_token
}

function documentValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  if (typeof value === 'string') return { stringValue: value }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(documentValue) } }
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, documentValue(item)])) } }
}

function fields(value: Record<string, unknown>) { return { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, documentValue(item)])) } }
function documentName(projectId: string, path: string) { return `projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${path.split('/').map(encodeURIComponent).join('/')}` }
function firestoreUrl(projectId: string, suffix: string) { return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents${suffix}` }

async function responseBody(response: Response) { return response.json().catch(() => ({})) as Promise<Record<string, unknown>> }

export async function listDatasetIds(projectId: string, accessToken: string, fetchImpl: FetchLike = fetch) {
  return (await listDatasetReferences(projectId, accessToken, fetchImpl)).map((reference) => reference.datasetId)
}

export async function listDatasetReferences(projectId: string, accessToken: string, fetchImpl: FetchLike = fetch): Promise<Array<Exclude<ExistingDatasetReference, string>>> {
  const references: Array<Exclude<ExistingDatasetReference, string>> = []
  let pageToken = ''
  do {
    const query = new URLSearchParams({ pageSize: '300' }); if (pageToken) query.set('pageToken', pageToken)
    const response = await fetchImpl(`${firestoreUrl(projectId, '/datasets')}?${query}`, { headers: { Authorization: `Bearer ${accessToken}` } })
    const body = await responseBody(response)
    if (!response.ok) throw new Error(`Firestore read failed: ${typeof body.error === 'object' && body.error && 'message' in body.error ? body.error.message : response.statusText}`)
    for (const document of Array.isArray(body.documents) ? body.documents : []) {
      if (!document || typeof document !== 'object' || !('name' in document) || typeof document.name !== 'string') continue
      const datasetId = document.name.split('/').pop() || ''
      if (!datasetId) continue
      const storedFields = 'fields' in document && document.fields && typeof document.fields === 'object' ? document.fields as Record<string, { stringValue?: unknown }> : {}
      const stringField = (name: string) => typeof storedFields[name]?.stringValue === 'string' ? storedFields[name].stringValue as string : undefined
      references.push({
        datasetId,
        contentFingerprint: stringField('contentFingerprint'),
        candidateStatus: stringField('candidateStatus') as Exclude<ExistingDatasetReference, string>['candidateStatus'],
        instructionalRole: stringField('instructionalRole') as Exclude<ExistingDatasetReference, string>['instructionalRole'],
      })
    }
    pageToken = typeof body.nextPageToken === 'string' ? body.nextPageToken : ''
  } while (pageToken)
  return references
}

function writesForBatch(batch: ImportBatchOutcome, projectId: string, importedAt: string) {
  const writes: Array<Record<string, unknown>> = []
  for (const dataset of batch.datasets) {
    const { words, ...metadata } = dataset
    const outcome = batch.outcomes.find((item) => item.datasetId === dataset.id && (item.status === 'imported' || item.status === 'writing-workshop'))
    const canonicalMetadata = outcome?.contentFingerprint ? { contentFingerprint: outcome.contentFingerprint, candidateStatus: outcome.candidateStatus, instructionalRole: outcome.instructionalRole } : {}
    writes.push({ update: { name: documentName(projectId, `datasets/${dataset.id}`), ...fields({ ...metadata, ...canonicalMetadata, importedAt }) } })
    for (const word of words) writes.push({ update: { name: documentName(projectId, `datasets/${dataset.id}/words/${word.id}`), ...fields(word) } })
  }
  for (const outcome of batch.outcomes.filter((item) => item.status === 'confirmation' && item.refreshExistingMetadata && item.datasetId)) {
    writes.push({
      update: {
        name: documentName(projectId, `datasets/${outcome.datasetId}`),
        ...fields({
          contentFingerprint: outcome.contentFingerprint,
          candidateStatus: outcome.candidateStatus,
          instructionalRole: outcome.instructionalRole,
          confirmationSourceSlideId: outcome.sourceSlideId,
          confirmedAt: importedAt,
        }),
      },
      updateMask: { fieldPaths: ['contentFingerprint', 'candidateStatus', 'instructionalRole', 'confirmationSourceSlideId', 'confirmedAt'] },
    })
  }
  for (const outcome of batch.outcomes) {
    writes.push({ update: { name: documentName(projectId, `importLogs/${importLogIdFor(outcome)}`), ...fields({ datasetId: outcome.datasetId, sourceDeckId: batch.datasets.find((dataset) => dataset.id === outcome.datasetId)?.sourceDeckId || outcome.dataset?.sourceDeckId, sourceSlideId: outcome.sourceSlideId, status: outcome.status, message: outcome.message, contentFingerprint: outcome.contentFingerprint, candidateStatus: outcome.candidateStatus, instructionalRole: outcome.instructionalRole, createdAt: importedAt }) } })
  }
  return writes
}

export async function writeImportBatch(projectId: string, accessToken: string, batch: ImportBatchOutcome, fetchImpl: FetchLike = fetch, importedAt = new Date().toISOString()) {
  if (batch.status === 'error' && !isDuplicateOnlyBatch(batch)) throw new Error('Firestore write refused because the deck produced no valid datasets.')
  const writes = writesForBatch(batch, projectId, importedAt)
  let written = 0
  for (let offset = 0; offset < writes.length; offset += 450) {
    const response = await fetchImpl(`${firestoreUrl(projectId, '')}:commit`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: writes.slice(offset, offset + 450) }) })
    const body = await responseBody(response)
    if (!response.ok) throw new Error(`Firestore write failed: ${typeof body.error === 'object' && body.error && 'message' in body.error ? body.error.message : response.statusText}`)
    written += Math.min(450, writes.length - offset)
  }
  return { written, datasetCount: batch.datasets.length, documentCount: writes.length }
}
