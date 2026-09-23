import { APP_VERSION, DEFAULT_TIME_ZONE, firebaseConfig, firebaseConfigReady } from './config'
import { getIdToken, type AuthUser } from './firebaseClient'
import type { Dataset, DatasetScore, Word, WordResult } from './domain'

export type ParentRecord = { id: string; familyId: string; email: string; role: 'parent'; createdAt: string; updatedAt: string }
export type FamilyRecord = { id: string; ownerParentId: string; createdAt: string; updatedAt: string }
export type ChildProfile = { id: string; nickname: string; grade: string; schoolYear: string; active: boolean; gradeEffectiveDate: string; createdAt: string; updatedAt: string }
export type CloudSession = { id: string; childId: string; familyId: string; sessionDate: string; localDate: string; startedAt: string; completedAt?: string; primaryPhase: 'acquisition' | 'test-review'; datasetId: string; warmupOnly?: boolean; status: 'in_progress' | 'completed' | 'abandoned'; warmupStatus: 'in_progress' | 'completed' | 'not_started'; applicationVersion: string }
export type CloudAttempt = { id: string; sessionId: string; wordId: string; sourceDatasetId: string; phase: 'warmup' | 'acquisition' | 'test-review'; correct: boolean; reviewedAt: string; completionStatus: 'temporary' | 'complete' }
export type ImportLog = { id: string; datasetId?: string; sourceDeckId: string; sourceSlideId?: string; status: 'imported' | 'duplicate' | 'writing-workshop' | 'error'; message: string; createdAt: string }

type FirestoreDocument = { name?: string; fields?: Record<string, FirestoreValue>; createTime?: string; updateTime?: string }
type FirestoreValue = { stringValue?: string; booleanValue?: boolean; integerValue?: string; doubleValue?: number; timestampValue?: string; arrayValue?: { values?: FirestoreValue[] }; mapValue?: { fields?: Record<string, FirestoreValue> } }

function firestoreBase() { return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/(default)/documents` }
function documentValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { mapValue: { fields: {} } }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  if (typeof value === 'string') return { stringValue: value }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(documentValue) } }
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, documentValue(item)])) } }
}
function plainValue(value: FirestoreValue): unknown {
  if ('stringValue' in value) return value.stringValue
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return value.doubleValue
  if ('timestampValue' in value) return value.timestampValue
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(plainValue)
  return Object.fromEntries(Object.entries(value.mapValue?.fields || {}).map(([key, item]) => [key, plainValue(item)]))
}
function encodeFields(value: Record<string, unknown>) { return { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, documentValue(item)])) } }
function decodeDocument<T>(document: FirestoreDocument): T { return Object.fromEntries(Object.entries(document.fields || {}).map(([key, item]) => [key, plainValue(item)])) as T }
function docPath(parts: string[]) { return parts.map((part) => encodeURIComponent(part)).join('/') }

async function firestoreRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!firebaseConfigReady) throw new Error('Firebase configuration is missing.')
  const token = await getIdToken()
  const response = await fetch(`${firestoreBase()}/${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers || {}) } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`Firestore error: ${body?.error?.message || response.statusText}`)
  return body as T
}

async function getDoc<T>(path: string) {
  try {
    return decodeDocument<T>(await firestoreRequest<FirestoreDocument>(path))
  } catch (error) {
    // Firestore REST can report a missing document as either NOT_FOUND or
    // a human-readable "Document ... not found" message. A missing user,
    // family, or child is expected during first-time account setup.
    if (/not[ _-]?found/i.test(String(error))) return null
    throw error
  }
}
async function putDoc(path: string, value: Record<string, unknown>) { await firestoreRequest(path, { method: 'PATCH', body: JSON.stringify(encodeFields(value)) }) }
async function listDocs<T>(path: string) { const response = await firestoreRequest<{ documents?: FirestoreDocument[] }>(`${path}?pageSize=300`); return (response.documents || []).map((document) => ({ id: document.name?.split('/').pop() || '', ...decodeDocument<T>(document) })) as Array<T & { id: string }> }

