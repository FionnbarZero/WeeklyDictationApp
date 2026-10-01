import { APP_VERSION, DEFAULT_TIME_ZONE, firebaseConfig, firebaseConfigReady } from './config.ts'
import { getIdToken, type AuthUser } from './firebaseClient.ts'
import { deriveChildWordStates, normalizeDistractorTargetObservation, type AcquisitionProgressRecord, type AppState, type ChildWordState, type Dataset, type DatasetScore, type DistractorTargetObservation, type MonthlyRotationScore, type Word, type WordResult } from './domain.ts'
import type { AcquisitionCheckpoint, AcquisitionProgressEnvelope, AcquisitionTransitionReceipt } from './acquisition/persistence/contracts.ts'
import type { VersionedChildMasteryState, WarmupAttempt, WarmupGraphPoint, WarmupTransition, WarmupTransitionReceipt, WarmupVisit } from './warmup/visits/contracts.ts'
import type { CloudWarmupQueueEntry, CloudWarmupRotation, CloudWarmupVisit, WarmupCloudRecordWrite } from './persistence/warmup/cloudContracts.ts'
import { buildWarmupSeedRecordWrites, buildWarmupTransitionRecordWrites, reconcileWarmupSeedRecord, warmupReceiptMatchesTransition } from './persistence/warmup/cloudWrites.ts'
import { migrateAcquisitionProgress } from './acquisition/persistence/migration.ts'
import { acquisitionPersistenceContext } from './application/acquisitionPersistence.ts'
import { practiceProfileForGrade } from './practice/profiles/registry.ts'
import { isCanonicalDataset } from './slidesImporter.ts'
import { isTestReviewCycle, storedTestReviewCycle, type TestReviewCycle } from './testReview/contracts.ts'

export type ParentRecord = { id: string; familyId: string; email: string; role: 'parent'; createdAt: string; updatedAt: string }
export type FamilyRecord = { id: string; ownerParentId: string; createdAt: string; updatedAt: string }
export type ChildProfile = { id: string; nickname: string; grade: string; schoolYear: string; active: boolean; gradeEffectiveDate: string; createdAt: string; updatedAt: string }
export type CloudSession = { id: string; childId: string; familyId: string; sessionDate: string; localDate: string; startedAt: string; completedAt?: string; primaryPhase: 'acquisition' | 'test-review'; datasetId: string; datasetIds?: string[]; reviewGroupId?: string; reviewCycle?: TestReviewCycle; warmupOnly?: boolean; status: 'in_progress' | 'partial' | 'completed' | 'skipped' | 'abandoned'; warmupStatus: 'in_progress' | 'partial' | 'completed' | 'skipped' | 'not_started'; applicationVersion: string }
export type CloudAttempt = { id: string; sessionId: string; wordId: string; sourceDatasetId: string; phase: 'warmup' | 'acquisition' | 'test-review'; reviewCycle?: TestReviewCycle; correct: boolean; reviewedAt: string; completionStatus: 'temporary' | 'complete'; countsTowardWeeklyScore?: boolean; acquisitionKind?: string }
export type CloudAdaptiveState = { childId: string; childWordStates: ChildWordState[]; monthlyRotationScores: MonthlyRotationScore[]; rotationCycleId: number; updatedAt: string }
export type { CloudWarmupRotation } from './persistence/warmup/cloudContracts.ts'

type FirestoreDocument = { name?: string; fields?: Record<string, FirestoreValue>; createTime?: string; updateTime?: string }
type FirestoreValue = { stringValue?: string; booleanValue?: boolean; integerValue?: string; doubleValue?: number; timestampValue?: string; arrayValue?: { values?: FirestoreValue[] }; mapValue?: { fields?: Record<string, FirestoreValue> } }

function firestoreBase() { return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/(default)/documents` }
function firestoreDatabaseBase() { return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/(default)` }
function documentValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { mapValue: { fields: {} } }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  if (typeof value === 'string') return { stringValue: value }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(documentValue) } }
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, documentValue(item)])) } }
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
function encodeFields(value: Record<string, unknown>) { return { fields: Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, documentValue(item)])) } }
function decodeDocument<T>(document: FirestoreDocument): T { return Object.fromEntries(Object.entries(document.fields || {}).map(([key, item]) => [key, plainValue(item)])) as T }
function docPath(parts: string[]) { return parts.map((part) => encodeURIComponent(part)).join('/') }

