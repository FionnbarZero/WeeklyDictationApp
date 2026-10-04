import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { Page, Route } from '@playwright/test'
import {
  planSelectedChildRestore,
  type SelectedChildRestoreSnapshot,
} from '../src/application/backup/selectedChildRestore.ts'
import { APP_VERSION } from '../src/releaseMetadata.ts'
import { APP_STATE_KEY, createInitialState, isAppState, loadState } from '../src/domain.ts'
import {
  APPLICATION_BACKUP_SCHEMA,
  previewVerifiedApplicationBackup,
  type ApplicationBackup,
} from '../src/persistence/applicationBackup.ts'
import {
  ACQUISITION_PENDING_JOURNAL_KEY,
  readPendingAcquisitionJournal,
} from '../src/persistence/acquisitionPendingJournal.ts'
import {
  applyLocalRestoreTransaction,
  LOCAL_RESTORE_JOURNAL_KEY,
  LOCAL_RESTORE_TARGET_KEYS,
  localRestoreValues,
  recoverInterruptedLocalRestore,
  type LocalRestoreStorage,
} from '../src/persistence/localRestoreJournal.ts'
import { readPendingWarmupJournal, WARMUP_PENDING_JOURNAL_KEY } from '../src/persistence/warmup/pendingJournal.ts'

export const GRADE2_PRIVATE_CAPTURE_SCHEMA = 'weekly-dictation-grade2-private-capture-v1' as const
export const GRADE2_REHEARSAL_EVIDENCE_SCHEMA = 'weekly-dictation-grade2-restore-rehearsal-v1' as const
export const GRADE2_STABLE_URL = 'https://fionnbarzero.github.io/WeeklyDictationApp/'
export const GRADE2_STABLE_ORIGIN = new URL(GRADE2_STABLE_URL).origin
export const GRADE2_STABLE_PATHS = ['/WeeklyDictationApp/', '/WeeklyDictationApp/index.html'] as const
export const SELECTED_CHILD_STORAGE_KEY = 'weekly-dictation-child'

type RestoreValues = ReturnType<typeof localRestoreValues>

export type Grade2PrivateCapture = {
  schema: typeof GRADE2_PRIVATE_CAPTURE_SCHEMA
  capturedAt: string
  origin: string
  path: (typeof GRADE2_STABLE_PATHS)[number]
  selectedChildId: string
  storage: RestoreValues
}

export type Grade2RehearsalEvidence = {
  schema: typeof GRADE2_REHEARSAL_EVIDENCE_SCHEMA
  completedAt: string
  candidateRevision: string
  applicationVersion: string
  origin: string
  backup: {
    fileName: string
    createdAt: string
    checksum: string
  }
  checks: {
    privateCaptureValidated: true
    candidateServedAtRecordedOrigin: true
    externalNetworkBlocked: true
    verifiedBackupRetained: true
    previewWasZeroWrite: true
    wrongProfileRejected: true
    selectedProfileApplied: true
    unrelatedProfilesPreserved: true
    automaticPreRestoreBackupVerified: true
    reloadVerified: true
    duplicateReplayWasIdempotent: true
    interruptedWriteReplayed: true
    injectedFailureRolledBack: true
    unexpectedNewerStorageBlocked: true
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function canonicalIso(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index])
}