export async function ensureParentFamily(user: AuthUser): Promise<{ parent: ParentRecord; family: FamilyRecord }> {
  const now = new Date().toISOString(); const familyId = `family-${user.uid}`
  const existing = await getDoc<ParentRecord>(docPath(['users', user.uid]))
  const parent: ParentRecord = { id: user.uid, familyId: existing?.familyId || familyId, email: user.email, role: 'parent', createdAt: existing?.createdAt || now, updatedAt: now }
  const family: FamilyRecord = { id: parent.familyId, ownerParentId: user.uid, createdAt: existing?.createdAt || now, updatedAt: now }
  await putDoc(docPath(['users', user.uid]), parent); await putDoc(docPath(['families', family.id]), family)
  return { parent, family }
}

export async function listChildren(familyId: string) { return listDocs<ChildProfile>(docPath(['families', familyId, 'children'])) }
export async function createChild(familyId: string, input: Pick<ChildProfile, 'nickname' | 'grade' | 'schoolYear'>) { const now = new Date().toISOString(); const id = `child-${crypto.randomUUID()}`; const child: ChildProfile = { id, ...input, active: true, gradeEffectiveDate: now.slice(0, 10), createdAt: now, updatedAt: now }; await putDoc(docPath(['families', familyId, 'children', id]), child); return child }
export async function updateChild(familyId: string, childId: string, patch: Partial<Pick<ChildProfile, 'nickname' | 'grade' | 'schoolYear' | 'active' | 'gradeEffectiveDate'>>) { const current = await getDoc<ChildProfile>(docPath(['families', familyId, 'children', childId])); if (!current) throw new Error('Child profile was not found.'); const child = { ...current, ...patch, updatedAt: new Date().toISOString() }; await putDoc(docPath(['families', familyId, 'children', childId]), child); return child }

export async function listDatasets() { return listDocs<Dataset>(docPath(['datasets'])) }
export async function listDatasetWords(datasetId: string) { return listDocs<Word>(docPath(['datasets', datasetId, 'words'])) }
export async function saveDataset(dataset: Dataset) { await putDoc(docPath(['datasets', dataset.id]), dataset); await Promise.all(dataset.words.map((word) => putDoc(docPath(['datasets', dataset.id, 'words', word.id]), word))) }
export async function writeImportLog(log: ImportLog) { await putDoc(docPath(['importLogs', log.id]), log) }

export async function listSessions(familyId: string, childId: string) { return listDocs<CloudSession>(docPath(['families', familyId, 'children', childId, 'sessions'])) }
export async function listAttempts(familyId: string, childId: string, sessionId: string) { return listDocs<CloudAttempt>(docPath(['families', familyId, 'children', childId, 'sessions', sessionId, 'attempts'])) }
export async function listScores(familyId: string, childId: string) { return listDocs<DatasetScore>(docPath(['families', familyId, 'children', childId, 'scores'])) }
export async function abandonSession(familyId: string, childId: string, session: CloudSession) { await putDoc(docPath(['families', familyId, 'children', childId, 'sessions', session.id]), { ...session, status: 'abandoned', completedAt: new Date().toISOString() }); const attempts = await listAttempts(familyId, childId, session.id); await Promise.all(attempts.filter((attempt) => attempt.completionStatus === 'temporary').map((attempt) => deleteDoc(docPath(['families', familyId, 'children', childId, 'sessions', session.id, 'attempts', attempt.id])))) }
export async function deleteDoc(path: string) { await firestoreRequest(path, { method: 'DELETE' }) }

