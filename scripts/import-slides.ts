import { readFile } from 'node:fs/promises'
import { listDatasetIds, writeImportBatch } from '../backend/firestore.ts'
import { dryRunSummary, grade2DeckProfile, grade5DeckProfile, isDuplicateOnlyBatch, validateAndClassifyPresentation, type PresentationLike } from '../src/slidesImporter.ts'

const args = process.argv.slice(2)
const inputPath = args.find((arg) => !arg.startsWith('--'))
const writeRequested = args.includes('--write')
const writeConfirmed = args.includes('--confirm-write')
const profile = args.includes('--grade-5') ? grade5DeckProfile : grade2DeckProfile
const suppliedExistingIds = args.filter((arg) => arg.startsWith('--existing-id=')).map((arg) => arg.slice('--existing-id='.length))

if (!inputPath) {
  console.error('Usage: npm run import:slides -- path/to/google-slides-presentation.json [--write --confirm-write] [--existing-id=DATASET_ID]')
  process.exit(1)
}

const presentation = JSON.parse(await readFile(inputPath, 'utf8')) as PresentationLike
let batch = validateAndClassifyPresentation(presentation, suppliedExistingIds, profile)
console.log(JSON.stringify(dryRunSummary(batch), null, 2))

if (!writeRequested) process.exit(batch.status === 'error' && !isDuplicateOnlyBatch(batch) ? 2 : 0)
if (profile !== grade2DeckProfile) throw new Error('The trusted write path is restricted to the configured active Grade 2 deck.')
if (!writeConfirmed) throw new Error('No Firestore write occurred. Re-run with --confirm-write after reviewing the dry-run summary.')
if (batch.status === 'error' && !isDuplicateOnlyBatch(batch)) throw new Error('No Firestore write occurred because the inspected deck produced no valid datasets.')

const projectId = process.env.FIREBASE_PROJECT_ID
const accessToken = process.env.FIRESTORE_ACCESS_TOKEN
if (!projectId || !accessToken) throw new Error('No Firestore write occurred. Set FIREBASE_PROJECT_ID and FIRESTORE_ACCESS_TOKEN using a safe local authentication flow; do not create or commit service-account keys.')

if (suppliedExistingIds.length === 0) {
  const existingIds = await listDatasetIds(projectId, accessToken)
  batch = validateAndClassifyPresentation(presentation, existingIds, profile)
  console.log(JSON.stringify({ duplicateCheck: dryRunSummary(batch) }, null, 2))
}
if (batch.status === 'error' && !isDuplicateOnlyBatch(batch)) throw new Error('No Firestore write occurred because the inspected deck produced no valid datasets.')

const writeSummary = await writeImportBatch(projectId, accessToken, batch)
console.log(JSON.stringify({ written: true, ...writeSummary }, null, 2))