export function grade2CaptureBookmarklet() {
  const schema = JSON.stringify(GRADE2_PRIVATE_CAPTURE_SCHEMA)
  const origin = JSON.stringify(GRADE2_STABLE_ORIGIN)
  const paths = JSON.stringify(GRADE2_STABLE_PATHS)
  const selectedChildKey = JSON.stringify(SELECTED_CHILD_STORAGE_KEY)
  const storageKeys = JSON.stringify(LOCAL_RESTORE_TARGET_KEYS)
  const source = `(()=>{const schema=${schema};const expectedOrigin=${origin};const expectedPaths=${paths};const selectedChildKey=${selectedChildKey};const storageKeys=${storageKeys};if(location.origin!==expectedOrigin||!expectedPaths.includes(location.pathname)){alert('Open the exact Grade 2 family beta page before creating the private capture.');return}const selectedChildId=localStorage.getItem(selectedChildKey);const state=localStorage.getItem(storageKeys[0]);if(!selectedChildId||!state){alert('Grade 2 browser progress or the selected profile could not be found. No file was created.');return}const capturedAt=new Date().toISOString();const capture={schema,capturedAt,origin:location.origin,path:location.pathname,selectedChildId,storage:Object.fromEntries(storageKeys.map((key)=>[key,localStorage.getItem(key)]))};const url=URL.createObjectURL(new Blob([JSON.stringify(capture,null,2)],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download='weekly-dictation-grade2-private-capture-'+capturedAt.replace(/[:.]/g,'-')+'.json';document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),0)})()`
  return `javascript:${source}`
}

export function parseGrade2PrivateCapture(raw: string, expectedOrigin = GRADE2_STABLE_ORIGIN): Grade2PrivateCapture {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('The private capture is not valid JSON.')
  }
  if (
    !record(parsed) ||
    !exactKeys(parsed, ['schema', 'capturedAt', 'origin', 'path', 'selectedChildId', 'storage']) ||
    parsed.schema !== GRADE2_PRIVATE_CAPTURE_SCHEMA ||
    !canonicalIso(parsed.capturedAt) ||
    parsed.origin !== expectedOrigin ||
    !GRADE2_STABLE_PATHS.includes(parsed.path as (typeof GRADE2_STABLE_PATHS)[number]) ||
    typeof parsed.selectedChildId !== 'string' ||
    !parsed.selectedChildId.trim() ||
    !record(parsed.storage) ||
    !exactKeys(parsed.storage, LOCAL_RESTORE_TARGET_KEYS)
  ) {
    throw new Error('The private capture has an unsupported scope or structure.')
  }
  const storage = parsed.storage
  if (
    typeof storage[APP_STATE_KEY] !== 'string' ||
    !storage[APP_STATE_KEY] ||
    ![ACQUISITION_PENDING_JOURNAL_KEY, WARMUP_PENDING_JOURNAL_KEY].every(
      (key) => storage[key] === null || typeof storage[key] === 'string',
    )
  ) {
    throw new Error('The private capture does not contain the complete Grade 2 storage snapshot.')
  }
  let state: unknown
  try {
    state = JSON.parse(storage[APP_STATE_KEY])
  } catch {
    throw new Error('The captured application state is not valid JSON.')
  }
  if (!isAppState(state)) throw new Error('The captured application state is malformed.')
  snapshotFromStorage(storage as RestoreValues)
  return parsed as Grade2PrivateCapture
}

export class MemoryRestoreStorage implements LocalRestoreStorage {
  readonly values = new Map<string, string>()
  writes = 0
  failAtWrite: number | null = null

  constructor(initial: Partial<Record<string, string | null>> = {}) {
    for (const [key, value] of Object.entries(initial)) if (typeof value === 'string') this.values.set(key, value)
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.writes += 1
    if (this.writes === this.failAtWrite) throw new Error('injected rehearsal write failure')
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }
}

export function snapshotFromStorage(values: RestoreValues): SelectedChildRestoreSnapshot {
  const storage = new MemoryRestoreStorage(values)
  let parsed: unknown
  try {
    parsed = JSON.parse(values[APP_STATE_KEY] || '')
  } catch {
    throw new Error('The application storage value is not valid JSON.')
  }
  if (!isAppState(parsed)) throw new Error('The application storage value is malformed.')
  const acquisition = readPendingAcquisitionJournal(storage)
  if (acquisition.error) throw new Error('The Acquisition recovery journal is malformed.')
  const warmup = readPendingWarmupJournal(storage)
  if (warmup.error) throw new Error('The Warmup recovery journal is malformed.')
  return {
    state: loadState(values[APP_STATE_KEY]),
    pendingAcquisition: acquisition.entries,
    pendingWarmup: warmup.entries,
  }
}