export async function startCloudSession(familyId: string, childId: string, session: Omit<CloudSession, 'familyId' | 'status' | 'applicationVersion'>) { const value: CloudSession = { ...session, familyId, status: 'in_progress', applicationVersion: APP_VERSION }; await putDoc(docPath(['families', familyId, 'children', childId, 'sessions', session.id]), value); return value }
export async function updateCloudSession(familyId: string, childId: string, session: CloudSession, patch: Partial<CloudSession>) { const value = { ...session, ...patch }; await putDoc(docPath(['families', familyId, 'children', childId, 'sessions', session.id]), value); return value }
export async function saveCloudAttempt(familyId: string, childId: string, sessionId: string, attempt: CloudAttempt) { await putDoc(docPath(['families', familyId, 'children', childId, 'sessions', sessionId, 'attempts', attempt.id]), attempt) }
export async function completeCloudSession(familyId: string, childId: string, session: CloudSession, attempts: CloudAttempt[], scores: DatasetScore[]) { await putDoc(docPath(['families', familyId, 'children', childId, 'sessions', session.id]), { ...session, status: 'completed', warmupStatus: 'completed', completedAt: new Date().toISOString() }); await Promise.all(attempts.map((attempt) => saveCloudAttempt(familyId, childId, session.id, { ...attempt, completionStatus: 'complete' }))); await Promise.all(scores.map((score) => putDoc(docPath(['families', familyId, 'children', childId, 'scores', score.id]), score))) }

export function cloudDataToAppState(datasets: Dataset[], scores: DatasetScore[], sessions: CloudSession[], attempts: CloudAttempt[], childId: string) {
  const results: WordResult[] = attempts.map((attempt) => ({ id: attempt.id, childId, datasetId: attempt.sourceDatasetId, datasetDateRange: datasets.find((dataset) => dataset.id === attempt.sourceDatasetId)?.dateRange || 'Unknown date range', wordId: attempt.wordId, grade: datasets.find((dataset) => dataset.id === attempt.sourceDatasetId)?.grade || 'Grade 2', phase: attempt.phase, sessionId: attempt.sessionId, sessionDate: attempt.reviewedAt.slice(0, 10), completedAt: attempt.reviewedAt, correct: attempt.correct, revealMethod: 'timer', scored: attempt.completionStatus === 'complete', completeSourceDatasetReviewed: attempt.completionStatus === 'complete' }))
  const warmupSessions = sessions.map((session) => {
    const warmup = attempts.filter((attempt) => attempt.sessionId === session.id && attempt.phase === 'warmup' && attempt.completionStatus === 'complete')
    const datasetIds = [...new Set(warmup.map((attempt) => attempt.sourceDatasetId))]
    const completeDatasetIds = datasetIds.filter((datasetId) => warmup.filter((attempt) => attempt.sourceDatasetId === datasetId).length === (datasets.find((dataset) => dataset.id === datasetId)?.words.length || 0))
    return { id: `${session.id}-warmup`, childId, sessionId: session.id, sessionDate: session.localDate, completedAt: warmup.length ? warmup[ warmup.length - 1 ].reviewedAt : undefined, wordIds: warmup.map((attempt) => attempt.wordId), datasetIds, completeDatasetIds, complete: Boolean(warmup.length) }
  }).filter((session) => session.complete)
  return { version: 2 as const, datasets, results, scores, warmupSessions, completedSessions: sessions.filter((session) => session.status === 'completed' && !session.warmupOnly).map((session) => ({ id: session.id, childId, sessionDate: session.localDate, primaryDatasetId: session.datasetId, primaryPhase: session.primaryPhase, complete: true as const })), legacyRecords: [] }
}

export function cloudSessionFor(familyId: string, childId: string, id: string, datasetId: string, primaryPhase: 'acquisition' | 'test-review', warmupStatus: CloudSession['warmupStatus'] = 'in_progress'): Omit<CloudSession, 'familyId' | 'status' | 'applicationVersion'> { const now = new Date(); return { id, childId, sessionDate: now.toISOString(), localDate: new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TIME_ZONE }).format(now), startedAt: now.toISOString(), primaryPhase, datasetId, warmupOnly: false, warmupStatus } }
