import { planSelectedChildRestore } from '../src/application/backup/selectedChildRestore.ts'
import {
  applyLocalRestoreTransaction,
  LOCAL_RESTORE_JOURNAL_KEY,
  LOCAL_RESTORE_TARGET_KEYS,
  localRestoreValues,
  type LocalRestoreStorage,
} from '../src/persistence/localRestoreJournal.ts'
import { previewVerifiedApplicationBackup } from '../src/persistence/applicationBackup.ts'

class MemoryStorage implements LocalRestoreStorage {
  readonly values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }
}

class OneTimeFailureStorage extends MemoryStorage {
  private writes = 0
  private failed = false

  override setItem(key: string, value: string) {
    this.writes += 1
    if (!this.failed && this.writes === 3) {
      this.failed = true
      throw new Error('Injected restore interruption.')
    }
    super.setItem(key, value)
  }
}

export type RestoreRehearsalReport = {
  checksum: string
  createdAt: string
  applicationVersion: string
  stateVersion: number
  datasetCount: number
  selectedChildCounts: {
    practiceRecords: number
    acquisitionRecords: number
    warmupRecords: number
    pendingRecovery: number
  }
  preservedOtherChildRecords: number
  previewWrites: 0
  interruptionRollback: 'passed'
  firstApply: 'applied'
  secondApply: 'idempotent'
  journalCleared: true
  exactStorageVerification: 'passed'
}

export async function rehearseVerifiedBackup(raw: string): Promise<RestoreRehearsalReport> {
  const preview = await previewVerifiedApplicationBackup(raw)
  const scope = preview.payload.scope
  await previewVerifiedApplicationBackup(raw, {
    expectedScope: {
      mode: scope.mode,
      grade: scope.grade,
      selectedChildId: scope.selectedChildId,
      origin: scope.origin,
    },
  })

  const backup = preview.payload.backup
  const plan = planSelectedChildRestore({
    current: {
      state: backup.state,
      pendingAcquisition: backup.pendingAcquisition,
      pendingWarmup: backup.pendingWarmup,
    },
    backup,
    childId: scope.selectedChildId,
  })
  const after = localRestoreValues(plan.snapshot)
  const transaction = {
    after,
    transactionId: `rehearsal-${preview.checksum.slice(0, 16)}`,
    backupChecksum: preview.checksum,
    childId: scope.selectedChildId,
    origin: scope.origin,
    createdAt: new Date().toISOString(),
  }

  const interrupted = new OneTimeFailureStorage()
  try {
    applyLocalRestoreTransaction({ storage: interrupted, ...transaction })
    throw new Error('The interruption rehearsal unexpectedly completed.')
  } catch (error) {
    if (!(error instanceof Error) || !/previous browser data was restored/i.test(error.message)) throw error
  }
  if (interrupted.getItem(LOCAL_RESTORE_JOURNAL_KEY) !== null) {
    throw new Error('The interrupted rehearsal left a restore journal behind.')
  }
  if (LOCAL_RESTORE_TARGET_KEYS.some((key) => interrupted.getItem(key) !== null)) {
    throw new Error('The interrupted rehearsal did not roll back every target key.')
  }

  const storage = new MemoryStorage()
  const firstApply = applyLocalRestoreTransaction({ storage, ...transaction })
  const secondApply = applyLocalRestoreTransaction({ storage, ...transaction })
  if (firstApply !== 'applied' || secondApply !== 'idempotent') {
    throw new Error('The restore did not produce the required applied-then-idempotent sequence.')
  }
  if (LOCAL_RESTORE_TARGET_KEYS.some((key) => storage.getItem(key) !== after[key])) {
    throw new Error('The restored storage values did not exactly match the verified plan.')
  }
  if (storage.getItem(LOCAL_RESTORE_JOURNAL_KEY) !== null) {
    throw new Error('The completed rehearsal left a restore journal behind.')
  }

  return {
    checksum: preview.checksum,
    createdAt: preview.summary.createdAt,
    applicationVersion: preview.summary.applicationVersion,
    stateVersion: preview.summary.stateVersion,
    datasetCount: preview.summary.datasetCount,
    selectedChildCounts: plan.report.after,
    preservedOtherChildRecords: plan.report.preservedOtherChildRecords,
    previewWrites: 0,
    interruptionRollback: 'passed',
    firstApply,
    secondApply,
    journalCleared: true,
    exactStorageVerification: 'passed',
  }
}