export function createDisposableScratchSnapshot(
  source: SelectedChildRestoreSnapshot,
  selectedChildId: string,
  createdAt: string,
) {
  const emptyBackup: ApplicationBackup = {
    schema: APPLICATION_BACKUP_SCHEMA,
    createdAt,
    state: createInitialState(),
    pendingAcquisition: [],
    pendingWarmup: [],
  }
  return planSelectedChildRestore({ current: source, backup: emptyBackup, childId: selectedChildId })
}

export function storageValuesEqual(left: RestoreValues, right: RestoreValues) {
  return LOCAL_RESTORE_TARGET_KEYS.every((key) => left[key] === right[key])
}

export function storageValuesHash(values: RestoreValues) {
  const hash = createHash('sha256')
  for (const key of LOCAL_RESTORE_TARGET_KEYS) hash.update(`${key}\0${values[key] ?? ''}\0`)
  return hash.digest('hex')
}

export function assertPrivatePathOutsideRepository(path: string, repositoryRoot: string) {
  const resolvedRoot = realpathSync(repositoryRoot)
  const resolvedPath = realpathSync(path)
  const relation = relative(resolvedRoot, resolvedPath)
  if (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation)) {
    throw new Error('The private capture must stay outside the repository.')
  }
  if (!statSync(resolvedPath).isFile()) throw new Error('The private capture path is not a file.')
  return resolvedPath
}

export function assertNewOutputPath(path: string, repositoryRoot: string, requireOutsideRepository: boolean) {
  const resolvedPath = resolve(path)
  if (existsSync(resolvedPath)) throw new Error('A rehearsal output already exists at the requested path.')
  const resolvedParent = realpathSync(dirname(resolvedPath))
  const canonicalPath = resolve(resolvedParent, basename(resolvedPath))
  if (requireOutsideRepository) {
    const relation = relative(realpathSync(repositoryRoot), canonicalPath)
    if (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation)) {
      throw new Error('The verified backup output must stay outside the repository.')
    }
  }
  return canonicalPath
}

export function candidateFileForRequest(url: string, buildDirectory: string) {
  const request = new URL(url)
  if (request.origin !== GRADE2_STABLE_ORIGIN || !request.pathname.startsWith('/WeeklyDictationApp/')) return null
  const relativePath = decodeURIComponent(request.pathname.slice('/WeeklyDictationApp/'.length)) || 'index.html'
  if (relativePath.includes('..') || relativePath.includes('\\')) return null
  const candidate = resolve(buildDirectory, relativePath)
  const relation = relative(resolve(buildDirectory), candidate)
  if (
    relation.startsWith(`..${sep}`) ||
    isAbsolute(relation) ||
    !existsSync(candidate) ||
    !statSync(candidate).isFile()
  )
    return null
  return candidate
}

export function isExpectedBlockedFontStylesheet(url: string, method: string, resourceType: string) {
  const request = new URL(url)
  return (
    method === 'GET' &&
    resourceType === 'stylesheet' &&
    request.origin === 'https://fonts.googleapis.com' &&
    request.pathname === '/css2'
  )
}

const contentTypeByExtension: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

export async function fulfillCandidateRequest(route: Route, buildDirectory: string) {
  const file = candidateFileForRequest(route.request().url(), buildDirectory)
  if (!file) {
    await route.abort('blockedbyclient')
    return false
  }
  const extension = file.slice(file.lastIndexOf('.'))
  await route.fulfill({ path: file, contentType: contentTypeByExtension[extension] || 'application/octet-stream' })
  return true
}

export async function readBrowserRestoreValues(page: Page): Promise<RestoreValues> {
  return page.evaluate(
    (keys) => Object.fromEntries(keys.map((key) => [key, window.localStorage.getItem(key)])),
    LOCAL_RESTORE_TARGET_KEYS,
  ) as Promise<RestoreValues>
}

