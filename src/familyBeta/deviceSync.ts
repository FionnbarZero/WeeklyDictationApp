import { firebaseConfig } from '../config.ts'
import { getIdToken } from '../firebaseClient.ts'
import { firebaseAppCheckHeaders } from '../firebaseSdkRuntime.ts'
import { documentValue, plainValue } from '../firestoreClient.ts'
import { isRetirementKey } from './acquisitionRetirement.ts'
import { chooseCheckpointWinner } from './checkpointConflict.ts'
import {
  isPracticeWorkspaceSyncKey,
  legacyPracticeKey,
  practiceWorkspaceKey,
  practiceWorkspaceStorage,
  practiceWorkspaceSyncAdapter,
} from './practiceWorkspaceStorage.ts'

type StoragePort = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem'>>
type SyncRecord = { schema: 1; childId: string; key: string; payload: string; generation: number }
type Remote = { record: SyncRecord; updateTime: string }
export function ownedPracticeRecord(key: string, raw: string, childId: string) {
  if (key.startsWith(`family-beta-activity:${childId}:`)) return true
  if (key.startsWith(`family-beta-mastery-v1:${childId}:`)) return true
  if (key.startsWith('family-beta-acquisition-v1:')) {
    try {
      return JSON.parse(raw)?.envelope?.childId === childId
    } catch {
      return false
    }
  }
  return false
}

function workspaceConflictCandidate(payload: string) {
  try {
    const values = (JSON.parse(payload) as { values?: unknown }).values
    const pending =
      values &&
      typeof values === 'object' &&
      Array.isArray((values as { acquisitionPendingCheckpoints?: unknown }).acquisitionPendingCheckpoints)
        ? (values as { acquisitionPendingCheckpoints: unknown[] }).acquisitionPendingCheckpoints
        : []
    const candidates = pending
      .flatMap((checkpoint) => {
        if (!checkpoint || typeof checkpoint !== 'object') return []
        const value = checkpoint as { sessionId?: unknown; occurredAt?: unknown }
        if (typeof value.sessionId !== 'string' || typeof value.occurredAt !== 'string') return []
        if (Number.isNaN(Date.parse(value.occurredAt)) || new Date(value.occurredAt).toISOString() !== value.occurredAt)
          return []
        return [{ sessionId: value.sessionId, reviewedAt: value.occurredAt }]
      })
      .sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt))
    const latest = candidates[candidates.length - 1]
    return latest
      ? { id: `workspace:${latest.sessionId}:${latest.reviewedAt}:${payload}`, reviewedAt: latest.reviewedAt }
      : null
  } catch {
    return null
  }
}

function acknowledgePractice(storage: StoragePort, baseKey: string, payload: string) {
  storage.setItem(baseKey, payload)
  if (storage.getItem(baseKey) !== payload)
    throw new Error('Practice acknowledgement could not be saved. Please retry.')
  const pendingKey = `${baseKey}:pending`
  // The baseline is durable first. Only release this exact confirmed retry
  // copy, never another tab's newer upload or the actual practice checkpoint.
  if (storage.getItem(pendingKey) === payload) storage.removeItem?.(pendingKey)
}
async function recordId(key: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join('')
}

function acquisitionConflictCandidate(payload: string) {
  if (!payload || !payload.startsWith('{')) return null
  try {
    const value = JSON.parse(payload) as {
      sessionId?: unknown
      writerId?: unknown
      reviewedTrials?: unknown
    }
    if (typeof value.sessionId !== 'string' || !Array.isArray(value.reviewedTrials)) return null
    const reviewed = value.reviewedTrials
      .flatMap((trial) => {
        if (
          !trial ||
          typeof trial !== 'object' ||
          (trial as { sessionId?: unknown }).sessionId !== value.sessionId ||
          typeof (trial as { reviewedAt?: unknown }).reviewedAt !== 'string'
        )
          return []
        const candidate = (trial as { reviewedAt: string }).reviewedAt
        return !Number.isNaN(Date.parse(candidate)) && new Date(candidate).toISOString() === candidate
          ? [candidate]
          : []
      })
      .sort()
    const reviewedAt = reviewed[reviewed.length - 1]
    const writer = typeof value.writerId === 'string' ? value.writerId : 'legacy'
    return { id: `${writer}:${value.sessionId}:${payload}`, reviewedAt }
  } catch {
    return null
  }
}

