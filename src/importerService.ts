import { saveDataset, writeImportLog, type ImportLog } from './firestoreClient'
import { importWeeklyDatasets, type ParserProfile, type PresentationLike, grade2DeckProfile, type ImportBatchOutcome } from './slidesImporter'

export type SyncOptions = { write?: boolean }

export async function syncPresentation(presentation: PresentationLike, existingDatasetIds: string[], profile: ParserProfile = grade2DeckProfile, options: SyncOptions = {}): Promise<ImportBatchOutcome> {
  const batch = importWeeklyDatasets(presentation, existingDatasetIds, profile)
  if (!options.write) return batch
  for (const dataset of batch.datasets) await saveDataset(dataset)
  for (const outcome of batch.outcomes) {
    const log: ImportLog = { id: `import-${Date.now()}-${profile.id}-${outcome.sourceSlideId || 'unknown'}`, datasetId: outcome.datasetId, sourceDeckId: profile.sourceDeckId, sourceSlideId: outcome.sourceSlideId, status: outcome.status, message: outcome.message, createdAt: new Date().toISOString() }
    try { await writeImportLog(log) } catch { /* Import logs must not hide a valid dataset result. */ }
  }
  return batch
}