export async function replaceBrowserRestoreValues(page: Page, values: RestoreValues) {
  await page.evaluate(
    ({ keys, next }) => {
      for (const key of keys) {
        const value = next[key]
        if (value === null) window.localStorage.removeItem(key)
        else window.localStorage.setItem(key, value)
      }
    },
    { keys: LOCAL_RESTORE_TARGET_KEYS, next: values },
  )
}

export function verifyInjectedRollback(
  before: RestoreValues,
  after: RestoreValues,
  input: {
    checksum: string
    childId: string
    origin: string
    createdAt: string
  },
) {
  const storage = new MemoryRestoreStorage(before)
  storage.failAtWrite = 4
  let rejected = false
  try {
    applyLocalRestoreTransaction({
      storage,
      after,
      transactionId: `rehearsal-rollback-${input.createdAt}`,
      backupChecksum: input.checksum,
      childId: input.childId,
      origin: input.origin,
      createdAt: input.createdAt,
    })
  } catch {
    rejected = true
  }
  const restored = Object.fromEntries(
    LOCAL_RESTORE_TARGET_KEYS.map((key) => [key, storage.getItem(key)]),
  ) as RestoreValues
  return rejected && storageValuesEqual(restored, before) && storage.getItem(LOCAL_RESTORE_JOURNAL_KEY) === null
}

export function verifyUnexpectedNewerStorageBlocked(
  before: RestoreValues,
  after: RestoreValues,
  input: {
    checksum: string
    childId: string
    origin: string
    createdAt: string
  },
) {
  const storage = new MemoryRestoreStorage(before)
  const journal = {
    schema: LOCAL_RESTORE_JOURNAL_KEY,
    transactionId: `rehearsal-unexpected-${input.createdAt}`,
    backupChecksum: input.checksum,
    childId: input.childId,
    origin: input.origin,
    createdAt: input.createdAt,
    stage: LOCAL_RESTORE_TARGET_KEYS[0],
    before,
    after,
  }
  storage.setItem(LOCAL_RESTORE_JOURNAL_KEY, JSON.stringify(journal))
  storage.setItem(LOCAL_RESTORE_TARGET_KEYS[1], 'unexpected-newer-storage')
  let rejected = false
  try {
    recoverInterruptedLocalRestore(storage)
  } catch {
    rejected = true
  }
  return rejected && storage.getItem(LOCAL_RESTORE_JOURNAL_KEY) !== null
}

export async function verifyWrongProfileRejected(rawBackup: string, capture: Grade2PrivateCapture) {
  try {
    await previewVerifiedApplicationBackup(rawBackup, {
      expectedScope: {
        mode: 'local-browser',
        grade: 'Grade 2',
        selectedChildId: `${capture.selectedChildId}-wrong-profile`,
        origin: capture.origin,
      },
    })
    return false
  } catch {
    return true
  }
}

export function assertPrivacySafeEvidence(evidence: Grade2RehearsalEvidence, capture: Grade2PrivateCapture) {
  const serialized = JSON.stringify(evidence)
  if (
    serialized.includes(capture.selectedChildId) ||
    LOCAL_RESTORE_TARGET_KEYS.some((key) => serialized.includes(key)) ||
    Object.values(capture.storage).some(
      (value) => typeof value === 'string' && value.length > 0 && serialized.includes(value),
    )
  ) {
    throw new Error('The rehearsal evidence contains private capture data.')
  }
  if (!Object.values(evidence.checks).every((value) => value === true))
    throw new Error('The rehearsal evidence contains an incomplete safety check.')
  return serialized
}

export function readPrivateCaptureFile(path: string, repositoryRoot: string, expectedOrigin: string) {
  const resolved = assertPrivatePathOutsideRepository(path, repositoryRoot)
  return parseGrade2PrivateCapture(readFileSync(resolved, 'utf8'), expectedOrigin)
}

export function applicationVersion() {
  return APP_VERSION
}
