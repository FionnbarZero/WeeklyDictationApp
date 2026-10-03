import type { LocalBackupRestoreCapabilities } from '../application/backup/index.ts'
import {
  applyLocalRestoreTransaction,
  localRestoreValues,
  recoverInterruptedLocalRestore,
} from '../persistence/localRestoreJournal.ts'
import { readPendingAcquisitionJournal } from '../persistence/acquisitionPendingJournal.ts'
import { readPendingWarmupJournal } from '../persistence/warmup/pendingJournal.ts'

export function createBrowserLocalRestore(storage: Storage): LocalBackupRestoreCapabilities & {
  recoverInterruptedRestore: () => 'none' | 'replayed'
} {
  return {
    readPendingAcquisition: () => readPendingAcquisitionJournal(storage),
    readPendingWarmup: () => readPendingWarmupJournal(storage),
    recoverInterruptedRestore: () => recoverInterruptedLocalRestore(storage),
    commitRestore: (input) =>
      applyLocalRestoreTransaction({
        storage,
        after: localRestoreValues(input.snapshot),
        transactionId: input.transactionId,
        backupChecksum: input.backupChecksum,
        childId: input.childId,
        origin: input.origin,
        createdAt: input.createdAt,
      }),
  }
}
