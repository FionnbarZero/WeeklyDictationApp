import { readFile } from 'node:fs/promises'
import { dryRunSummary, grade2DeckProfile, grade5DeckProfile, importWeeklyDatasets, type PresentationLike } from '../src/slidesImporter.ts'

type FirestoreValue = Record<string, unknown>

const args = process.argv.slice(2)
const inputPath = args.find((arg) => !arg.startsWith('--'))
const writeRequested = args.includes('--write')
const writeConfirmed = args.includes('--confirm-write')
const profile = args.includes('--grade-5') ? grade5DeckProfile : grade2DeckProfile
const existingIds = args.filter((arg) => arg.startsWith('--existing-id=')).map((arg) => arg.slice('--existing-id='.length))

if (!inputPath) {
  console.error('Usage: npm run import:slides -- path/to/google-slides-presentation.json [--write --confirm-write] [--existing-id=DATASET_ID]')
  process.exit(1)
}

const presentation = JSON.parse(await readFile(inputPath, 'utf8')) as PresentationLike
const batch = importWeeklyDatasets(presentation, existingIds, profile)
console.log(JSON.stringify(dryRunSummary(batch), null, 2))

if (!writeRequested) process.exit(batch.status === 'error' ? 2 : 0)
if (profile !== grade2DeckProfile) throw new Error('The trusted write path is restricted to the configured active Grade 2 deck.')
if (!writeConfirmed) throw new Error('No Firestore write occurred. Re-run with --confirm-write after reviewing the dry-run summary.')
if (batch.status === 'error') throw new Error('No Firestore write occurred because the inspected deck produced no valid datasets.')

const projectId = process.env.FIREBASE_PROJECT_ID
const accessToken = process.env.FIRESTORE_ACCESS_TOKEN
if (!projectId || !accessToken) throw new Error('No Firestore write occurred. Set FIREBASE_PROJECT_ID and FIRESTORE_ACCESS_TOKEN using a safe local authentication flow; do not create or commit service-account keys.')

function encodedValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  if (typeof value === 'string') return { stringValue: value }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodedValue) } }
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodedValue(item)])) } }
}

function fields(value: Record<string, unknown>) { return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodedValue(item)])) }
function documentName(path: string) { return `projects/${projectId}/databases/(default)/documents/${path.split('/').map(encodeURIComponent).join('/')}` }

const writes: Array<Record<string, unknown>> = []
for (const dataset of batch.datasets) {
  const { words, ...metadata } = dataset
  writes.push({ update: { name: documentName(`datasets/${dataset.id}`), fields: fields(metadata) } })
  for (const word of words) writes.push({ update: { name: documentName(`datasets/${dataset.id}/words/${word.id}`), fields: fields(word) } })
}
for (const outcome of batch.outcomes) writes.push({ update: { name: documentName(`importLogs/import-${Date.now()}-${profile.id}-${outcome.sourceSlideId || 'unknown'}`), fields: fields({ datasetId: outcome.datasetId, sourceDeckId: profile.sourceDeckId, sourceSlideId: outcome.sourceSlideId, status: outcome.status, message: outcome.message, createdAt: new Date().toISOString() }) } })

const response = await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:commit`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) })
const body = await response.json().catch(() => ({}))
if (!response.ok) throw new Error(`Firestore write failed after validation: ${body?.error?.message || response.statusText}`)
console.log(JSON.stringify({ written: true, datasetCount: batch.datasets.length, documentCount: writes.length }, null, 2))