async function authorizedFirestoreRequest<T>(url: string, init?: RequestInit): Promise<T> {
  if (!firebaseConfigReady) throw new Error('Firebase configuration is missing.')
  const token = await getIdToken()
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers || {}) } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`Firestore error: ${body?.error?.message || response.statusText}`)
  return body as T
}

async function firestoreRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return authorizedFirestoreRequest<T>(`${firestoreBase()}/${path}`, init)
}

async function firestoreCommit(writes: unknown[]) {
  return authorizedFirestoreRequest(`${firestoreDatabaseBase()}/documents:commit`, { method: 'POST', body: JSON.stringify({ writes }) })
}

function fullDocumentName(parts: string[]) {
  return `projects/${firebaseConfig.projectId}/databases/(default)/documents/${parts.join('/')}`
}

function updateWrite(parts: string[], value: Record<string, unknown>, currentDocument?: Record<string, unknown>) {
  return {
    update: { name: fullDocumentName(parts), ...encodeFields(value) },
    ...(currentDocument ? { currentDocument } : {}),
  }
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
async function listDocs<T>(path: string) {
  const documents: FirestoreDocument[] = []
  let pageToken = ''
  do {
    const query = new URLSearchParams({ pageSize: '300' }); if (pageToken) query.set('pageToken', pageToken)
    const response = await firestoreRequest<{ documents?: FirestoreDocument[]; nextPageToken?: string }>(`${path}?${query}`)
    documents.push(...(response.documents || []))
    pageToken = response.nextPageToken || ''
  } while (pageToken)
  return documents.map((document) => ({ id: document.name?.split('/').pop() || '', ...decodeDocument<T>(document) })) as Array<T & { id: string }>
}

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
// Shared dataset and import-log writes are intentionally server-only. The browser
// client may read shared datasets, but never exposes those write operations.

export async function listSessions(familyId: string, childId: string) { return listDocs<CloudSession>(docPath(['families', familyId, 'children', childId, 'sessions'])) }
export async function listAttempts(familyId: string, childId: string, sessionId: string) { return listDocs<CloudAttempt>(docPath(['families', familyId, 'children', childId, 'sessions', sessionId, 'attempts'])) }
export async function listScores(familyId: string, childId: string) { return listDocs<DatasetScore>(docPath(['families', familyId, 'children', childId, 'scores'])) }
export async function listAcquisitionProgressions(familyId: string, childId: string) { return listDocs<AcquisitionProgressRecord | AcquisitionProgressEnvelope<Word>>(docPath(['families', familyId, 'children', childId, 'acquisitionProgressions'])) }
export async function listDistractorTargetObservations(familyId: string, childId: string) { return listDocs<DistractorTargetObservation>(docPath(['families', familyId, 'children', childId, 'dtObservations'])) }
export async function listWarmupVisits(familyId: string, childId: string) { return listDocs<CloudWarmupVisit>(docPath(['families', familyId, 'children', childId, 'warmupVisits'])) }
export async function listWarmupQueueEntries(familyId: string, childId: string) { return listDocs<CloudWarmupQueueEntry>(docPath(['families', familyId, 'children', childId, 'warmupQueueEntries'])) }
export async function listWarmupMastery(familyId: string, childId: string) { return listDocs<VersionedChildMasteryState>(docPath(['families', familyId, 'children', childId, 'warmupMastery'])) }
export async function listWarmupTransitions(familyId: string, childId: string) { return listDocs<WarmupTransitionReceipt>(docPath(['families', familyId, 'children', childId, 'warmupTransitions'])) }
export async function listWarmupAttempts(familyId: string, childId: string) { return listDocs<WarmupAttempt>(docPath(['families', familyId, 'children', childId, 'warmupAttempts'])) }
export async function listWarmupGraphPoints(familyId: string, childId: string) { return listDocs<WarmupGraphPoint>(docPath(['families', familyId, 'children', childId, 'warmupGraphPoints'])) }
export async function listWarmupRotations(familyId: string, childId: string) { return listDocs<CloudWarmupRotation>(docPath(['families', familyId, 'children', childId, 'warmupRotations'])) }
export async function saveCloudAcquisitionProgress(familyId: string, childId: string, progression: AcquisitionProgressRecord) { await putDoc(docPath(['families', familyId, 'children', childId, 'acquisitionProgressions', progression.id]), progression) }
export async function saveCloudDistractorTargetObservation(familyId: string, childId: string, observation: DistractorTargetObservation) { await putDoc(docPath(['families', familyId, 'children', childId, 'dtObservations', observation.id]), observation) }

export function acquisitionReceiptMatchesCheckpoint(receipt: AcquisitionTransitionReceipt, checkpoint: AcquisitionCheckpoint<Word>) {
  return receipt.progressionId === checkpoint.progressionId
    && receipt.transitionId === checkpoint.transitionId
    && receipt.payloadFingerprint === checkpoint.payloadFingerprint
    && receipt.operation === checkpoint.operation
    && receipt.promptId === checkpoint.promptId
    && receipt.expectedRevision === checkpoint.expectedRevision
    && receipt.appliedRevision === checkpoint.nextRevision
    && receipt.appliedAt === checkpoint.occurredAt
}

/**
 * Commit one reviewed Acquisition response as a single Firestore transaction-like
 * batch: progression, immutable receipt, optional scored attempt, and optional DT
 * observation either all succeed or none do.
 */
export async function commitCloudAcquisitionCheckpoint(
  familyId: string,
  childId: string,
  envelope: AcquisitionProgressEnvelope<Word>,
  checkpoint: AcquisitionCheckpoint<Word>,
): Promise<'applied' | 'idempotent'> {
  const receipt = envelope.lastAppliedTransition
  if (!receipt || !acquisitionReceiptMatchesCheckpoint(receipt, checkpoint)) throw new Error('The cloud commit does not contain the exact applied Acquisition receipt.')
  if (envelope.childId !== childId || envelope.id !== checkpoint.progressionId || envelope.revision !== checkpoint.nextRevision) throw new Error('The cloud Acquisition checkpoint identity or revision is inconsistent.')
  const { receiptParts, writes } = buildCloudAcquisitionCheckpointWrites(familyId, childId, envelope, checkpoint)
  const receiptPath = docPath(receiptParts)
  const existing = await getDoc<AcquisitionTransitionReceipt>(receiptPath)
  if (existing) {
    if (!acquisitionReceiptMatchesCheckpoint(existing, checkpoint)) throw new Error('The cloud transition ID already belongs to different Acquisition content.')
    return 'idempotent'
  }

  try {
    await firestoreCommit(writes)
    return 'applied'
  } catch (error) {
    const committed = await getDoc<AcquisitionTransitionReceipt>(receiptPath)
    if (committed && acquisitionReceiptMatchesCheckpoint(committed, checkpoint)) return 'idempotent'
    throw error
  }
}

/**
 * Recognize an exact historical receipt before replaying a browser journal.
 * The progression may already be several revisions ahead on another device.
 */
export async function cloudAcquisitionCheckpointAlreadyCommitted(
  familyId: string,
  childId: string,
  checkpoint: AcquisitionCheckpoint<Word>,
) {
  const receipt = await getDoc<AcquisitionTransitionReceipt>(docPath([
    'families', familyId, 'children', childId, 'acquisitionTransitions', checkpoint.transitionId,
  ]))
  if (!receipt) return false
  if (!acquisitionReceiptMatchesCheckpoint(receipt, checkpoint)) throw new Error('The cloud transition ID already belongs to different Acquisition content.')
  return true
}

export function buildCloudAcquisitionCheckpointWrites(
  familyId: string,
  childId: string,
  envelope: AcquisitionProgressEnvelope<Word>,
  checkpoint: AcquisitionCheckpoint<Word>,
) {
  const receipt = envelope.lastAppliedTransition
  if (!receipt || !acquisitionReceiptMatchesCheckpoint(receipt, checkpoint)) throw new Error('The cloud commit does not contain the exact applied Acquisition receipt.')
  if (envelope.childId !== childId || envelope.id !== checkpoint.progressionId || envelope.revision !== checkpoint.nextRevision) throw new Error('The cloud Acquisition checkpoint identity or revision is inconsistent.')
  const progressionParts = ['families', familyId, 'children', childId, 'acquisitionProgressions', envelope.id]
  const receiptParts = ['families', familyId, 'children', childId, 'acquisitionTransitions', checkpoint.transitionId]
  const writes: unknown[] = [
    updateWrite(progressionParts, envelope as unknown as Record<string, unknown>),
    updateWrite(receiptParts, receipt as unknown as Record<string, unknown>, { exists: false }),
  ]
  if (checkpoint.scoredAttempt) {
    const fact = checkpoint.scoredAttempt
    writes.push(updateWrite(
      ['families', familyId, 'children', childId, 'sessions', fact.sessionId, 'attempts', fact.id],
      {
        id: fact.id,
        sessionId: fact.sessionId,
        wordId: fact.targetOccurrenceId,
        sourceDatasetId: envelope.datasetId,
        phase: 'acquisition',
        correct: fact.correct,
        reviewedAt: fact.reviewedAt,
        completionStatus: 'complete',
        countsTowardWeeklyScore: true,
        acquisitionKind: fact.kind,
        transitionId: checkpoint.transitionId,
      },
    ))
  }
  if (checkpoint.dtObservation) {
    const fact = checkpoint.dtObservation
    writes.push(updateWrite(
      ['families', familyId, 'children', childId, 'dtObservations', fact.id],
      {
        id: fact.id,
        childId,
        sessionId: fact.sessionId,
        datasetId: envelope.datasetId,
        wordId: fact.targetOccurrenceId,
        text: fact.text,
        poolType: fact.poolType,
        correct: fact.correct,
        revealMethod: fact.revealMethod,
        reviewedAt: fact.reviewedAt,
        transitionId: checkpoint.transitionId,
      },
    ))
  }
  return { progressionParts, receiptParts, writes }
}

function cloudWarmupWrite(familyId: string, childId: string, write: WarmupCloudRecordWrite) {
  return updateWrite(
    ['families', familyId, 'children', childId, write.collection, write.id],
    write.value,
    write.precondition === 'create' ? { exists: false } : undefined,
  )
}

export async function ensureCloudWarmupSeed(
  familyId: string,
  childId: string,
  visit: WarmupVisit,
  mastery: readonly VersionedChildMasteryState[],
  rotations: readonly CloudWarmupRotation[],
) {
  const records = buildWarmupSeedRecordWrites(childId, visit, mastery, rotations)
  const planned: typeof records = []
  for (const record of records) {
    const parts = ['families', familyId, 'children', childId, record.collection, record.id]
    const existing = await getDoc<unknown>(docPath(parts))
    const decision = reconcileWarmupSeedRecord(record, existing)
    if (decision) planned.push(decision)
  }
  if (planned.length > 0) await firestoreCommit(planned.map((record) => cloudWarmupWrite(familyId, childId, record)))
}

function buildCloudWarmupTransitionWrites(familyId: string, childId: string, transition: WarmupTransition) {
  const records = buildWarmupTransitionRecordWrites(childId, transition)
  const receiptParts = ['families', familyId, 'children', childId, 'warmupTransitions', transition.transitionId]
  return { receiptParts, writes: records.map((record) => cloudWarmupWrite(familyId, childId, record)) }
}

export async function commitCloudWarmupTransition(familyId: string, childId: string, transition: WarmupTransition): Promise<'applied' | 'idempotent'> {
  const { receiptParts, writes } = buildCloudWarmupTransitionWrites(familyId, childId, transition)
  const existing = await getDoc<WarmupTransitionReceipt>(docPath(receiptParts))
  if (existing) {
    if (!warmupReceiptMatchesTransition(existing, transition)) throw new Error('The cloud Warmup transition ID already belongs to different content.')
    return 'idempotent'
  }
  try {
    await firestoreCommit(writes)
    return 'applied'
  } catch (error) {
    const committed = await getDoc<WarmupTransitionReceipt>(docPath(receiptParts))
    if (committed && warmupReceiptMatchesTransition(committed, transition)) return 'idempotent'
    throw error
  }
}

export async function cloudWarmupTransitionAlreadyCommitted(familyId: string, childId: string, transition: WarmupTransition) {
  const receipt = await getDoc<WarmupTransitionReceipt>(docPath(['families', familyId, 'children', childId, 'warmupTransitions', transition.transitionId]))
  if (!receipt) return false
  if (!warmupReceiptMatchesTransition(receipt, transition)) throw new Error('The cloud Warmup transition ID already belongs to different content.')
  return true
}
export async function getCloudAdaptiveState(familyId: string, childId: string) { return getDoc<CloudAdaptiveState>(docPath(['families', familyId, 'children', childId, 'warmupState', 'current'])) }
export async function saveCloudAdaptiveState(familyId: string, childId: string, state: CloudAdaptiveState) { await putDoc(docPath(['families', familyId, 'children', childId, 'warmupState', 'current']), state) }
export function cloudAdaptiveStateForSave(state: Pick<AppState, 'childWordStates' | 'monthlyRotationScores' | 'rotationCycles'>, childId: string, updatedAt: string): CloudAdaptiveState {
  return {
    childId,
    childWordStates: state.childWordStates.filter((item) => item.childId === childId),
    monthlyRotationScores: state.monthlyRotationScores.filter((item) => item.childId === childId),
    rotationCycleId: state.rotationCycles[childId] || 1,
    updatedAt,
  }
}
export async function abandonSession(familyId: string, childId: string, session: CloudSession) { await putDoc(docPath(['families', familyId, 'children', childId, 'sessions', session.id]), { ...session, status: 'abandoned', completedAt: new Date().toISOString() }); const attempts = await listAttempts(familyId, childId, session.id); await Promise.all(attempts.filter((attempt) => attempt.completionStatus === 'temporary').map((attempt) => deleteDoc(docPath(['families', familyId, 'children', childId, 'sessions', session.id, 'attempts', attempt.id])))) }
export async function deleteDoc(path: string) { await firestoreRequest(path, { method: 'DELETE' }) }

export async function startCloudSession(familyId: string, childId: string, session: Omit<CloudSession, 'familyId' | 'status' | 'applicationVersion'>) { const value: CloudSession = { ...session, familyId, status: 'in_progress', applicationVersion: APP_VERSION }; await putDoc(docPath(['families', familyId, 'children', childId, 'sessions', session.id]), value); return value }
export async function updateCloudSession(familyId: string, childId: string, session: CloudSession, patch: Partial<CloudSession>) { const value = { ...session, ...patch }; await putDoc(docPath(['families', familyId, 'children', childId, 'sessions', session.id]), value); return value }
export async function saveCloudAttempt(familyId: string, childId: string, sessionId: string, attempt: CloudAttempt) { await putDoc(docPath(['families', familyId, 'children', childId, 'sessions', sessionId, 'attempts', attempt.id]), attempt) }
export async function completeCloudSession(familyId: string, childId: string, session: CloudSession, attempts: CloudAttempt[], scores: DatasetScore[]) { await putDoc(docPath(['families', familyId, 'children', childId, 'sessions', session.id]), { ...session, status: 'completed', warmupStatus: session.warmupStatus === 'skipped' ? 'skipped' : session.warmupStatus === 'partial' ? 'partial' : 'completed', completedAt: new Date().toISOString() }); await Promise.all(attempts.map((attempt) => saveCloudAttempt(familyId, childId, session.id, { ...attempt, completionStatus: 'complete' }))); await Promise.all(scores.map((score) => putDoc(docPath(['families', familyId, 'children', childId, 'scores', score.id]), score))) }
export async function finishCloudSession(familyId: string, childId: string, session: CloudSession, status: 'partial' | 'completed' | 'skipped', attempts: CloudAttempt[], scores: DatasetScore[]) { await putDoc(docPath(['families', familyId, 'children', childId, 'sessions', session.id]), { ...session, status, completedAt: new Date().toISOString() }); await Promise.all(attempts.map((attempt) => saveCloudAttempt(familyId, childId, session.id, { ...attempt, completionStatus: 'complete' }))); await Promise.all(scores.map((score) => putDoc(docPath(['families', familyId, 'children', childId, 'scores', score.id]), score))) }
export async function skipCloudTestReview(familyId: string, childId: string, session: CloudSession, warmupAttempts: CloudAttempt[]) { const attempts = await listAttempts(familyId, childId, session.id); await Promise.all(attempts.filter((attempt) => attempt.phase === 'test-review' && attempt.completionStatus === 'temporary').map((attempt) => deleteDoc(docPath(['families', familyId, 'children', childId, 'sessions', session.id, 'attempts', attempt.id])))); await putDoc(docPath(['families', familyId, 'children', childId, 'sessions', session.id]), { ...session, status: 'skipped', completedAt: new Date().toISOString() }); await Promise.all(warmupAttempts.map((attempt) => saveCloudAttempt(familyId, childId, session.id, { ...attempt, completionStatus: 'complete' }))) }

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }

