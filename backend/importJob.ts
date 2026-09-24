import { fetchGooglePresentation, googleAccessToken } from './googleSlides.ts'
import { firestoreAccessToken, listDatasetIds, writeImportBatch } from './firestore.ts'
import { isDuplicateOnlyBatch, profileForDeckId, validateAndClassifyPresentation, type ImportBatchOutcome } from '../src/slidesImporter.ts'

export type ImportJobConfig = {
  deckId: string
  projectId: string
  googleOAuth: { clientId: string; clientSecret: string; refreshToken: string }
  writeEnabled: boolean
}

export type ImportJobDependencies = {
  googleAccessToken: typeof googleAccessToken
  fetchGooglePresentation: typeof fetchGooglePresentation
  listDatasetIds: typeof listDatasetIds
  writeImportBatch: typeof writeImportBatch
  firestoreAccessToken: typeof firestoreAccessToken
}

const defaults: ImportJobDependencies = { googleAccessToken, fetchGooglePresentation, listDatasetIds, writeImportBatch, firestoreAccessToken }

export type ImportJobResult = { batch: ImportBatchOutcome; written: boolean; writeSummary?: { written: number; datasetCount: number; documentCount: number } }

export async function runImportJob(config: ImportJobConfig, dependencies: ImportJobDependencies = defaults): Promise<ImportJobResult> {
  const profile = profileForDeckId(config.deckId)
  if (!profile) throw new Error('The requested deck is not registered as an active parser profile.')
  const slidesToken = await dependencies.googleAccessToken(config.googleOAuth)
  const presentation = await dependencies.fetchGooglePresentation(config.deckId, slidesToken)
  let firestoreToken: string | undefined
  let existingIds: string[] = []
  if (config.writeEnabled) {
    firestoreToken = await dependencies.firestoreAccessToken()
    existingIds = await dependencies.listDatasetIds(config.projectId, firestoreToken)
  }
  const batch = validateAndClassifyPresentation(presentation, existingIds, profile)
  if (!config.writeEnabled) return { batch, written: false }
  if (!firestoreToken) throw new Error('Firestore authorization was not established for the write path.')
  if (batch.status === 'error' && !isDuplicateOnlyBatch(batch)) return { batch, written: false }
  const writeSummary = await dependencies.writeImportBatch(config.projectId, firestoreToken, batch)
  return { batch, written: true, writeSummary }
}
