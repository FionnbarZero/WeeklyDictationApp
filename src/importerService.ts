import { saveDataset, writeImportLog, type ImportLog } from './firestoreClient'
import { importLatestWeeklyDataset, type ParserProfile, type PresentationLike, grade5DeckProfile, type ImportOutcome } from './slidesImporter'

export async function syncPresentation(presentation: PresentationLike, existingDatasetIds: string[], profile: ParserProfile = grade5DeckProfile): Promise<ImportOutcome> {
  const outcome = importLatestWeeklyDataset(presentation, existingDatasetIds, profile)
  const log: ImportLog = { id: `import-${Date.now()}-${profile.id}`, datasetId: outcome.datasetId, sourceDeckId: profile.sourceDeckId, sourceSlideId: outcome.sourceSlideId, status: outcome.status, message: outcome.message, createdAt: new Date().toISOString() }
  if ((outcome.status === 'imported' || outcome.status === 'writing-workshop') && outcome.dataset) await saveDataset(outcome.dataset)
  try { await writeImportLog(log) } catch { /* Import logs must not hide a valid dataset result. */ }
  return outcome
}