function isValidCloudChildWordState(value: unknown, childId: string, datasetsById: Map<string, Dataset>): value is ChildWordState {
  if (!isRecord(value) || typeof value.id !== 'string' || value.childId !== childId || typeof value.wordId !== 'string' || typeof value.datasetId !== 'string') return false
  if (!['acquisition', 'recent-review', 'errored-word', 'random-rotation'].includes(String(value.category))) return false
  if (typeof value.correctStreak !== 'number' || !Number.isInteger(value.correctStreak) || value.correctStreak < 0) return false
  if ('lastReviewedAt' in value && typeof value.lastReviewedAt !== 'string') return false
  if ('lastIncorrectAt' in value && typeof value.lastIncorrectAt !== 'string') return false
  if ('randomCycleId' in value && (typeof value.randomCycleId !== 'number' || !Number.isInteger(value.randomCycleId) || value.randomCycleId < 1)) return false
  if ('randomCycleReviewed' in value && typeof value.randomCycleReviewed !== 'boolean') return false
  const dataset = datasetsById.get(value.datasetId)
  return Boolean(dataset?.words.some((word) => word.id === value.wordId && word.datasetId === dataset.id))
}

export function cloudDataToAppState(rawDatasets: Dataset[], rawScores: DatasetScore[], rawSessions: CloudSession[], rawAttempts: CloudAttempt[], childId: string, grade: string, adaptiveState?: CloudAdaptiveState | null, rawProgressions: Array<AcquisitionProgressRecord | AcquisitionProgressEnvelope<Word>> = [], rawDtObservations: DistractorTargetObservation[] = [], schoolYear?: string) {
  const practiceProfile = practiceProfileForGrade(grade)
  const seenDatasetIds = new Set<string>()
  const datasets = rawDatasets.filter((dataset) => isCanonicalDataset(dataset) && !seenDatasetIds.has(dataset.id) && (seenDatasetIds.add(dataset.id), true))
  const datasetsById = new Map(datasets.map((dataset) => [dataset.id, dataset]))
  const sessions = rawSessions.filter((session) => session.childId === childId && (!('reviewCycle' in session) || (session.primaryPhase === 'test-review' && isTestReviewCycle(session.reviewCycle))))
  const sessionsById = new Map(sessions.map((session) => [session.id, session]))
  const sessionIds = new Set(sessions.map((session) => session.id))
  const attempts = rawAttempts.filter((attempt) => {
    const session = sessionsById.get(attempt.sessionId)
    const validReviewCycle = attempt.phase !== 'test-review'
      ? !('reviewCycle' in attempt)
      : session?.primaryPhase === 'test-review'
        && storedTestReviewCycle(attempt.reviewCycle) === storedTestReviewCycle(session.reviewCycle)
        && (!('reviewCycle' in attempt) || isTestReviewCycle(attempt.reviewCycle))
    return sessionIds.has(attempt.sessionId) && datasetsById.has(attempt.sourceDatasetId) && datasetsById.get(attempt.sourceDatasetId)!.words.some((word) => word.id === attempt.wordId) && (attempt.completionStatus === 'complete' || attempt.completionStatus === 'temporary') && validReviewCycle
  })
  const results: WordResult[] = attempts.map((attempt) => ({ id: attempt.id, childId, datasetId: attempt.sourceDatasetId, datasetDateRange: datasetsById.get(attempt.sourceDatasetId)!.dateRange, wordId: attempt.wordId, grade: datasetsById.get(attempt.sourceDatasetId)!.grade, phase: attempt.phase, sessionId: attempt.sessionId, sessionDate: attempt.reviewedAt.slice(0, 10), completedAt: attempt.reviewedAt, correct: attempt.correct, revealMethod: 'timer', scored: attempt.completionStatus === 'complete', completeSourceDatasetReviewed: attempt.completionStatus === 'complete', ...(attempt.phase === 'test-review' ? { reviewCycle: storedTestReviewCycle(attempt.reviewCycle ?? sessionsById.get(attempt.sessionId)?.reviewCycle) } : {}) }))
  const scores = rawScores.filter((score) => {
    const session = sessionsById.get(score.sessionId)
    const validReviewCycle = score.phase !== 'test-review'
      ? !('reviewCycle' in score)
      : session?.primaryPhase === 'test-review'
        && storedTestReviewCycle(score.reviewCycle) === storedTestReviewCycle(session.reviewCycle)
        && (!('reviewCycle' in score) || isTestReviewCycle(score.reviewCycle))
    return score.childId === childId && datasetsById.has(score.datasetId) && Number.isFinite(score.percent) && score.percent >= 0 && score.percent <= 100 && validReviewCycle
  }).map((score) => score.phase === 'test-review' ? { ...score, reviewCycle: storedTestReviewCycle(score.reviewCycle ?? sessionsById.get(score.sessionId)?.reviewCycle) } : score)
  const warmupSessions = sessions.map((session) => {
    const warmup = attempts.filter((attempt) => attempt.sessionId === session.id && attempt.phase === 'warmup' && attempt.completionStatus === 'complete')
    const datasetIds = [...new Set(warmup.map((attempt) => attempt.sourceDatasetId))]
    const completeDatasetIds = datasetIds.filter((datasetId) => warmup.filter((attempt) => attempt.sourceDatasetId === datasetId).length === (datasets.find((dataset) => dataset.id === datasetId)?.words.length || 0))
    return { id: `${session.id}-warmup`, childId, sessionId: session.id, sessionDate: session.localDate, completedAt: warmup.length ? warmup[ warmup.length - 1 ].reviewedAt : undefined, wordIds: warmup.map((attempt) => attempt.wordId), datasetIds, completeDatasetIds, complete: Boolean(warmup.length) }
  }).filter((session) => session.complete)
  const trustedStates = adaptiveState?.childId === childId && Array.isArray(adaptiveState.childWordStates)
    ? adaptiveState.childWordStates.filter((state) => isValidCloudChildWordState(state, childId, datasetsById))
    : []
  const trustedMonthlyScores = adaptiveState?.childId === childId && Array.isArray(adaptiveState.monthlyRotationScores) && adaptiveState.monthlyRotationScores.every((score) => score.childId === childId && Number.isFinite(score.correct) && Number.isFinite(score.total) && Number.isFinite(score.percent)) ? adaptiveState.monthlyRotationScores : null
  const trustedCycle = adaptiveState?.childId === childId && Number.isInteger(adaptiveState.rotationCycleId) && adaptiveState.rotationCycleId > 0 ? adaptiveState.rotationCycleId : 1
  const currentScopeDatasets = datasets.filter((dataset) => dataset.grade === grade && (!schoolYear || dataset.schoolYear === schoolYear))
  const currentScopeDatasetIds = new Set(currentScopeDatasets.map((dataset) => dataset.id))
  const currentScopeStates = trustedStates.filter((state) => currentScopeDatasetIds.has(state.datasetId))
  const preservedOtherScopeStates = trustedStates.filter((state) => !currentScopeDatasetIds.has(state.datasetId))
  const childWordStates = practiceProfile
    ? [...preservedOtherScopeStates, ...deriveChildWordStates({ grade, schoolYear, datasets: currentScopeDatasets, results, childId, existingStates: currentScopeStates, rotationCycleId: trustedCycle })]
    : trustedStates
  const monthlyRotationScores = trustedMonthlyScores || []
  const rotationCycles = { [childId]: trustedCycle }
  const legacyProgressions = rawProgressions.filter((progression): progression is AcquisitionProgressRecord => !('contractId' in progression) && progression.childId === childId && datasetsById.has(progression.datasetId) && progression.flow?.datasetId === progression.datasetId)
  const acquisitionProgressEnvelopes: AcquisitionProgressEnvelope<Word>[] = []
  const acquisitionProgressQuarantine: NonNullable<AppState['acquisitionProgressQuarantine']> = []
  for (const dataset of datasets) {
    const candidates = rawProgressions.filter((progression) => progression.childId === childId && progression.datasetId === dataset.id)
    const currentCandidates = candidates.filter((progression) => 'contractId' in progression)
    if (currentCandidates.length > 1 || (currentCandidates.length === 0 && candidates.length > 1)) {
      acquisitionProgressQuarantine.push({ id: `acq-quarantine-${childId}-${dataset.id}`, childId, datasetId: dataset.id, reason: 'Conflicting cloud Acquisition records reuse the same child and dataset identity.', quarantinedAt: new Date().toISOString(), raw: candidates })
      continue
    }
    const candidate = currentCandidates[0] || candidates[0]
    if (!candidate) continue
    try {
      const context = acquisitionPersistenceContext(childId, dataset, dataset.grade)
      const migrated = migrateAcquisitionProgress(candidate, context)
      if (migrated.status === 'quarantined') {
        acquisitionProgressQuarantine.push({ id: `acq-quarantine-${childId}-${dataset.id}`, childId, datasetId: dataset.id, reason: migrated.reason, quarantinedAt: new Date().toISOString(), raw: migrated.raw })
      } else {
        acquisitionProgressEnvelopes.push(migrated.envelope)
      }
    } catch (error) {
      acquisitionProgressQuarantine.push({ id: `acq-quarantine-${childId}-${dataset.id}`, childId, datasetId: dataset.id, reason: error instanceof Error ? error.message : 'No Acquisition profile was available.', quarantinedAt: new Date().toISOString(), raw: candidate })
    }
  }
  const distractorTargetObservations = rawDtObservations
    .filter((observation) => observation.childId === childId && datasetsById.has(observation.datasetId) && (String(observation.poolType) === 'familiar' || String(observation.poolType) === 'established' || observation.poolType === 'earned'))
    .map(normalizeDistractorTargetObservation)
  return { version: 2 as const, datasets, results, scores, warmupSessions, completedSessions: sessions.filter((session) => (session.status === 'completed' || session.status === 'skipped') && !session.warmupOnly && datasetsById.has(session.datasetId)).map((session) => ({ id: session.id, childId, sessionDate: session.localDate, primaryDatasetId: session.datasetId, primaryDatasetIds: Array.isArray(session.datasetIds) ? session.datasetIds.filter((datasetId) => typeof datasetId === 'string' && datasetsById.has(datasetId)) : undefined, reviewGroupId: typeof session.reviewGroupId === 'string' ? session.reviewGroupId : undefined, reviewCycle: session.primaryPhase === 'test-review' ? storedTestReviewCycle(session.reviewCycle) : undefined, primaryPhase: session.primaryPhase, complete: true as const, outcome: session.status === 'skipped' ? 'skipped' as const : 'completed' as const })), legacyRecords: [], childWordStates, monthlyRotationScores, rotationCycles, acquisitionProgressions: legacyProgressions, acquisitionProgressEnvelopes, acquisitionTransitionReceipts: acquisitionProgressEnvelopes.flatMap((envelope) => envelope.lastAppliedTransition ? [envelope.lastAppliedTransition] : []), acquisitionPendingCheckpoints: [], acquisitionProgressQuarantine, distractorTargetObservations }
}

export function cloudSessionFor(familyId: string, childId: string, id: string, datasetId: string, primaryPhase: 'acquisition' | 'test-review', warmupStatus: CloudSession['warmupStatus'] = 'in_progress', reviewCycle?: TestReviewCycle): Omit<CloudSession, 'familyId' | 'status' | 'applicationVersion'> {
  if (reviewCycle !== undefined && (primaryPhase !== 'test-review' || !isTestReviewCycle(reviewCycle))) throw new Error('The cloud session contains an invalid Test Review cycle identity.')
  const now = new Date()
  return { id, childId, sessionDate: now.toISOString(), localDate: new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TIME_ZONE }).format(now), startedAt: now.toISOString(), primaryPhase, datasetId, reviewCycle: primaryPhase === 'test-review' ? reviewCycle ?? 1 : undefined, warmupOnly: false, warmupStatus }
}
