import { BETA_GRADES, type BetaProfile } from './model.ts'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type OfflineFamily = { schema: 1; uid: string; familyId: string; profiles: BetaProfile[]; ready: string[] }
export const offlineFamilyKey = (uid: string) => `family-beta-offline-access-v1:${uid}`
const identity = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,160}$/.test(value)

/** Local continuity only: never supplies an online credential or grants database access. */
export function readOfflineFamily(storage: Store, uid: string): OfflineFamily | null {
  try {
    const value = JSON.parse(storage.getItem(offlineFamilyKey(uid)) || 'null') as OfflineFamily | null
    if (
      !value ||
      value.schema !== 1 ||
      value.uid !== uid ||
      !identity(uid) ||
      !identity(value.familyId) ||
      !Array.isArray(value.profiles) ||
      value.profiles.length > 20 ||
      !Array.isArray(value.ready) ||
      value.profiles.some(
        (p) =>
          !p ||
          !identity(p.id) ||
          !BETA_GRADES.includes(p.grade) ||
          typeof p.nickname !== 'string' ||
          typeof p.active !== 'boolean',
      ) ||
      new Set(value.profiles.map((p) => p.id)).size !== value.profiles.length ||
      value.ready.some((id) => !value.profiles.some((p) => p.id === id && p.active))
    )
      return null
    return value
  } catch {
    return null
  }
}

/** Call only after confirmed family lookup; readiness is earned by a complete initial sync. */
export function rememberOfflineFamily(
  storage: Store,
  uid: string,
  familyId: string,
  profiles: BetaProfile[],
  readyChild?: string,
) {
  const previous = readOfflineFamily(storage, uid)
  const ready = profiles
    .filter(
      (p) =>
        p.active &&
        (p.id === readyChild ||
          (previous?.familyId === familyId &&
            previous.ready.includes(p.id) &&
            previous.profiles.some((old) => old.id === p.id && old.grade === p.grade))),
    )
    .map((p) => p.id)
  const raw = JSON.stringify({
    schema: 1,
    uid,
    familyId,
    profiles: profiles.map(({ id, grade, nickname, active }) => ({ id, grade, nickname, active })),
    ready,
  })
  storage.setItem(offlineFamilyKey(uid), raw)
  if (storage.getItem(offlineFamilyKey(uid)) !== raw)
    throw new Error('Offline family access could not be retained. Keep this page open until saving is confirmed.')
}

export function isConnectionFailure(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === 'TimeoutError' ||
      (error.name === 'TypeError' && /failed to fetch|networkerror|load failed/i.test(error.message)))
  )
}