export function createDeviceSyncRepository(options: {
  projectId: string
  familyId: string
  token: () => Promise<string>
  endpoint?: string
  fetchImpl?: typeof fetch
  appCheckHeaders?: () => Promise<Record<string, string>>
}) {
  if (!/^[\w-]+$/.test(options.projectId) || !/^[\w-]+$/.test(options.familyId))
    throw new Error('Invalid family scope.')
  const base = `${options.endpoint || 'https://firestore.googleapis.com'}/v1/projects/${options.projectId}/databases/(default)/documents/families/${options.familyId}/children`
  const fetchImpl = options.fetchImpl || fetch
  async function request(path: string, init: RequestInit = {}) {
    const url = path === ':commit' ? `${base.split('/documents/')[0]}/documents:commit` : `${base}/${path}`
    return fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${await options.token()}`,
        'Content-Type': 'application/json',
        ...(await options.appCheckHeaders?.()),
      },
    })
  }
  async function list(childId: string) {
    const records = new Map<string, Remote>()
    let next = ''
    do {
      const response = await request(
        `${childId}/betaPractice?pageSize=100${next ? `&pageToken=${encodeURIComponent(next)}` : ''}`,
      )
      if (!response.ok)
        throw Object.assign(
          new Error(`Saved practice could not be loaded (${response.status}). Device records are unchanged.`),
          { status: response.status },
        )
      const body = await response.json()
      for (const doc of body.documents || []) {
        const record = Object.fromEntries(
          Object.entries(doc.fields || {}).map(([key, value]) => [
            key,
            plainValue(value as Parameters<typeof plainValue>[0]),
          ]),
        ) as SyncRecord
        if (
          record.schema !== 1 ||
          record.childId !== childId ||
          typeof record.key !== 'string' ||
          typeof record.payload !== 'string' ||
          !Number.isSafeInteger(record.generation) ||
          record.generation < 1 ||
          new TextEncoder().encode(record.payload).length > 700_000 ||
          !ownedPracticeRecord(record.key, record.payload, childId) ||
          typeof doc.updateTime !== 'string' ||
          doc.name.split('/').pop() !== (await recordId(record.key))
        )
          throw new Error('An online practice record failed validation. Nothing was replaced.')
        records.set(record.key, { record, updateTime: doc.updateTime })
        if (records.size > 500)
          throw new Error('This child’s online practice exceeds the safe loading limit. Device records are unchanged.')
      }
      next = body.nextPageToken || ''
    } while (next)
    return records
  }
  return {
    async sync(storage: StoragePort, childId: string, allowDownload: boolean | (() => boolean) = true) {
      if (!/^[\w-]+$/.test(childId)) throw new Error('Invalid child scope.')
      const remote = await list(childId)
      let workspace = practiceWorkspaceSyncAdapter(storage, childId)
      const remoteWorkspaceRecords = [...remote.keys()].filter((key) => isPracticeWorkspaceSyncKey(key, childId))
      if (!workspace && remoteWorkspaceRecords.length > 0 && storage.getItem(practiceWorkspaceKey(childId)) === null) {
        if (!(typeof allowDownload === 'function' ? allowDownload() : allowDownload))
          throw new Error(
            'Newer practice is available from another device. This open activity was not changed. Keep this page open to preserve unfinished work.',
          )
        practiceWorkspaceStorage(storage as Storage, childId)
        workspace = practiceWorkspaceSyncAdapter(storage, childId)
      }
      const keys = new Set(remote.keys())
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (key && ownedPracticeRecord(key, storage.getItem(key) || '', childId)) keys.add(key)
      }
      for (const key of workspace?.keys() || []) keys.add(key)
      // Propagate immutable retirements before a mutable checkpoint can block
      // on an ordinary two-device conflict. Old checkpoints remain history.
      for (const key of [...keys].sort(
        (a, b) =>
          Number(isRetirementKey(b, childId)) * 2 +
          Number(b === practiceWorkspaceKey(childId)) -
          Number(isRetirementKey(a, childId)) * 2 -
          Number(a === practiceWorkspaceKey(childId)),
      )) {
        const workspaceOuter = practiceWorkspaceKey(childId)
        const workspaceRemote = remote.get(workspaceOuter)?.record.payload
        const workspaceLocal = storage.getItem(workspaceOuter)
        const workspaceSyncRemote = remoteWorkspaceRecords.length > 0
        const workspaceSyncKey = key.startsWith(`${workspaceOuter}:record:`)
        const workspaceBaseKey = `family-beta-sync-base-v1:${options.familyId}:${childId}:${await recordId(workspaceOuter)}`
        const workspaceBase = storage.getItem(workspaceBaseKey)
        if (
          key === workspaceOuter &&
          workspace &&
          (workspaceSyncRemote ||
            workspaceRemote === undefined ||
            workspaceRemote === workspaceLocal ||
            workspaceRemote === workspaceBase)
        )
          continue
        if (workspaceSyncKey && !workspace)
          throw new Error('Saved practice could not be safely opened. Existing device records were preserved.')
        // The upgraded workspace owns its state and journals as one record.
        // Older sites may keep updating legacy keys; preserve them separately,
        // without letting those writes replace or block the upgraded workspace.
        if (legacyPracticeKey(key, childId) && storage.getItem(practiceWorkspaceKey(childId)) !== null) continue
        const id = await recordId(key)
        const baseKey = `family-beta-sync-base-v1:${options.familyId}:${childId}:${id}`
        let baseline = storage.getItem(baseKey)
        const local = workspaceSyncKey ? workspace?.read(key) || null : storage.getItem(key)
        const server = remote.get(key)
        const online = server?.record.payload ?? null
        const pendingKey = `${baseKey}:pending`
        // A successful upload can lose its response while another local trial
        // completes. Recognize that exact pending payload on the next readback.
        if (online !== null && online === storage.getItem(pendingKey)) {
          baseline = online
          acknowledgePractice(storage, baseKey, online)
        }
        if (online === local) {
          if (online !== null) acknowledgePractice(storage, baseKey, online)
          continue
        }
        if (local === null || (baseline !== null && local === baseline)) {
          if (online === null) throw new Error('An online record is missing. Existing device data was preserved.')
          // The request may outlive the activity/account that allowed it. Check
          // current ownership for every adoption, immediately before writing.
          if (!(typeof allowDownload === 'function' ? allowDownload() : allowDownload))
            throw new Error(
              'Newer practice is available from another device. This open activity was not changed. Keep this page open to preserve unfinished work.',
            )
          // No await between checking the local base and adopting the confirmed remote.
          if (workspaceSyncKey) workspace?.stage(key, online)
          else storage.setItem(key, online)
          acknowledgePractice(storage, baseKey, online)
          continue
        }
        if (online !== baseline) {
          const candidate = key.startsWith('family-beta-acquisition-v1:')
            ? acquisitionConflictCandidate
            : workspaceSyncKey
              ? workspaceConflictCandidate
              : () => null
          const localCandidate = candidate(local)
          const onlineCandidate = candidate(online || '')
          const winner =
            localCandidate && onlineCandidate && server
              ? chooseCheckpointWinner([localCandidate, onlineCandidate], { referenceNow: server.updateTime })
              : null
          if (!winner?.winner)
            throw new Error(
              'Practice changed on both devices. Both copies are preserved. Finish one reviewed response before continuing.',
            )
          if (winner.winner.id === onlineCandidate?.id) {
            if (!(typeof allowDownload === 'function' ? allowDownload() : allowDownload))
              throw new Error(
                'Newer practice is available from another device. This open activity was not changed. Keep this page open to preserve unfinished work.',
              )
            if (workspaceSyncKey) workspace?.stage(key, online!)
            else storage.setItem(key, online!)
            acknowledgePractice(storage, baseKey, online!)
            continue
          }
          // The local checkpoint has the newest trusted reviewed response. The
          // normal conditional upload below replaces the remote unfinished copy
          // without combining either checkpoint's phase or queue fields.
        }
        if (new TextEncoder().encode(local).length > 700_000)
          throw new Error(
            'This practice record is too large to sync safely. Download this device’s records; local data is preserved.',
          )
        const record: SyncRecord = {
          schema: 1,
          childId,
          key,
          payload: local,
          generation: (server?.record.generation || 0) + 1,
        }
        storage.setItem(pendingKey, local)
        const response = await request(':commit', {
          method: 'POST',
          body: JSON.stringify({
            writes: [
              {
                update: {
                  name: `projects/${options.projectId}/databases/(default)/documents/families/${options.familyId}/children/${childId}/betaPractice/${id}`,
                  fields: Object.fromEntries(Object.entries(record).map(([k, v]) => [k, documentValue(v)])),
                },
                currentDocument: server ? { updateTime: server.updateTime } : { exists: false },
              },
            ],
          }),
        })
        if (!response.ok)
          throw new Error(
            `Practice upload was not confirmed (${response.status}). Device records are preserved; retry syncing.`,
          )
        const confirm = await request(`${childId}/betaPractice/${id}`)
        const confirmed = await confirm.json()
        if (!confirm.ok || plainValue(confirmed.fields?.payload) !== local)
          throw new Error('Practice upload could not be verified. Keep this device’s records and retry.')
        // A child may answer another prompt while this request is pending. Only
        // acknowledge the uploaded snapshot; never replace the newer local state.
        acknowledgePractice(storage, baseKey, local)
      }
      workspace?.commit()
    },
  }
}

export function familyDeviceSyncRepository(familyId: string) {
  return createDeviceSyncRepository({
    projectId: firebaseConfig.projectId,
    familyId,
    token: getIdToken,
    appCheckHeaders: firebaseAppCheckHeaders,
  })
}
