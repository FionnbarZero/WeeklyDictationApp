import type { AcquisitionTarget } from '../acquisition/contracts.ts'
import type {
  AcquisitionPersistenceContext,
  AcquisitionProgressIdentity,
} from '../acquisition/persistence/contracts.ts'
import {
  acquisitionDigest,
  acquisitionProgressionId,
  stableAcquisitionSerialization,
} from '../acquisition/persistence/identity.ts'

type Store = Pick<Storage, 'getItem' | 'setItem'>
const prefix = (childId: string) => `family-beta-activity:${childId}:lesson-retirement-v1:`
export const retirementKey = (childId: string, progressionId: string) => `${prefix(childId)}${progressionId}`
export const isRetirementKey = (key: string, childId: string) => key.startsWith(prefix(childId))

function marker(identity: AcquisitionProgressIdentity) {
  identity = envelopeIdentity(identity)
  const progressionId = acquisitionProgressionId(identity)
  return {
    schema: 1,
    identity,
    progressionId,
    nextActivityModule: `${identity.activityModule.split(':restart-')[0]}:restart-${acquisitionDigest(progressionId)}`,
  }
}

/** Immutable per-generation retirement. Concurrent confirmations produce the
 * same marker, while original reviewed records stay at their original keys. */
export function retireAcquisition(storage: Store, identity: AcquisitionProgressIdentity) {
  const value = marker(identity)
  const key = retirementKey(identity.childId, value.progressionId)
  const encoded = stableAcquisitionSerialization(value)
  const old = storage.getItem(key)
  if (old !== null && old !== encoded) throw new Error('The discard record conflicts. All saved work was preserved.')
  if (old === null) storage.setItem(key, encoded)
  if (storage.getItem(key) !== encoded)
    throw new Error('Discard could not be confirmed. The lesson remains saved; please retry.')
}

export function isAcquisitionRetired(storage: Pick<Storage, 'getItem'>, identity: AcquisitionProgressIdentity) {
  const expected = marker(identity)
  const raw = storage.getItem(retirementKey(identity.childId, expected.progressionId))
  if (raw === null) return false
  if (raw !== stableAcquisitionSerialization(expected))
    throw new Error('A saved discard record is invalid. Nothing was erased.')
  return true
}

export function currentAcquisitionContext<T extends AcquisitionTarget>(
  storage: Pick<Storage, 'getItem'>,
  context: AcquisitionPersistenceContext<T>,
) {
  let current = context
  for (let count = 0; count < 100; count++) {
    if (!isAcquisitionRetired(storage, current.identity)) return current
    current = {
      ...current,
      identity: { ...current.identity, activityModule: marker(current.identity).nextActivityModule },
    }
  }
  throw new Error('This lesson has too many retained restarts to open safely. All history is preserved.')
}

export function envelopeIdentity(value: AcquisitionProgressIdentity): AcquisitionProgressIdentity {
  return {
    childId: value.childId,
    datasetId: value.datasetId,
    grade: value.grade,
    schoolYear: value.schoolYear,
    activityModule: value.activityModule,
    tier: value.tier,
  }
}
